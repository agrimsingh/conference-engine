import {
	getEventById,
	getPersonById,
	getSpeakerByConfirmTokenHash,
	getSubmissionById,
	getSubmissionSpeakerById,
	hasSuccessfulOutboundDelivery,
	listSpeakersForSubmission,
} from "@/lib/db/queries";
import type { SubmissionSpeakerRow } from "@/lib/db/types";
import { isPostAcceptance, MAX_CO_SPEAKERS } from "@/lib/domain";
import { titleFromAnswersJson } from "@/lib/email/notify";
import { sendTemplatedEmail, type OutboundSendResult } from "@/lib/email/resend";
import { shouldSendPendingCoSpeakerInvite } from "@/lib/cfp/delivery";
import {
	ensureTaskTemplates,
	materializeAcceptedSpeaker,
} from "./materialize";

/**
 * Co-speaker invites and confirmation.
 *
 * The raw token only ever lives in the invite email; we store its SHA-256
 * hash. Losing a token never drops the co-speaker row — the row stays
 * pending and admin can resend a fresh link.
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

function mintToken(): string {
	return bufferToBase64Url(crypto.getRandomValues(new Uint8Array(24)));
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
 * Mint a fresh token and email the confirm/decline links. Resending to a
 * declined co-speaker re-opens the invitation (back to pending).
 */
export async function inviteCoSpeaker(
	db: D1Database,
	args: { speakerId: string; origin: string },
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

	const submission = await getSubmissionById(db, speaker.submission_id);
	if (!submission) {
		return { ok: false, error: "Submission not found", status: 404 };
	}
	const event = await getEventById(db, submission.event_id);
	if (!event) {
		return { ok: false, error: "Event not found", status: 404 };
	}

	const token = mintToken();
	const tokenHash = await hashConfirmToken(token);
	const now = Date.now();

	await db
		.prepare(
			`UPDATE submission_speakers
       SET status = 'pending', confirm_token_hash = ?, invited_at = ?
       WHERE id = ?`,
		)
		.bind(tokenHash, now, speaker.id)
		.run();

	const { confirmUrl, declineUrl } = coSpeakerLinkUrls(args.origin, token);

	const email = await sendTemplatedEmail(db, {
		eventId: event.id,
		submissionId: submission.id,
		templateKey: "co_speaker_invite",
		toEmail: speaker.email,
		context: {
			eventName: event.name,
			submitterName: speaker.name || "there",
			title: titleFromAnswersJson(submission.answers_json),
			confirmUrl,
			declineUrl,
		},
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
		const delivered = await hasSuccessfulOutboundDelivery(db, {
			submissionId: args.submissionId,
			toEmail: speaker.email,
			templateKey: "co_speaker_invite",
		});
		if (!shouldSendPendingCoSpeakerInvite(delivered)) continue;
		results.push(await inviteCoSpeaker(db, { speakerId: speaker.id, origin: args.origin }));
	}
	return results;
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
	| { ok: true; speaker: SubmissionSpeakerRow; addedAfterAcceptance: boolean }
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
	return { ok: true, speaker, addedAfterAcceptance };
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
