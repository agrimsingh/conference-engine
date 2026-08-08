import { getCloudflareEnv } from "@/lib/db/cloudflare";
import {
	isOneShotTemplate,
	renderMessageTemplate,
	type MessageTemplateContext,
	type MessageTemplateKey,
	type RenderedMessage,
} from "@/lib/domain/message-templates";

export type OutboundSendResult =
	| { ok: true; status: "sent" | "skipped"; providerId: string | null; messageId: string }
	| { ok: false; status: "failed"; error: string; messageId: string };

export type Attachment = {
	filename: string;
	content: string;
	contentType: string;
};

type ResendSuccess = {
	id?: string;
};

type ResendErrorBody = {
	message?: string;
	name?: string;
};

export async function sendTemplatedEmail(
	db: D1Database,
	args: {
		eventId: string;
		submissionId: string | null;
		templateKey: MessageTemplateKey;
		toEmail: string;
		context: MessageTemplateContext;
		/** Organizer-edited subject/body; bypasses the template renderer. */
		override?: RenderedMessage;
		attachments?: Attachment[];
		force?: boolean;
	},
): Promise<OutboundSendResult> {
	const toEmail = args.toEmail.trim().toLowerCase();
	const rendered =
		args.override ?? renderMessageTemplate(args.templateKey, args.context);
	const now = Date.now();
	const messageId = crypto.randomUUID();

	if (
		!args.force &&
		args.submissionId &&
		isOneShotTemplate(args.templateKey)
	) {
		const existing = await db
			.prepare(
				`SELECT id FROM outbound_messages
         WHERE submission_id = ? AND template_key = ? AND status = 'sent'
         LIMIT 1`,
			)
			.bind(args.submissionId, args.templateKey)
			.first<{ id: string }>();

		if (existing) {
			await db
				.prepare(
					`INSERT INTO outbound_messages (
            id, event_id, submission_id, template_key, to_email, subject,
            status, provider_id, error, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'skipped', NULL, 'already sent', ?)`,
				)
				.bind(
					messageId,
					args.eventId,
					args.submissionId,
					args.templateKey,
					toEmail,
					rendered.subject,
					now,
				)
				.run();
			return { ok: true, status: "skipped", providerId: null, messageId };
		}
	}

	const env = await getCloudflareEnv();
	const apiKey = env.RESEND_API_KEY;
	const fromEmail = env.RESEND_FROM_EMAIL || "team@65labs.org";

	if (!apiKey) {
		const error = "RESEND_API_KEY missing";
		await insertOutbound(db, {
			id: messageId,
			eventId: args.eventId,
			submissionId: args.submissionId,
			templateKey: args.templateKey,
			toEmail,
			subject: rendered.subject,
			status: "failed",
			providerId: null,
			error,
			createdAt: now,
		});
		return { ok: false, status: "failed", error, messageId };
	}

	const payload: Record<string, unknown> = {
		from: fromEmail,
		to: [toEmail],
		subject: rendered.subject,
		text: rendered.text,
	};

	if (args.attachments?.length) {
		payload.attachments = args.attachments.map((file) => ({
			filename: file.filename,
			content: utf8ToBase64(file.content),
			content_type: file.contentType,
		}));
	}

	try {
		const response = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});

		const bodyText = await response.text();
		let parsed: ResendSuccess | ResendErrorBody = {};
		try {
			parsed = JSON.parse(bodyText) as ResendSuccess | ResendErrorBody;
		} catch {
			parsed = { message: bodyText || `HTTP ${response.status}` };
		}

		if (!response.ok) {
			const error =
				("message" in parsed && typeof parsed.message === "string"
					? parsed.message
					: null) ?? `Resend HTTP ${response.status}`;
			await insertOutbound(db, {
				id: messageId,
				eventId: args.eventId,
				submissionId: args.submissionId,
				templateKey: args.templateKey,
				toEmail,
				subject: rendered.subject,
				status: "failed",
				providerId: null,
				error,
				createdAt: now,
			});
			return { ok: false, status: "failed", error, messageId };
		}

		const providerId =
			"id" in parsed && typeof parsed.id === "string" ? parsed.id : null;

		await insertOutbound(db, {
			id: messageId,
			eventId: args.eventId,
			submissionId: args.submissionId,
			templateKey: args.templateKey,
			toEmail,
			subject: rendered.subject,
			status: "sent",
			providerId,
			error: null,
			createdAt: now,
		});

		return { ok: true, status: "sent", providerId, messageId };
	} catch (error) {
		const message = error instanceof Error ? error.message : "send failed";
		await insertOutbound(db, {
			id: messageId,
			eventId: args.eventId,
			submissionId: args.submissionId,
			templateKey: args.templateKey,
			toEmail,
			subject: rendered.subject,
			status: "failed",
			providerId: null,
			error: message,
			createdAt: now,
		});
		return { ok: false, status: "failed", error: message, messageId };
	}
}

function utf8ToBase64(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

async function insertOutbound(
	db: D1Database,
	row: {
		id: string;
		eventId: string;
		submissionId: string | null;
		templateKey: string;
		toEmail: string;
		subject: string;
		status: "sent" | "failed" | "skipped";
		providerId: string | null;
		error: string | null;
		createdAt: number;
	},
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO outbound_messages (
        id, event_id, submission_id, template_key, to_email, subject,
        status, provider_id, error, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			row.id,
			row.eventId,
			row.submissionId,
			row.templateKey,
			row.toEmail,
			row.subject,
			row.status,
			row.providerId,
			row.error,
			row.createdAt,
		)
		.run();
}
