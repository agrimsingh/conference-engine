import { getAuthSecret } from "@/lib/db/cloudflare";
import { getEventById, getPersonById, getSubmissionById } from "@/lib/db/queries";
import { titleFromAnswersJson } from "@/lib/email/notify";
import { sendTemplatedEmail, type EmailDeliveryRuntime } from "@/lib/email/resend";
import { DemoEventWriteError, assertEventWritable } from "@/lib/events/writability";
import { hmacHash, isPlausibleEmail, normalizeEmail } from "@/lib/security/crypto";
import { hashConfirmToken } from "./co-speakers";

export type SpeakerHandoffRow = {
	id: string;
	event_id: string;
	submission_id: string;
	speaker_person_id: string;
	manager_email: string;
	manager_name: string | null;
	manager_person_id: string | null;
	token_hash: string;
	status: "pending" | "accepted" | "declined" | "cancelled";
	created_at: number;
	resolved_at: number | null;
};

export function handoffLinkUrls(origin: string, token: string): { confirmUrl: string; declineUrl: string } {
	const encoded = encodeURIComponent(token);
	return {
		confirmUrl: `${origin}/handoff/${encoded}?intent=accept`,
		declineUrl: `${origin}/handoff/${encoded}?intent=decline`,
	};
}

export async function canActAsSpeaker(
	db: D1Database,
	actorPersonId: string,
	speakerPersonId: string,
): Promise<boolean> {
	if (actorPersonId === speakerPersonId) return true;
	const row = await db
		.prepare(
			`SELECT 1 AS ok FROM speaker_handoffs
			 WHERE manager_person_id = ? AND speaker_person_id = ? AND status = 'accepted'
			 LIMIT 1`,
		)
		.bind(actorPersonId, speakerPersonId)
		.first<{ ok: number }>();
	return Boolean(row);
}

export async function requestSpeakerHandoff(
	db: D1Database,
	args: {
		submissionId: string;
		speakerPersonId: string;
		managerEmail: string;
		managerName?: string;
		origin: string;
		runtime?: EmailDeliveryRuntime;
	},
): Promise<{ ok: true; handoffId: string; confirmUrl: string; declineUrl: string } | { ok: false; error: string; status: number }> {
	const email = normalizeEmail(args.managerEmail);
	if (!isPlausibleEmail(email)) {
		return { ok: false, error: "Enter a valid manager email", status: 400 };
	}
	const speaker = await getPersonById(db, args.speakerPersonId);
	if (!speaker) return { ok: false, error: "Speaker not found", status: 404 };
	if (normalizeEmail(speaker.email) === email) {
		return { ok: false, error: "Hand the talk to someone else", status: 400 };
	}
	const submission = await getSubmissionById(db, args.submissionId);
	if (!submission) return { ok: false, error: "Submission not found", status: 404 };
	const event = await getEventById(db, submission.event_id);
	if (!event) return { ok: false, error: "Event not found", status: 404 };
	try {
		assertEventWritable(event);
	} catch (error) {
		if (error instanceof DemoEventWriteError) {
			return { ok: false, error: "This demo event is read-only", status: 403 };
		}
		throw error;
	}

	const listed = await db
		.prepare(
			`SELECT 1 AS ok FROM submission_speakers
			 WHERE submission_id = ? AND person_id = ? AND status IN ('pending', 'confirmed')
			 LIMIT 1`,
		)
		.bind(args.submissionId, args.speakerPersonId)
		.first<{ ok: number }>();
	const isSubmitter = submission.submitter_person_id === args.speakerPersonId;
	if (!listed && !isSubmitter) {
		return { ok: false, error: "You are not a speaker on this session", status: 403 };
	}

	await db
		.prepare(
			`UPDATE speaker_handoffs
			 SET status = 'cancelled', resolved_at = ?
			 WHERE submission_id = ? AND speaker_person_id = ? AND status = 'pending'`,
		)
		.bind(Date.now(), args.submissionId, args.speakerPersonId)
		.run();

	const secret = args.runtime?.authSecret ?? (await getAuthSecret());
	if (!secret) return { ok: false, error: "AUTH_SECRET missing", status: 500 };
	const id = crypto.randomUUID();
	const token = await hmacHash(secret, `handoff:${id}:${Date.now()}`);
	const tokenHash = await hashConfirmToken(token);
	const now = Date.now();
	const managerName = args.managerName?.trim() || null;
	await db
		.prepare(
			`INSERT INTO speaker_handoffs (
				id, event_id, submission_id, speaker_person_id, manager_email, manager_name,
				manager_person_id, token_hash, status, created_at, resolved_at
			) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'pending', ?, NULL)`,
		)
		.bind(
			id,
			event.id,
			args.submissionId,
			args.speakerPersonId,
			email,
			managerName,
			tokenHash,
			now,
		)
		.run();

	const { confirmUrl, declineUrl } = handoffLinkUrls(args.origin, token);
	const title = titleFromAnswersJson(submission.answers_json);
	await sendTemplatedEmail(db, {
		eventId: event.id,
		submissionId: submission.id,
		templateKey: "speaker_handoff",
		toEmail: email,
		context: {
			eventName: event.name,
			submitterName: managerName || "there",
			title,
			confirmUrl,
			declineUrl,
		},
		runtime: args.runtime,
		force: true,
	});
	return { ok: true, handoffId: id, confirmUrl, declineUrl };
}

export async function getHandoffByToken(
	db: D1Database,
	token: string,
): Promise<SpeakerHandoffRow | null> {
	const tokenHash = await hashConfirmToken(token);
	return db
		.prepare("SELECT * FROM speaker_handoffs WHERE token_hash = ?")
		.bind(tokenHash)
		.first<SpeakerHandoffRow>();
}

export async function acceptSpeakerHandoff(
	db: D1Database,
	handoffId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
	const handoff = await db
		.prepare("SELECT * FROM speaker_handoffs WHERE id = ?")
		.bind(handoffId)
		.first<SpeakerHandoffRow>();
	if (!handoff) return { ok: false, error: "Handoff not found", status: 404 };
	if (handoff.status === "accepted") return { ok: true };
	if (handoff.status !== "pending") {
		return { ok: false, error: "This handoff is no longer pending", status: 409 };
	}
	const event = await getEventById(db, handoff.event_id);
	if (!event) return { ok: false, error: "Event not found", status: 404 };
	try {
		assertEventWritable(event);
	} catch (error) {
		if (error instanceof DemoEventWriteError) {
			return { ok: false, error: "This demo event is read-only", status: 403 };
		}
		throw error;
	}
	const now = Date.now();
	await db
		.prepare(
			`INSERT INTO people (id, email, name, created_at)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT(email) DO UPDATE SET name = CASE
			   WHEN people.name IS NULL OR people.name = '' THEN excluded.name
			   ELSE people.name END`,
		)
		.bind(crypto.randomUUID(), handoff.manager_email, handoff.manager_name, now)
		.run();
	const person = await db
		.prepare("SELECT id FROM people WHERE email = ?")
		.bind(handoff.manager_email)
		.first<{ id: string }>();
	if (!person) return { ok: false, error: "Could not create manager account", status: 500 };
	const updated = await db
		.prepare(
			`UPDATE speaker_handoffs
			 SET status = 'accepted', manager_person_id = ?, resolved_at = ?
			 WHERE id = ? AND status = 'pending'`,
		)
		.bind(person.id, now, handoff.id)
		.run();
	if ((updated.meta.changes ?? 0) === 0) {
		return { ok: false, error: "This handoff is no longer pending", status: 409 };
	}
	return { ok: true };
}

export async function declineSpeakerHandoff(
	db: D1Database,
	handoffId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
	const handoff = await db
		.prepare("SELECT * FROM speaker_handoffs WHERE id = ?")
		.bind(handoffId)
		.first<SpeakerHandoffRow>();
	if (!handoff) return { ok: false, error: "Handoff not found", status: 404 };
	if (handoff.status === "declined") return { ok: true };
	if (handoff.status !== "pending") {
		return { ok: false, error: "This handoff is no longer pending", status: 409 };
	}
	const event = await getEventById(db, handoff.event_id);
	if (!event) return { ok: false, error: "Event not found", status: 404 };
	try {
		assertEventWritable(event);
	} catch (error) {
		if (error instanceof DemoEventWriteError) {
			return { ok: false, error: "This demo event is read-only", status: 403 };
		}
		throw error;
	}
	await db
		.prepare(
			`UPDATE speaker_handoffs SET status = 'declined', resolved_at = ? WHERE id = ? AND status = 'pending'`,
		)
		.bind(Date.now(), handoff.id)
		.run();
	return { ok: true };
}

export async function listHandoffsForSubmissions(
	db: D1Database,
	submissionIds: string[],
): Promise<SpeakerHandoffRow[]> {
	const ids = [...new Set(submissionIds)];
	if (!ids.length) return [];
	const result = await db
		.prepare(
			`SELECT * FROM speaker_handoffs
			 WHERE submission_id IN (SELECT value FROM json_each(?))
			 ORDER BY created_at DESC`,
		)
		.bind(JSON.stringify(ids))
		.all<SpeakerHandoffRow>();
	return result.results;
}

export async function listAcceptedHandoffsForEvent(
	db: D1Database,
	eventId: string,
): Promise<SpeakerHandoffRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM speaker_handoffs
			 WHERE event_id = ? AND status = 'accepted'
			 ORDER BY created_at DESC`,
		)
		.bind(eventId)
		.all<SpeakerHandoffRow>();
	return result.results;
}
