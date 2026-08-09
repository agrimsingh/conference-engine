import type { AnswerMap, SpeakerAnswer } from "@/lib/domain";
import { hmacHash, randomToken } from "@/lib/security/crypto";
import { requireWritableEventById } from "@/lib/events/writability";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60_000;
const PREVIOUS_TOKEN_GRACE_MS = 10 * 60_000;
const FINAL_TOMBSTONE_MS = 24 * 60 * 60_000;

export async function createVerifiedDraft(
	db: D1Database,
	args: { id?: string; eventId: string; formId: string; verifiedEmail: string; submitterName?: string; answers?: AnswerMap },
): Promise<string> {
	await requireWritableEventById(db, args.eventId);
	const id = args.id ?? crypto.randomUUID();
	const now = Date.now();
	await db.prepare(
		`INSERT INTO submission_drafts (id, event_id, form_id, verified_email, submitter_name, answers_json, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
	).bind(id, args.eventId, args.formId, args.verifiedEmail.trim().toLowerCase(), args.submitterName?.trim() ?? "", JSON.stringify(args.answers ?? {}), now, now).run();
	return id;
}

/**
 * Persist the draft and its hashed resume token in one D1 batch before an
 * outbound message can contain the raw token. The token remains private to
 * the caller so public endpoints can keep their anti-enumeration response.
 */
export async function prepareDraftResumeDelivery(
	db: D1Database,
	args: { secret: string; eventId: string; formId: string; verifiedEmail: string; submitterName?: string; answers?: AnswerMap; draftId?: string; token?: string; now?: number },
): Promise<{ draftId: string; token: string }> {
	await requireWritableEventById(db, args.eventId);
	const draftId = args.draftId ?? crypto.randomUUID();
	const token = args.token ?? randomToken(32);
	const now = args.now ?? Date.now();
	const hash = await hmacHash(args.secret, token);
	await db.batch([
		db.prepare(
			`INSERT INTO submission_drafts (id, event_id, form_id, verified_email, submitter_name, answers_json, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
		).bind(draftId, args.eventId, args.formId, args.verifiedEmail.trim().toLowerCase(), args.submitterName?.trim() ?? "", JSON.stringify(args.answers ?? {}), now, now),
		db.prepare(
			`INSERT INTO submission_draft_tokens (token_hash, draft_id, state, expires_at, created_at)
       VALUES (?, ?, 'current', ?, ?)`,
		).bind(hash, draftId, now + TOKEN_TTL_MS, now),
	]);
	return { draftId, token };
}

/** Call only after a mailbox link was accepted or a portal session proved this address. */
export async function issueDraftResumeToken(
	db: D1Database,
	args: { secret: string; draftId: string; deliveryVerified: boolean; token?: string; now?: number },
): Promise<string> {
	if (!args.deliveryVerified) throw new Error("Draft tokens require verified delivery or portal identity");
	const draft = await db.prepare("SELECT event_id FROM submission_drafts WHERE id = ?").bind(args.draftId).first<{ event_id: string }>();
	if (!draft) throw new Error("Draft not found");
	await requireWritableEventById(db, draft.event_id);
	const now = args.now ?? Date.now();
	const token = args.token ?? randomToken(32);
	const hash = await hmacHash(args.secret, token);
	await db.batch([
		db.prepare(
			`UPDATE submission_draft_tokens
       SET state = 'superseded', expires_at = MIN(expires_at, ?)
       WHERE draft_id = ? AND state = 'current'`,
		).bind(now + PREVIOUS_TOKEN_GRACE_MS, args.draftId),
		db.prepare(
			`INSERT INTO submission_draft_tokens (token_hash, draft_id, state, expires_at, created_at)
       VALUES (?, ?, 'current', ?, ?)`,
		).bind(hash, args.draftId, now + TOKEN_TTL_MS, now),
	]);
	return token;
}

export async function loadDraftForResume(
	db: D1Database,
	args: { secret: string; token: string; now?: number },
): Promise<{ id: string; eventId: string; formId: string; verifiedEmail: string; submitterName: string; status: "draft" | "submitted"; answers: AnswerMap; submissionId: string | null } | null> {
	const now = args.now ?? Date.now();
	const hash = await hmacHash(args.secret, args.token);
	const row = await db.prepare(
		`SELECT d.id, d.event_id, d.form_id, d.verified_email, d.submitter_name, d.status, d.answers_json, d.submission_id
     FROM submission_draft_tokens t
     JOIN submission_drafts d ON d.id = t.draft_id
     WHERE t.token_hash = ? AND t.expires_at >= ?`,
	).bind(hash, now).first<{ id: string; event_id: string; form_id: string; verified_email: string; submitter_name: string; status: "draft" | "submitted"; answers_json: string; submission_id: string | null }>();
	if (!row) return null;
	let parsed: unknown;
	try { parsed = JSON.parse(row.answers_json); } catch { return null; }
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
	return { id: row.id, eventId: row.event_id, formId: row.form_id, verifiedEmail: row.verified_email, submitterName: row.submitter_name, status: row.status, answers: parsed as AnswerMap, submissionId: row.submission_id };
}

/** A proven resume token (or matching portal identity) can update draft state
 * and receives a rotated token; the prior token remains for a short grace. */
export async function saveDraftForResume(
	db: D1Database,
	args: { secret: string; token: string; submitterName: string; answers: AnswerMap; verifiedEmail?: string; now?: number },
): Promise<{ draftId: string; token: string } | null> {
	const now = args.now ?? Date.now();
	const oldHash = await hmacHash(args.secret, args.token);
	const draft = await db.prepare(
		`SELECT d.id, d.event_id, d.verified_email
     FROM submission_drafts d JOIN submission_draft_tokens t ON t.draft_id = d.id
     WHERE t.token_hash = ? AND t.expires_at >= ? AND d.status = 'draft'`,
	).bind(oldHash, now).first<{ id: string; event_id: string; verified_email: string }>();
	if (!draft || (args.verifiedEmail && draft.verified_email.toLowerCase() !== args.verifiedEmail.trim().toLowerCase())) return null;
	await requireWritableEventById(db, draft.event_id);
	const token = randomToken(32);
	const hash = await hmacHash(args.secret, token);
	await db.batch([
		db.prepare("UPDATE submission_drafts SET submitter_name = ?, answers_json = ?, updated_at = ? WHERE id = ? AND status = 'draft'").bind(args.submitterName.trim(), JSON.stringify(args.answers), now, draft.id),
		db.prepare("UPDATE submission_draft_tokens SET state = 'superseded', expires_at = MIN(expires_at, ?) WHERE draft_id = ? AND state = 'current'").bind(now + PREVIOUS_TOKEN_GRACE_MS, draft.id),
		db.prepare("INSERT INTO submission_draft_tokens (token_hash, draft_id, state, expires_at, created_at) VALUES (?, ?, 'current', ?, ?)").bind(hash, draft.id, now + TOKEN_TTL_MS, now),
	]);
	return { draftId: draft.id, token };
}

export async function finalizeDraft(
	db: D1Database,
	args: { secret: string; draftId: string; token: string; submitterName: string; answers: AnswerMap; speakers: SpeakerAnswer[]; category?: string | null; now?: number },
): Promise<{ submissionId: string; replay: boolean }> {
	const now = args.now ?? Date.now();
	const hash = await hmacHash(args.secret, args.token);
	const draft = await db.prepare(
		`SELECT d.id, d.event_id, d.form_id, d.verified_email, d.status, d.submission_id
     FROM submission_drafts d
     JOIN submission_draft_tokens t ON t.draft_id = d.id
     WHERE d.id = ? AND t.token_hash = ? AND t.expires_at >= ?`,
	).bind(args.draftId, hash, now).first<{ id: string; event_id: string; form_id: string; verified_email: string; status: "draft" | "submitted"; submission_id: string | null }>();
	if (!draft) throw new Error("Draft token is invalid or expired");
	await requireWritableEventById(db, draft.event_id);
	if (draft.status === "submitted" && draft.submission_id) return { submissionId: draft.submission_id, replay: true };
	const submissionId = draft.id; // deterministic, so a concurrent finalizer cannot create a second submission.
	const principals = new Map<string, string>();
	principals.set(draft.verified_email.trim().toLowerCase(), args.submitterName.trim());
	for (const speaker of args.speakers) principals.set(speaker.email.trim().toLowerCase(), speaker.name.trim());
	const people = [...principals.entries()].filter(([email]) => email).map(([email, name]) => db.prepare(
		`INSERT INTO people (id, email, name, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET name = CASE WHEN people.name IS NULL OR people.name = '' THEN excluded.name ELSE people.name END`,
	).bind(crypto.randomUUID(), email, name || null, now));
	const speakerStatements = args.speakers.map((speaker, position) => {
		const email = speaker.email.trim().toLowerCase();
		const confirmed = position === 0 || email === draft.verified_email.toLowerCase();
		return db.prepare(
			`INSERT OR IGNORE INTO submission_speakers (id, submission_id, person_id, name, email, bio, position, status, invited_at, confirmed_at, added_after_acceptance, confirm_token_hash)
       VALUES (?, ?, (SELECT id FROM people WHERE email = ?), ?, ?, ?, ?, ?, NULL, ?, 0, NULL)`,
		).bind(crypto.randomUUID(), submissionId, email, speaker.name.trim(), email, speaker.bio?.trim() ?? null, position, confirmed ? "confirmed" : "pending", confirmed ? now : null);
	});
	try {
		const results = await db.batch([
			...people,
			db.prepare(
				`INSERT INTO submissions (id, form_id, event_id, status, answers_json, category, submitter_email, submitter_name, submitter_person_id, created_at, updated_at, submitted_at)
         SELECT ?, ?, ?, 'submitted', ?, ?, ?, ?, (SELECT id FROM people WHERE email = ?), ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM submission_drafts WHERE id = ? AND status = 'draft')`,
			).bind(submissionId, draft.form_id, draft.event_id, JSON.stringify(args.answers), args.category ?? null, draft.verified_email, args.submitterName.trim(), draft.verified_email, now, now, now, draft.id),
			...speakerStatements,
			db.prepare("UPDATE submission_drafts SET status = 'submitted', submission_id = ?, finalized_at = ?, updated_at = ? WHERE id = ? AND status = 'draft'").bind(submissionId, now, now, draft.id),
			db.prepare("UPDATE submission_draft_tokens SET state = 'consumed', consumed_at = ?, tombstone_until = ?, expires_at = ? WHERE draft_id = ?").bind(now, now + FINAL_TOMBSTONE_MS, now + FINAL_TOMBSTONE_MS, draft.id),
		]);
		if ((results[people.length]?.meta.changes ?? 0) === 0) return { submissionId, replay: true };
	} catch (error) {
		const finalized = await db.prepare("SELECT submission_id FROM submission_drafts WHERE id = ? AND status = 'submitted'").bind(draft.id).first<{ submission_id: string }>();
		if (finalized?.submission_id) return { submissionId: finalized.submission_id, replay: true };
		throw error;
	}
	return { submissionId, replay: false };
}
