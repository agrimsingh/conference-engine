import {
	getEventById,
	getPersonById,
	getSpeakerByConfirmTokenHash,
	getSubmissionById,
	getSubmissionSpeakerById,
	listSpeakersForSubmission,
} from "@/lib/db/queries";
import type { SubmissionSpeakerRow } from "@/lib/db/types";
import { isPostAcceptance, MAX_CO_SPEAKERS } from "@/lib/domain";
import { renderMessageTemplate } from "@/lib/domain/message-templates";
import { titleFromAnswersJson } from "@/lib/email/notify";
import { deterministicDeliveryKey, sendTemplatedEmail, type EmailDeliveryRuntime, type OutboundSendResult } from "@/lib/email/resend";
import { getAuthSecret } from "@/lib/db/cloudflare";
import { hmacHash } from "@/lib/security/crypto";
import {
	ensureTaskTemplates,
	materializeAcceptedSpeaker,
} from "./materialize";

/**
 * Co-speaker invites and confirmation.
 *
 * The raw token only ever lives in the invite email; we store its SHA-256
 * hash. The token is deterministically derived from AUTH_SECRET plus a
 * non-secret claim generation, so recovery uses the same live link unless a
 * provider has explicitly rejected the prior delivery.
 */

export type CoSpeakerActionResult =
	| { ok: true; speaker: SubmissionSpeakerRow; spawnedTaskKeys: string[] }
	| { ok: false; error: string; status: number };

export type InviteResult =
	| {
			ok: true;
			speakerId: string;
			confirmUrl: string;
			declineUrl: string;
			email: OutboundSendResult;
	  }
	| { ok: false; error: string; status: number };

function bufferToBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function hashConfirmToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(token),
	);
	return bufferToBase64Url(new Uint8Array(digest));
}

export function coSpeakerLinkUrls(
	origin: string,
	token: string,
): { confirmUrl: string; declineUrl: string } {
	return {
		confirmUrl: `${origin}/co-speaker/${token}?intent=confirm`,
		declineUrl: `${origin}/co-speaker/${token}?intent=decline`,
	};
}

/**
 * Claim a stable token and email the confirm/decline links. Repairs reuse the
 * same generation; only a confirmed provider failure or explicit admin resend
 * rotates it.
 */
export async function inviteCoSpeaker(
	db: D1Database,
	args: { speakerId: string; origin: string; runtime?: EmailDeliveryRuntime; mode?: "initial" | "repair" | "resend" },
): Promise<InviteResult> {
	const speaker = await getSubmissionSpeakerById(db, args.speakerId);
	if (!speaker) {
		return { ok: false, error: "Speaker not found", status: 404 };
	}
	if (speaker.status === "removed") {
		return { ok: false, error: "Speaker was removed", status: 409 };
	}
	if (speaker.status === "confirmed") {
		return { ok: false, error: "Speaker already confirmed", status: 409 };
	}
	if (args.mode !== "resend" && speaker.confirm_token_hash) {
		const claimed = await db.prepare("SELECT 1 FROM co_speaker_invitation_claims WHERE speaker_id = ?").bind(speaker.id).first<{ 1: number }>();
		if (!claimed) return { ok: false, error: "Existing invitation is already active", status: 409 };
	}

	const submission = await getSubmissionById(db, speaker.submission_id);
	if (!submission) {
		return { ok: false, error: "Submission not found", status: 404 };
	}
	const event = await getEventById(db, submission.event_id);
	if (!event) {
		return { ok: false, error: "Event not found", status: 404 };
	}

	const authSecret = args.runtime?.authSecret ?? await getAuthSecret();
	if (!authSecret) {
		return { ok: false, error: "AUTH_SECRET missing", status: 500 };
	}
	const claim = await claimCoSpeakerInvitation(db, {
		speaker,
		eventId: event.id,
		submissionId: submission.id,
		eventName: event.name,
		title: titleFromAnswersJson(submission.answers_json),
		origin: args.origin,
		secret: authSecret,
		mode: args.mode ?? "repair",
	});
	if (!claim) return { ok: false, error: "Invitation was updated concurrently; retry", status: 409 };
	const { token, rendered, deliveryKey } = claim;
	const tokenHash = await hashConfirmToken(token);
	const now = Date.now();

	await db
		.prepare(
			`UPDATE submission_speakers
	       SET status = 'pending', confirm_token_hash = ?, invited_at = COALESCE(invited_at, ?)
	       WHERE id = ?
	         AND EXISTS (
	           SELECT 1 FROM co_speaker_invitation_claims
	           WHERE speaker_id = submission_speakers.id AND generation = ? AND delivery_key = ?
	         )`,
		)
		.bind(tokenHash, now, speaker.id, claim.generation, deliveryKey)
		.run();

	const { confirmUrl, declineUrl } = coSpeakerLinkUrls(args.origin, token);

	const email = await sendTemplatedEmail(db, {
		eventId: event.id,
		submissionId: submission.id,
		templateKey: "co_speaker_invite",
		toEmail: speaker.email,
		context: claim.context,
		override: rendered,
		deliveryKey,
		runtime: args.runtime,
		force: true,
	});

	return { ok: true, speakerId: speaker.id, confirmUrl, declineUrl, email };
}

/** Invite every pending co-speaker of a submission (used right after CFP submit). */
export async function sendPendingInvitesForSubmission(
	db: D1Database,
	args: { submissionId: string; origin: string },
): Promise<InviteResult[]> {
	const speakers = await listSpeakersForSubmission(db, args.submissionId);
	const results: InviteResult[] = [];
	for (const speaker of speakers) {
		if (speaker.status !== "pending") continue;
		// 0014 has no raw token for historical rows. Leave their already-issued
		// legacy link intact; an organizer can deliberately resend to rotate it.
		if (speaker.confirm_token_hash) {
			const claim = await db.prepare("SELECT 1 FROM co_speaker_invitation_claims WHERE speaker_id = ?").bind(speaker.id).first<{ 1: number }>();
			if (!claim) continue;
		}
		results.push(await inviteCoSpeaker(db, { speakerId: speaker.id, origin: args.origin, mode: "repair" }));
	}
	return results;
}

type CoSpeakerClaim = {
	generation: number;
	deliveryKey: string;
	token: string;
	rendered: ReturnType<typeof renderMessageTemplate>;
	context: { eventName: string; submitterName: string; title: string; confirmUrl: string; declineUrl: string };
};

async function claimCoSpeakerInvitation(
	db: D1Database,
	args: {
		speaker: SubmissionSpeakerRow;
		eventId: string;
		submissionId: string;
		eventName: string;
		title: string;
		origin: string;
		secret: string;
		mode: "initial" | "repair" | "resend";
	},
): Promise<CoSpeakerClaim | null> {
	for (let attempt = 0; attempt < 4; attempt += 1) {
		const existing = await db.prepare(
			`SELECT c.generation, c.delivery_key, d.status AS delivery_status, d.failure_kind
			 FROM co_speaker_invitation_claims c
			 LEFT JOIN email_deliveries d ON d.delivery_key = c.delivery_key
			 WHERE c.speaker_id = ?`,
		).bind(args.speaker.id).first<{ generation: number; delivery_key: string; delivery_status: string | null; failure_kind: string | null }>();
		if (existing) {
			if ((existing.delivery_status === "failed" && existing.failure_kind === "confirmed") || (args.mode === "resend" && existing.delivery_status === "sent")) {
				const next = await buildCoSpeakerClaim(args, existing.generation + 1);
				const tokenHash = await hashConfirmToken(next.token);
				const changed = await db.batch([
					db.prepare(
					`UPDATE co_speaker_invitation_claims
					 SET generation = ?, delivery_key = ?, updated_at = ?
					 WHERE speaker_id = ? AND generation = ? AND delivery_key = ?
					   AND EXISTS (
					     SELECT 1 FROM email_deliveries
					     WHERE delivery_key = co_speaker_invitation_claims.delivery_key
					       AND ((status = 'failed' AND failure_kind = 'confirmed') OR (? = 1 AND status = 'sent'))
					   )`,
					).bind(next.generation, next.deliveryKey, Date.now(), args.speaker.id, existing.generation, existing.delivery_key, args.mode === "resend" ? 1 : 0),
					db.prepare(
						`UPDATE submission_speakers
						 SET status = 'pending', confirm_token_hash = ?, invited_at = ?
						 WHERE id = ?
						   AND EXISTS (
						     SELECT 1 FROM co_speaker_invitation_claims
						     WHERE speaker_id = submission_speakers.id AND generation = ? AND delivery_key = ?
						   )`,
					).bind(tokenHash, Date.now(), args.speaker.id, next.generation, next.deliveryKey),
				]);
				if ((changed[0]?.meta.changes ?? 0) === 1) return next;
				continue;
			}
			return buildCoSpeakerClaim(args, existing.generation, existing.delivery_key);
		}

		const first = await buildCoSpeakerClaim(args, 1);
		const inserted = await db.prepare(
			`INSERT INTO co_speaker_invitation_claims (speaker_id, generation, delivery_key, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?) ON CONFLICT(speaker_id) DO NOTHING`,
		).bind(args.speaker.id, first.generation, first.deliveryKey, Date.now(), Date.now()).run();
		if ((inserted.meta.changes ?? 0) === 1) return first;
	}
	return null;
}

async function buildCoSpeakerClaim(
	args: {
		speaker: SubmissionSpeakerRow; eventId: string; submissionId: string; eventName: string; title: string; origin: string; secret: string; mode: "initial" | "repair" | "resend";
	},
	generation: number,
	existingDeliveryKey?: string,
): Promise<CoSpeakerClaim> {
	const token = `co1.${generation}.${await hmacHash(args.secret, `co-speaker:${args.speaker.id}:${generation}`)}`;
	const { confirmUrl, declineUrl } = coSpeakerLinkUrls(args.origin, token);
	const context = {
		eventName: args.eventName,
		submitterName: args.speaker.name || "there",
		title: args.title,
		confirmUrl,
		declineUrl,
	};
	const rendered = renderMessageTemplate("co_speaker_invite", context);
	return {
		generation,
		token,
		context,
		rendered,
		deliveryKey: existingDeliveryKey ?? await deterministicDeliveryKey(args.secret, {
			eventId: args.eventId,
			submissionId: args.submissionId,
			templateKey: "co_speaker_invite",
			toEmail: args.speaker.email,
			subject: rendered.subject,
			text: rendered.text,
		}),
	};
}

export async function getSpeakerByConfirmToken(
	db: D1Database,
	token: string,
): Promise<SubmissionSpeakerRow | null> {
	if (!token) return null;
	const tokenHash = await hashConfirmToken(token);
	return getSpeakerByConfirmTokenHash(db, tokenHash);
}

/**
 * Confirm a co-speaker. If the submission is already accepted, materialize
 * the person and spawn their onboarding tasks now.
 */
export async function confirmCoSpeaker(
	db: D1Database,
	speakerId: string,
): Promise<CoSpeakerActionResult> {
	const speaker = await getSubmissionSpeakerById(db, speakerId);
	if (!speaker) {
		return { ok: false, error: "Speaker not found", status: 404 };
	}
	if (speaker.status === "removed") {
		return { ok: false, error: "Speaker was removed by organizers", status: 409 };
	}
	if (speaker.status === "confirmed") {
		return { ok: true, speaker, spawnedTaskKeys: [] };
	}

	const now = Date.now();
	await db
		.prepare(
			`UPDATE submission_speakers
       SET status = 'confirmed', confirmed_at = ?
       WHERE id = ?`,
		)
		.bind(now, speaker.id)
		.run();

	const submission = await getSubmissionById(db, speaker.submission_id);
	let spawnedTaskKeys: string[] = [];
	if (submission && isPostAcceptance(submission.status)) {
		await ensureTaskTemplates(db, submission.event_id);
		const materialized = await materializeAcceptedSpeaker(
			db,
			{
				eventId: submission.event_id,
				submissionId: submission.id,
				speaker,
			},
			now,
		);
		spawnedTaskKeys = materialized.spawnedTaskKeys;
	}

	const updated = await getSubmissionSpeakerById(db, speaker.id);
	if (!updated) {
		return { ok: false, error: "Speaker missing after update", status: 500 };
	}
	return { ok: true, speaker: updated, spawnedTaskKeys };
}

export async function declineCoSpeaker(
	db: D1Database,
	speakerId: string,
): Promise<CoSpeakerActionResult> {
	const speaker = await getSubmissionSpeakerById(db, speakerId);
	if (!speaker) {
		return { ok: false, error: "Speaker not found", status: 404 };
	}
	if (speaker.status === "removed") {
		return { ok: false, error: "Speaker was removed by organizers", status: 409 };
	}
	if (speaker.status === "declined") {
		return { ok: true, speaker, spawnedTaskKeys: [] };
	}

	await db
		.prepare(
			`UPDATE submission_speakers
       SET status = 'declined'
       WHERE id = ?`,
		)
		.bind(speaker.id)
		.run();

	const updated = await getSubmissionSpeakerById(db, speaker.id);
	if (!updated) {
		return { ok: false, error: "Speaker missing after update", status: 500 };
	}
	return { ok: true, speaker: updated, spawnedTaskKeys: [] };
}

/** Organizer removal. The row stays for the audit trail; it never disappears. */
export async function removeCoSpeaker(
	db: D1Database,
	speakerId: string,
): Promise<CoSpeakerActionResult> {
	const speaker = await getSubmissionSpeakerById(db, speakerId);
	if (!speaker) {
		return { ok: false, error: "Speaker not found", status: 404 };
	}
	if (speaker.position === 0) {
		return { ok: false, error: "Cannot remove the primary submitter", status: 400 };
	}

	await db
		.prepare(
			`UPDATE submission_speakers
       SET status = 'removed', confirm_token_hash = NULL
       WHERE id = ?`,
		)
		.bind(speaker.id)
		.run();

	const updated = await getSubmissionSpeakerById(db, speaker.id);
	if (!updated) {
		return { ok: false, error: "Speaker missing after update", status: 500 };
	}
	return { ok: true, speaker: updated, spawnedTaskKeys: [] };
}

export type AddCoSpeakerResult =
	| { ok: true; speaker: SubmissionSpeakerRow; addedAfterAcceptance: boolean; revived: boolean }
	| { ok: false; error: string; status: number };

/**
 * Organizer adds a co-speaker after submission. Post-acceptance additions
 * are flagged — that is the free-ticket abuse pattern to watch.
 */
export async function addCoSpeaker(
	db: D1Database,
	args: { submissionId: string; name: string; email: string },
): Promise<AddCoSpeakerResult> {
	const submission = await getSubmissionById(db, args.submissionId);
	if (!submission) {
		return { ok: false, error: "Submission not found", status: 404 };
	}

	const name = args.name.trim();
	const email = args.email.trim().toLowerCase();
	if (!name) return { ok: false, error: "Name required", status: 400 };
	if (!email.includes("@")) {
		return { ok: false, error: "Valid email required", status: 400 };
	}

	const speakers = await listSpeakersForSubmission(db, args.submissionId);
	const active = speakers.filter((speaker) => speaker.status !== "removed");
	if (active.some((speaker) => speaker.email === email)) {
		return { ok: false, error: "Speaker with that email already listed", status: 409 };
	}
	// Primary + up to MAX_CO_SPEAKERS co-speakers.
	if (active.length >= 1 + MAX_CO_SPEAKERS) {
		return {
			ok: false,
			error: `At most ${MAX_CO_SPEAKERS} co-speakers per submission`,
			status: 400,
		};
	}

	const addedAfterAcceptance = isPostAcceptance(submission.status);

	// The unique index on (submission_id, lower(email)) covers removed rows
	// too, so a previously removed speaker is revived instead of re-inserted.
	const removed = speakers.find(
		(speaker) => speaker.status === "removed" && speaker.email === email,
	);
	if (removed) {
		await db
			.prepare(
				`UPDATE submission_speakers
         SET name = ?, status = 'pending', invited_at = NULL, confirmed_at = NULL,
             added_after_acceptance = ?, confirm_token_hash = NULL
         WHERE id = ?`,
			)
			.bind(name, addedAfterAcceptance ? 1 : 0, removed.id)
			.run();
		const revived = await getSubmissionSpeakerById(db, removed.id);
		if (!revived) {
			return { ok: false, error: "Speaker missing after update", status: 500 };
		}
		// Revived rows may carry an already-delivered invitation claim; callers
		// must invite with mode "resend" so the old bearer link is rotated.
		return { ok: true, speaker: revived, addedAfterAcceptance, revived: true };
	}

	const position =
		speakers.reduce((max, speaker) => Math.max(max, speaker.position), 0) + 1;
	const id = crypto.randomUUID();

	await db
		.prepare(
			`INSERT INTO submission_speakers (
        id, submission_id, person_id, name, email, bio, position,
        status, invited_at, confirmed_at, added_after_acceptance, confirm_token_hash
      ) VALUES (?, ?, NULL, ?, ?, NULL, ?, 'pending', NULL, NULL, ?, NULL)`,
		)
		.bind(id, args.submissionId, name, email, position, addedAfterAcceptance ? 1 : 0)
		.run();

	const speaker = await getSubmissionSpeakerById(db, id);
	if (!speaker) {
		return { ok: false, error: "Speaker missing after insert", status: 500 };
	}
	return { ok: true, speaker, addedAfterAcceptance, revived: false };
}

/**
 * Completing any portal task proves the person is real — implicitly confirm
 * their pending co-speaker rows in the same event (matched by person or
 * email). Goes through confirmCoSpeaker so post-acceptance confirmations
 * spawn onboarding tasks too.
 */
export async function implicitlyConfirmByTaskCompletion(
	db: D1Database,
	args: { submissionId: string; personId: string },
): Promise<void> {
	const person = await getPersonById(db, args.personId);
	if (!person) return;

	const pendingRows = await db
		.prepare(
			`SELECT ss.id FROM submission_speakers ss
       JOIN submissions s ON s.id = ss.submission_id
       WHERE ss.status = 'pending'
         AND s.event_id = (SELECT event_id FROM submissions WHERE id = ?)
         AND (ss.person_id = ? OR ss.email = ?)`,
		)
		.bind(args.submissionId, args.personId, person.email)
		.all<{ id: string }>();

	for (const row of pendingRows.results) {
		await confirmCoSpeaker(db, row.id);
	}
}
