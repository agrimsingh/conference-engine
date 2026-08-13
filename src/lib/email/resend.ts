import { getAuthSecret, getCloudflareEnv } from "@/lib/db/cloudflare";
import { getEventById } from "@/lib/db/queries";
import { ensureRequiredMessageLink, renderEventMessageTemplate } from "./templates";
import { resolveEventReplyTo, templateUsesReplyTo } from "./reply-to";
import { hmacHash } from "@/lib/security/crypto";
import { fetchWithBoundedRetry } from "@/lib/security/fetch";
import {
	isOneShotTemplate,
	renderMessageTemplate,
	type MessageTemplateContext,
	type MessageTemplateKey,
	type RenderedMessage,
} from "@/lib/domain/message-templates";

export type OutboundSendResult =
	| { ok: true; status: "sent" | "skipped"; providerId: string | null; messageId: string }
	| { ok: false; status: "failed"; error: string; messageId: string; failureKind: "confirmed" | "ambiguous" };

export type Attachment = {
	filename: string;
	content: string;
	contentType: string;
};

export type EmailDeliveryRuntime = {
	authSecret: string;
	resendApiKey?: string;
	resendFromEmail?: string;
};

export type AuthEmailSendResult =
	| { ok: true; providerId?: string }
	| { ok: false; error: string; failureKind: "confirmed" | "ambiguous" };

type ResendSuccess = { id?: string };
type ResendErrorBody = { message?: string; name?: string };
type DeliveryState = "reserved" | "sending" | "provider_accepted" | "sent" | "failed";

type DeliveryRow = {
	delivery_key: string;
	status: DeliveryState;
	provider_id: string | null;
	lease_expires_at: number | null;
};

type DeliveryEnvelopeRow = {
	delivery_key: string;
	event_id: string;
	submission_id: string | null;
	template_key: MessageTemplateKey;
	to_email: string;
	subject: string;
	text_body: string;
	attachments_json: string;
};

const SEND_LEASE_MS = 2 * 60_000;

/**
 * A delivery key identifies the exact logical email, not an attempt. It is an
 * HMAC so D1 and Resend never receive a recoverable recipient/payload tuple.
 */
export async function deterministicDeliveryKey(
	secret: string,
	args: {
		eventId: string;
		submissionId: string | null;
		templateKey: string;
		toEmail: string;
		subject: string;
		text: string;
		attachments?: Attachment[];
		deliveryScope?: string;
	},
): Promise<string> {
	return hmacHash(secret, JSON.stringify({
		v: 1,
		eventId: args.eventId,
		submissionId: args.submissionId,
		templateKey: args.templateKey,
		toEmail: args.toEmail.trim().toLowerCase(),
		subject: args.subject,
		text: args.text,
		attachments: args.attachments?.map((file) => ({
			filename: file.filename,
			contentType: file.contentType,
			content: file.content,
		})) ?? [],
		deliveryScope: args.deliveryScope ?? null,
	}));
}

/**
 * Atomically claim a delivery before provider I/O. A crashed worker leaves a
 * short lease; a later retry reuses the exact same provider idempotency key.
 */
export async function reserveEmailDelivery(
	db: D1Database,
	args: {
		deliveryKey: string;
		eventId: string;
		submissionId: string | null;
		templateKey: string;
		toEmail: string;
		subject: string;
		now?: number;
	},
): Promise<{ action: "send" | "sent" | "in_flight"; providerId: string | null }> {
	const now = args.now ?? Date.now();
	const leaseExpiresAt = now + SEND_LEASE_MS;
	const inserted = await db.prepare(
		`INSERT INTO email_deliveries (
       delivery_key, event_id, submission_id, template_key, to_email, subject,
       status, attempt_count, lease_expires_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'sending', 1, ?, ?, ?)
     ON CONFLICT(delivery_key) DO NOTHING
     RETURNING delivery_key, status, provider_id, lease_expires_at`,
	).bind(
		args.deliveryKey,
		args.eventId,
		args.submissionId,
		args.templateKey,
		args.toEmail,
		args.subject,
		leaseExpiresAt,
		now,
		now,
	).first<DeliveryRow>();
	if (inserted) return { action: "send", providerId: null };

	const existing = await db.prepare(
		`SELECT delivery_key, status, provider_id, lease_expires_at
       FROM email_deliveries WHERE delivery_key = ?`,
	).bind(args.deliveryKey).first<DeliveryRow>();
	if (!existing) throw new Error("Email reservation disappeared");
	if (existing.status === "sent") return { action: "sent", providerId: existing.provider_id };

	// Provider acceptance is durable enough to finish locally without another
	// provider call. This is the recovery path for a failed final DB write.
	if (existing.status === "provider_accepted") {
		await db.prepare(
			`UPDATE email_deliveries
       SET status = 'sent', sent_at = COALESCE(sent_at, ?), updated_at = ?, lease_expires_at = NULL
       WHERE delivery_key = ? AND status = 'provider_accepted'`,
		).bind(now, now, args.deliveryKey).run();
		return { action: "sent", providerId: existing.provider_id };
	}

	const claimed = await db.prepare(
		`UPDATE email_deliveries
       SET status = 'sending', attempt_count = attempt_count + 1, error = NULL, failure_kind = NULL,
           lease_expires_at = ?, updated_at = ?
       WHERE delivery_key = ?
         AND (status IN ('reserved', 'failed') OR (status = 'sending' AND COALESCE(lease_expires_at, 0) <= ?))
       RETURNING provider_id`,
	).bind(leaseExpiresAt, now, args.deliveryKey, now).first<{ provider_id: string | null }>();
	if (claimed) return { action: "send", providerId: claimed.provider_id };
	return { action: "in_flight", providerId: existing.provider_id };
}

export async function markEmailDeliveryFailed(
	db: D1Database,
	args: { deliveryKey: string; error: string; now?: number },
): Promise<void> {
	const now = args.now ?? Date.now();
	await db.prepare(
	`UPDATE email_deliveries
     SET status = 'failed', error = ?, failure_kind = 'confirmed', lease_expires_at = NULL, updated_at = ?
     WHERE delivery_key = ? AND status = 'sending'`,
	).bind(args.error.slice(0, 1_000), now, args.deliveryKey).run();
}

/** Keep a provider-ambiguous attempt claimed so a retry reuses its key. */
export async function markEmailDeliveryAmbiguous(
	db: D1Database,
	args: { deliveryKey: string; error: string; now?: number },
): Promise<void> {
	const now = args.now ?? Date.now();
	await db.prepare(
		`UPDATE email_deliveries
     SET error = ?, updated_at = ?
     WHERE delivery_key = ? AND status IN ('sending', 'provider_accepted')`,
	).bind(args.error.slice(0, 1_000), now, args.deliveryKey).run();
}

export async function markEmailDeliveryAccepted(
	db: D1Database,
	args: { deliveryKey: string; providerId: string | null; now?: number },
): Promise<void> {
	const now = args.now ?? Date.now();
	await db.prepare(
		`UPDATE email_deliveries
     SET status = 'provider_accepted', provider_id = COALESCE(?, provider_id),
         provider_accepted_at = COALESCE(provider_accepted_at, ?), updated_at = ?
     WHERE delivery_key = ? AND status = 'sending'`,
	).bind(args.providerId, now, now, args.deliveryKey).run();
}

export async function finalizeEmailDelivery(
	db: D1Database,
	args: { deliveryKey: string; now?: number },
): Promise<void> {
	const now = args.now ?? Date.now();
	await db.prepare(
		`UPDATE email_deliveries
     SET status = 'sent', sent_at = COALESCE(sent_at, ?), lease_expires_at = NULL, updated_at = ?
     WHERE delivery_key = ? AND status = 'provider_accepted'`,
	).bind(now, now, args.deliveryKey).run();
}

export async function sendTemplatedEmail(
	db: D1Database,
	args: {
		eventId: string;
		submissionId: string | null;
		templateKey: MessageTemplateKey;
		toEmail: string;
		context: MessageTemplateContext;
		override?: RenderedMessage;
		attachments?: Attachment[];
		/** Distinguishes intentional repeatable windows, such as daily reminders. */
		deliveryScope?: string;
		/** Supply Worker bindings directly for cron-safe callers. */
		runtime?: EmailDeliveryRuntime;
		/** A caller that has atomically claimed a domain-specific send can supply its durable key. */
		deliveryKey?: string;
		/** Kept for callers; payload-specific delivery keys still dedupe retries. */
		force?: boolean;
	},
): Promise<OutboundSendResult> {
	const toEmail = args.toEmail.trim().toLowerCase();
	// A demo must remain completely inert. This guard lives at the shared
	// outbound boundary so a newly-added caller cannot accidentally reserve a
	// delivery row or contact the provider for sample data.
	const event = await getEventById(db, args.eventId);
	if (event?.mode === "demo") {
		return { ok: true, status: "skipped", providerId: null, messageId: `demo:${args.eventId}:${args.templateKey}` };
	}
	const rendered = ensureRequiredMessageLink(args.templateKey, args.override ?? await renderEventMessageTemplate(
		db,
		args.eventId,
		args.templateKey,
		args.context,
	), args.context);
	// Preserve the pre-migration one-shot history. New sends use the durable
	// reservation below; old audit rows cannot be assigned a payload hash safely.
	if (!args.force && args.submissionId && isOneShotTemplate(args.templateKey)) {
		const historic = await db.prepare(
			`SELECT provider_id FROM outbound_messages
       WHERE submission_id = ? AND template_key = ? AND status = 'sent' LIMIT 1`,
		).bind(args.submissionId, args.templateKey).first<{ provider_id: string | null }>();
		if (historic) return { ok: true, status: "skipped", providerId: historic.provider_id, messageId: `legacy:${args.submissionId}:${args.templateKey}` };
	}
	const runtime = args.runtime ?? await loadDeliveryRuntime();
	if (!runtime.authSecret) {
		return { ok: false, status: "failed", error: "AUTH_SECRET missing", messageId: "unreserved", failureKind: "confirmed" };
	}
	const deliveryKey = args.deliveryKey ?? await deterministicDeliveryKey(runtime.authSecret, {
		eventId: args.eventId,
		submissionId: args.submissionId,
		templateKey: args.templateKey,
		toEmail,
		subject: rendered.subject,
		text: rendered.text,
		attachments: args.attachments,
		deliveryScope: args.deliveryScope,
	});
	const reservation = await reserveEmailDelivery(db, {
		deliveryKey,
		eventId: args.eventId,
		submissionId: args.submissionId,
		templateKey: args.templateKey,
		toEmail,
		subject: rendered.subject,
	});
	if (reservation.action !== "send") {
		return { ok: true, status: "skipped", providerId: reservation.providerId, messageId: deliveryKey };
	}
	try {
		await persistDeliveryEnvelope(db, {
			deliveryKey,
			eventId: args.eventId,
			submissionId: args.submissionId,
			templateKey: args.templateKey,
			toEmail,
			subject: rendered.subject,
			text: rendered.text,
			attachments: args.attachments ?? [],
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Could not persist delivery envelope";
		await markEmailDeliveryFailed(db, { deliveryKey, error: message });
		return { ok: false, status: "failed", error: message, messageId: deliveryKey, failureKind: "confirmed" };
	}
	const replyTo = templateUsesReplyTo(args.templateKey)
		? await resolveEventReplyTo(db, args.eventId)
		: null;
	return sendReservedEnvelope(db, {
		deliveryKey,
		toEmail,
		subject: rendered.subject,
		text: rendered.text,
		attachments: args.attachments ?? [],
		replyTo,
		runtime,
	});
}

async function sendReservedEnvelope(
	db: D1Database,
	args: {
		deliveryKey: string;
		toEmail: string;
		subject: string;
		text: string;
		attachments: Attachment[];
		replyTo?: string | null;
		runtime: EmailDeliveryRuntime;
	},
): Promise<OutboundSendResult> {
	const apiKey = args.runtime.resendApiKey;
	const fromEmail = args.runtime.resendFromEmail || "team@65labs.org";
	if (!apiKey) {
		const error = "RESEND_API_KEY missing";
		await markEmailDeliveryFailed(db, { deliveryKey: args.deliveryKey, error });
		return { ok: false, status: "failed", error, messageId: args.deliveryKey, failureKind: "confirmed" };
	}

	const payload: Record<string, unknown> = {
		from: fromEmail,
		to: [args.toEmail],
		subject: args.subject,
		text: args.text,
	};
	if (args.replyTo) payload.reply_to = args.replyTo;
	if (args.attachments.length) {
		payload.attachments = args.attachments.map((file) => ({
			filename: file.filename,
			content: utf8ToBase64(file.content),
			content_type: file.contentType,
		}));
	}

	let response: Response;
	try {
		response = await fetchWithBoundedRetry("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
				"Idempotency-Key": args.deliveryKey,
			},
			body: JSON.stringify(payload),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "send failed";
		await markEmailDeliveryAmbiguous(db, { deliveryKey: args.deliveryKey, error: message });
		return { ok: false, status: "failed", error: message, messageId: args.deliveryKey, failureKind: "ambiguous" };
	}
	try {
		const bodyText = await response.text();
		const parsed = parseProviderResponse(bodyText, response.status);
		if (!response.ok) {
			await markEmailDeliveryFailed(db, { deliveryKey: args.deliveryKey, error: parsed.error });
			return { ok: false, status: "failed", error: parsed.error, messageId: args.deliveryKey, failureKind: "confirmed" };
		}
		await markEmailDeliveryAccepted(db, { deliveryKey: args.deliveryKey, providerId: parsed.providerId });
		await finalizeEmailDelivery(db, { deliveryKey: args.deliveryKey });
		return { ok: true, status: "sent", providerId: parsed.providerId, messageId: args.deliveryKey };
	} catch (error) {
		const message = error instanceof Error ? error.message : "delivery finalization failed";
		await markEmailDeliveryAmbiguous(db, { deliveryKey: args.deliveryKey, error: message });
		return { ok: false, status: "failed", error: message, messageId: args.deliveryKey, failureKind: "ambiguous" };
	}
}

async function persistDeliveryEnvelope(
	db: D1Database,
	args: { deliveryKey: string; eventId: string; submissionId: string | null; templateKey: MessageTemplateKey; toEmail: string; subject: string; text: string; attachments: Attachment[] },
): Promise<void> {
	await db.prepare(
		`INSERT OR IGNORE INTO email_delivery_envelopes (
			delivery_key, event_id, submission_id, template_key, to_email, subject, text_body, attachments_json, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).bind(args.deliveryKey, args.eventId, args.submissionId, args.templateKey, args.toEmail, args.subject, args.text, JSON.stringify(args.attachments), Date.now()).run();
}

/** Replays the persisted envelope using the original Resend idempotency key. */
export async function retryEmailDelivery(
	db: D1Database,
	args: { eventId: string; deliveryKey: string; runtime?: EmailDeliveryRuntime },
): Promise<OutboundSendResult | null> {
	const envelope = await db.prepare(
		`SELECT * FROM email_delivery_envelopes WHERE delivery_key = ? AND event_id = ?`,
	).bind(args.deliveryKey, args.eventId).first<DeliveryEnvelopeRow>();
	if (!envelope) return null;
	let attachments: Attachment[];
	try {
		const parsed: unknown = JSON.parse(envelope.attachments_json);
		attachments = Array.isArray(parsed) ? parsed.filter((value): value is Attachment => typeof value === "object" && value !== null && typeof (value as Attachment).filename === "string" && typeof (value as Attachment).content === "string" && typeof (value as Attachment).contentType === "string") : [];
	} catch { return { ok: false, status: "failed", error: "Stored attachment metadata is invalid", messageId: envelope.delivery_key, failureKind: "confirmed" }; }
	const reservation = await reserveEmailDelivery(db, {
		deliveryKey: envelope.delivery_key, eventId: envelope.event_id, submissionId: envelope.submission_id,
		templateKey: envelope.template_key, toEmail: envelope.to_email, subject: envelope.subject,
	});
	if (reservation.action !== "send") return { ok: true, status: "skipped", providerId: reservation.providerId, messageId: envelope.delivery_key };
	const runtime = args.runtime ?? await loadDeliveryRuntime();
	if (!runtime.authSecret) return { ok: false, status: "failed", error: "AUTH_SECRET missing", messageId: envelope.delivery_key, failureKind: "confirmed" };
	const replyTo = templateUsesReplyTo(envelope.template_key)
		? await resolveEventReplyTo(db, envelope.event_id)
		: null;
	return sendReservedEnvelope(db, {
		deliveryKey: envelope.delivery_key,
		toEmail: envelope.to_email,
		subject: envelope.subject,
		text: envelope.text_body,
		attachments,
		replyTo,
		runtime,
	});
}

async function loadDeliveryRuntime(): Promise<EmailDeliveryRuntime> {
	const [env, authSecret] = await Promise.all([getCloudflareEnv(), getAuthSecret()]);
	return {
		authSecret,
		resendApiKey: env.RESEND_API_KEY,
		resendFromEmail: env.RESEND_FROM_EMAIL,
	};
}

/** Auth links use the challenge hash as the provider key and have no event row. */
export async function sendAuthEmail(args: {
	toEmail: string;
	templateKey: Extract<MessageTemplateKey, "organizer_magic_link" | "organizer_invite" | "portal_magic_link">;
	context: MessageTemplateContext;
	idempotencyKey: string;
}): Promise<AuthEmailSendResult> {
	const toEmail = args.toEmail.trim().toLowerCase();
	const rendered = renderMessageTemplate(args.templateKey, args.context);
	const env = await getCloudflareEnv();
	if (!env.RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY missing", failureKind: "confirmed" };
	try {
		const response = await fetchWithBoundedRetry("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.RESEND_API_KEY}`,
				"Content-Type": "application/json",
				"Idempotency-Key": args.idempotencyKey,
			},
			body: JSON.stringify({ from: env.RESEND_FROM_EMAIL || "team@65labs.org", to: [toEmail], subject: rendered.subject, text: rendered.text }),
		});
		const parsed = parseProviderResponse(await response.text(), response.status);
		return response.ok
			? { ok: true, providerId: parsed.providerId ?? undefined }
			: { ok: false, error: parsed.error, failureKind: "confirmed" };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : "send failed", failureKind: "ambiguous" };
	}
}

function parseProviderResponse(bodyText: string, status: number): { providerId: string | null; error: string } {
	let parsed: ResendSuccess | ResendErrorBody = {};
	try { parsed = JSON.parse(bodyText) as ResendSuccess | ResendErrorBody; }
	catch { parsed = { message: bodyText || `Resend HTTP ${status}` }; }
	return {
		providerId: "id" in parsed && typeof parsed.id === "string" ? parsed.id : null,
		error: "message" in parsed && typeof parsed.message === "string" ? parsed.message : `Resend HTTP ${status}`,
	};
}

function utf8ToBase64(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}
