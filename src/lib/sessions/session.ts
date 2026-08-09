import { getEventBySlug, getSubmissionById, listSpeakersForSubmission } from "@/lib/db/queries";
import type { SubmissionRow, SubmissionSpeakerRow } from "@/lib/db/types";
import { ensureTaskTemplates, materializeAcceptedSpeaker, prepareMaterializationWriteFence, MaterializationClaimLostError, MATERIALIZATION_WRITE_FENCE_PREDICATE, type MaterializationWriteFence, type MaterializedSpeakerResources } from "@/lib/speakers/materialize";
import { hasFormulaPrefix, parseBoundedCsv, type CsvRecord } from "./csv";

export const MAX_SESSION_TEXT = 8_000;
export const MAX_SESSION_TITLE = 240;
export const MAX_SESSION_SPEAKERS = 4;
const MATERIALIZATION_CLAIM_LEASE_MS = 15_000;
const MATERIALIZATION_CLAIM_RETRY_MS = 25;
const MATERIALIZATION_CLAIM_MAX_ATTEMPTS = 40;

export type SessionOrigin = "manual" | "invited" | "imported" | "cloned";
export type SessionSpeakerInput = { name: string; email: string; bio?: string | null };
export type SessionInput = {
	title: string;
	abstract?: string | null;
	category?: string | null;
	videoUrl?: string | null;
	googleDocUrl?: string | null;
	supportingUrl?: string | null;
	speakers?: SessionSpeakerInput[];
};

export type SessionPreviewRow = {
	row: number;
	input: SessionInput | null;
	issues: string[];
	duplicate: "none" | "csv" | "existing" | "idempotent";
	importKey?: string;
};

export type SessionImportFailure = { row: number; error: string; status: number };
export type SessionImportCommit = {
	ok: true;
	created: number;
	idempotent: number;
	repaired: number;
	skipped: number;
	failed: number;
	partial: boolean;
	rows: SessionPreviewRow[];
	failures: SessionImportFailure[];
} | { ok: false; error: string; rows?: SessionPreviewRow[]; status?: number };

type NormalizedSessionInput = Required<Omit<SessionInput, "category">> & { category: string | null; speakers: Array<Required<SessionSpeakerInput>> };

function stringField(value: unknown, label: string, maximum: number, required = false): { value: string | null; error?: string } {
	if (value === undefined || value === null) return required ? { value: null, error: `${label} is required` } : { value: null };
	if (typeof value !== "string") return { value: null, error: `${label} must be text` };
	const trimmed = value.trim();
	if (required && !trimmed) return { value: null, error: `${label} is required` };
	if (trimmed.length > maximum) return { value: null, error: `${label} must be at most ${maximum} characters` };
	if (hasFormulaPrefix(trimmed)) return { value: null, error: `${label} cannot begin with a spreadsheet formula prefix` };
	return { value: trimmed || null };
}

export function safeExternalUrl(value: string | null | undefined): string | null {
	if (!value) return null;
	try {
		const parsed = new URL(value);
		return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
	} catch { return null; }
}

function urlField(value: unknown, label: string): { value: string | null; error?: string } {
	const field = stringField(value, label, 2_048);
	if (field.error || !field.value) return field;
	if (!safeExternalUrl(field.value)) return { value: null, error: `${label} must be an http or https URL` };
	return field;
}

function emailField(value: unknown): { value: string | null; error?: string } {
	const field = stringField(value, "Speaker email", 254);
	if (field.error || !field.value) return field;
	const email = field.value.toLowerCase();
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { value: email } : { value: null, error: "Speaker email must be valid" };
}

export function normalizeSessionInput(raw: SessionInput): { ok: true; value: NormalizedSessionInput } | { ok: false; issues: string[] } {
	const title = stringField(raw.title, "Title", MAX_SESSION_TITLE, true);
	const abstract = stringField(raw.abstract, "Abstract", MAX_SESSION_TEXT);
	const category = stringField(raw.category, "Track", 120);
	const videoUrl = urlField(raw.videoUrl, "Video URL");
	const googleDocUrl = urlField(raw.googleDocUrl, "Google Doc URL");
	const supportingUrl = urlField(raw.supportingUrl, "Supporting URL");
	const issues = [title.error, abstract.error, category.error, videoUrl.error, googleDocUrl.error, supportingUrl.error].filter((value): value is string => Boolean(value));
	const speakers: Array<Required<SessionSpeakerInput>> = [];
	if (raw.speakers !== undefined) {
		if (!Array.isArray(raw.speakers) || raw.speakers.length > MAX_SESSION_SPEAKERS) issues.push(`Use at most ${MAX_SESSION_SPEAKERS} speakers`);
		else for (const rawSpeaker of raw.speakers) {
			const name = stringField(rawSpeaker?.name, "Speaker name", 160, true);
			const email = emailField(rawSpeaker?.email);
			const bio = stringField(rawSpeaker?.bio, "Speaker bio", MAX_SESSION_TEXT);
			issues.push(...[name.error, email.error, bio.error].filter((value): value is string => Boolean(value)));
			if (name.value && email.value) speakers.push({ name: name.value, email: email.value, bio: bio.value ?? "" });
		}
	}
	if (new Set(speakers.map((speaker) => speaker.email)).size !== speakers.length) issues.push("Speaker emails must be unique");
	if (issues.length || !title.value) return { ok: false, issues: [...new Set(issues)] };
	return { ok: true, value: { title: title.value, abstract: abstract.value ?? "", category: category.value, videoUrl: videoUrl.value ?? "", googleDocUrl: googleDocUrl.value ?? "", supportingUrl: supportingUrl.value ?? "", speakers } };
}

export function inputFromCsvRow(row: CsvRecord): SessionInput {
	const value = (...keys: string[]) => keys.map((key) => row[key]).find((item) => item !== undefined) ?? "";
	const speakerName = value("speaker_name", "speaker", "name");
	const speakerEmail = value("speaker_email", "email");
	return {
		title: value("title"), abstract: value("abstract", "description"), category: value("track", "category"),
		videoUrl: value("video_url", "video"), googleDocUrl: value("google_doc_url", "google_doc", "doc_url"), supportingUrl: value("supporting_url", "supporting", "resources_url"),
		speakers: speakerName || speakerEmail ? [{ name: speakerName, email: speakerEmail, bio: value("speaker_bio", "bio") }] : [],
	};
}

async function importKeyFor(input: NormalizedSessionInput): Promise<string> {
	const stable = JSON.stringify({ title: input.title.toLocaleLowerCase(), abstract: input.abstract, category: input.category, videoUrl: input.videoUrl, googleDocUrl: input.googleDocUrl, supportingUrl: input.supportingUrl, speakers: input.speakers.map((speaker) => ({ ...speaker, email: speaker.email.toLowerCase() })) });
	const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stable)));
	return `csv:${Array.from(bytes.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function findExistingDuplicate(db: D1Database, eventId: string, input: NormalizedSessionInput, importKey?: string): Promise<"none" | "existing" | "idempotent"> {
	if (importKey) {
		const imported = await db.prepare("SELECT id FROM submissions WHERE event_id = ? AND import_key = ?").bind(eventId, importKey).first<{ id: string }>();
		if (imported) return "idempotent";
	}
	const email = input.speakers[0]?.email ?? "";
	const row = await db.prepare(`SELECT id FROM submissions WHERE event_id = ? AND lower(COALESCE(json_extract(answers_json, '$.title'), '')) = ? AND lower(COALESCE(submitter_email, '')) = ? LIMIT 1`).bind(eventId, input.title.toLowerCase(), email.toLowerCase()).first<{ id: string }>();
	return row ? "existing" : "none";
}

export async function previewSessionImport(db: D1Database, eventId: string, csv: string): Promise<{ ok: true; rows: SessionPreviewRow[] } | { ok: false; error: string }> {
	const parsed = parseBoundedCsv(csv);
	if (!parsed.ok) return parsed;
	if (!parsed.headers.includes("title")) return { ok: false, error: "CSV requires a title column" };
	const seen = new Set<string>();
	const rows: SessionPreviewRow[] = [];
	for (const [index, record] of parsed.rows.entries()) {
		const raw = inputFromCsvRow(record);
		const normalized = normalizeSessionInput(raw);
		if (!normalized.ok) { rows.push({ row: index + 2, input: raw, issues: normalized.issues, duplicate: "none" }); continue; }
		const importKey = await importKeyFor(normalized.value);
		const duplicate = seen.has(importKey) ? "csv" : await findExistingDuplicate(db, eventId, normalized.value, importKey);
		seen.add(importKey);
		rows.push({ row: index + 2, input: normalized.value, issues: duplicate === "existing" || duplicate === "csv" ? [duplicate === "csv" ? "Duplicate row in this CSV" : "A matching session already exists in this event"] : [], duplicate, importKey });
	}
	return { ok: true, rows };
}

async function systemFormId(db: D1Database, eventId: string): Promise<string> {
	const form = await db.prepare("SELECT id FROM cfp_forms WHERE event_id = ? AND kind = 'system'").bind(eventId).first<{ id: string }>();
	if (!form) throw new Error("Event system form is missing; run product foundation migration");
	return form.id;
}

type CreateSessionArgs = {
	eventId: string;
	origin: SessionOrigin;
	input: SessionInput;
	importKey?: string;
	lineage?: { parentSubmissionId: string; rootSubmissionId: string; sourceEventId: string };
	/** Test seam for a failure after the durable session shell exists. */
	materializeSpeaker?: typeof materializeAcceptedSpeaker;
	/** Test seam for deterministic lease-expiry coverage without waiting. */
	materializationClaim?: Partial<MaterializationClaimTiming>;
	/** Test seam that pauses after a phase renews but before its fenced write. */
	materializationPhaseHook?: MaterializationWriteFence["beforePhaseWrite"];
};

type SessionAttempt = {
	submissionId: string;
	originalSubmitterPersonId: string | null;
	originalSpeakerPersonIds: Map<string, string | null>;
	createdSpeakerIds: string[];
	resources: MaterializedSpeakerResources;
};

type MaterializationClaimTiming = {
	now: () => number;
	leaseMs: number;
	retryMs: number;
	maxAttempts: number;
};

type MaterializationClaim = { submissionId: string; ownerToken: string; leaseExpiresAt: number };

export class SessionMaterializationBusyError extends Error {
	readonly status = 409;

	constructor() {
		super("Session materialization is already in progress; retry shortly");
		this.name = "SessionMaterializationBusyError";
	}
}

export async function createSession(db: D1Database, args: CreateSessionArgs): Promise<{ id: string; input: NormalizedSessionInput }> {
	const normalized = normalizeSessionInput(args.input);
	if (!normalized.ok) throw new Error(normalized.issues.join("; "));
	if (args.origin === "invited" && normalized.value.speakers.length === 0) throw new Error("Invited sessions require at least one complete speaker");
	// Fail before the submission shell exists when speaker task configuration is
	// invalid. The returned template snapshot also makes retries deterministic.
	const templates = normalized.value.speakers.length > 0 ? await ensureTaskTemplates(db, args.eventId) : [];
	const formId = await systemFormId(db, args.eventId);
	const now = Date.now();
	let id = crypto.randomUUID();
	let created = true;
	if (args.importKey) {
		const existing = await db.prepare("SELECT id FROM submissions WHERE event_id = ? AND import_key = ?").bind(args.eventId, args.importKey).first<{ id: string }>();
		if (existing) { id = existing.id; created = false; }
	}
	const primary = normalized.value.speakers[0];
	if (created) {
		const inserted = await db.prepare(`INSERT OR IGNORE INTO submissions (id, form_id, event_id, status, origin, answers_json, category, submitter_email, submitter_name, submitted_at, lineage_parent_submission_id, lineage_root_submission_id, lineage_source_event_id, import_key, video_url, google_doc_url, supporting_url, created_at, updated_at) VALUES (?, ?, ?, 'accepted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, formId, args.eventId, args.origin, JSON.stringify({ title: normalized.value.title, abstract: normalized.value.abstract }), normalized.value.category, primary?.email ?? null, primary?.name ?? null, now, args.lineage?.parentSubmissionId ?? null, args.lineage?.rootSubmissionId ?? null, args.lineage?.sourceEventId ?? null, args.importKey ?? null, normalized.value.videoUrl || null, normalized.value.googleDocUrl || null, normalized.value.supportingUrl || null, now, now).run();
		if ((inserted.meta.changes ?? 0) === 0) {
			if (args.importKey) {
				const existing = await db.prepare("SELECT id FROM submissions WHERE event_id = ? AND import_key = ?").bind(args.eventId, args.importKey).first<{ id: string }>();
				if (existing) { id = existing.id; created = false; }
				else throw new Error("Could not create session");
			} else throw new Error("Could not create session");
		}
	}
	const claimTiming: MaterializationClaimTiming = {
		now: args.materializationClaim?.now ?? Date.now,
		leaseMs: args.materializationClaim?.leaseMs ?? MATERIALIZATION_CLAIM_LEASE_MS,
		retryMs: args.materializationClaim?.retryMs ?? MATERIALIZATION_CLAIM_RETRY_MS,
		maxAttempts: args.materializationClaim?.maxAttempts ?? MATERIALIZATION_CLAIM_MAX_ATTEMPTS,
	};
	const claim = await acquireSessionMaterializationClaim(db, id, claimTiming);
	const writeFence: MaterializationWriteFence = {
		submissionId: id,
		ownerToken: claim.ownerToken,
		now: claimTiming.now,
		leaseMs: claimTiming.leaseMs,
		beforePhaseWrite: args.materializationPhaseHook,
	};
	try {
		const attempt = await startSessionAttempt(db, id);
		try {
			await repairSessionSpeakers(db, { eventId: args.eventId, submissionId: id, speakers: normalized.value.speakers, templates, now, materializeSpeaker: args.materializeSpeaker ?? materializeAcceptedSpeaker, attempt, writeFence });
		} catch (error) {
			// Imports retain only their deterministic shell and retry from a clean
			// materialization boundary. Manual and invited creates remove the shell.
			await rollbackSessionAttempt(db, attempt, claim, claimTiming.now(), created && !args.importKey);
			throw error;
		}
	} finally {
		await releaseSessionMaterializationClaim(db, claim);
	}
	return { id, input: normalized.value };
}

async function acquireSessionMaterializationClaim(db: D1Database, submissionId: string, timing: MaterializationClaimTiming): Promise<MaterializationClaim> {
	const ownerToken = crypto.randomUUID();
	for (let attempt = 0; attempt < timing.maxAttempts; attempt += 1) {
		const now = timing.now();
		const leaseExpiresAt = now + timing.leaseMs;
		const claimed = await db.prepare(
			`INSERT INTO session_materialization_claims (
         submission_id, owner_token, lease_expires_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(submission_id) DO UPDATE SET
         owner_token = excluded.owner_token,
         lease_expires_at = excluded.lease_expires_at,
         updated_at = excluded.updated_at
       WHERE session_materialization_claims.lease_expires_at <= ?
       RETURNING owner_token`,
		).bind(submissionId, ownerToken, leaseExpiresAt, now, now, now).first<{ owner_token: string }>();
		if (claimed?.owner_token === ownerToken) return { submissionId, ownerToken, leaseExpiresAt };
		if (attempt + 1 < timing.maxAttempts) await new Promise<void>((resolve) => setTimeout(resolve, timing.retryMs));
	}
	throw new SessionMaterializationBusyError();
}

async function releaseSessionMaterializationClaim(db: D1Database, claim: MaterializationClaim): Promise<void> {
	await db.prepare("DELETE FROM session_materialization_claims WHERE submission_id = ? AND owner_token = ?").bind(claim.submissionId, claim.ownerToken).run();
}

async function startSessionAttempt(db: D1Database, submissionId: string): Promise<SessionAttempt> {
	const [submission, speakers] = await Promise.all([
		db.prepare("SELECT submitter_person_id FROM submissions WHERE id = ?").bind(submissionId).first<{ submitter_person_id: string | null }>(),
		db.prepare("SELECT id, person_id FROM submission_speakers WHERE submission_id = ?").bind(submissionId).all<{ id: string; person_id: string | null }>(),
	]);
	if (!submission) throw new Error("Session shell disappeared before speaker materialization");
	return {
		submissionId,
		originalSubmitterPersonId: submission.submitter_person_id,
		originalSpeakerPersonIds: new Map(speakers.results.map((speaker) => [speaker.id, speaker.person_id])),
		createdSpeakerIds: [],
		resources: { personIds: [], personNameRestores: [], eventMembershipIds: [], speakerProfileIds: [], speakerTaskIds: [] },
	};
}

async function repairSessionSpeakers(db: D1Database, args: { eventId: string; submissionId: string; speakers: Array<Required<SessionSpeakerInput>>; templates: Awaited<ReturnType<typeof ensureTaskTemplates>>; now: number; materializeSpeaker: typeof materializeAcceptedSpeaker; attempt: SessionAttempt; writeFence: MaterializationWriteFence }): Promise<void> {
	for (const [position, speaker] of args.speakers.entries()) {
		const id = crypto.randomUUID();
		const speakerFence = await prepareMaterializationWriteFence(db, args.writeFence, "submission-speaker");
		const inserted = await db.prepare(speakerFence ?
			`INSERT OR IGNORE INTO submission_speakers (id, submission_id, name, email, bio, position, status, confirmed_at, added_after_acceptance)
       SELECT ?, ?, ?, ?, ?, ?, 'confirmed', ?, 0 WHERE ${MATERIALIZATION_WRITE_FENCE_PREDICATE}` :
			"INSERT OR IGNORE INTO submission_speakers (id, submission_id, name, email, bio, position, status, confirmed_at, added_after_acceptance) VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, 0)",
		).bind(id, args.submissionId, speaker.name, speaker.email, speaker.bio || null, position, args.now, ...(speakerFence ?? [])).run();
		if ((inserted.meta.changes ?? 0) > 0) args.attempt.createdSpeakerIds.push(id);
	}
	const rows = await listSpeakersForSubmission(db, args.submissionId);
	for (const [position, expected] of args.speakers.entries()) {
		const speaker = rows.find((row) => row.email.toLowerCase() === expected.email);
		if (!speaker) throw new Error("Could not repair session speaker");
		const materialized = await args.materializeSpeaker(db, { eventId: args.eventId, submissionId: args.submissionId, speaker, templates: args.templates, createdResources: args.attempt.resources, writeFence: args.writeFence }, args.now);
		if (position === 0) {
			const submitterFence = await prepareMaterializationWriteFence(db, args.writeFence, "submitter-link");
			const updated = await db.prepare(submitterFence ?
				`UPDATE submissions SET submitter_person_id = ?
         WHERE id = ? AND ${MATERIALIZATION_WRITE_FENCE_PREDICATE}` :
				"UPDATE submissions SET submitter_person_id = ? WHERE id = ?",
			).bind(materialized.personId, args.submissionId, ...(submitterFence ?? [])).run();
			if (submitterFence && (updated.meta.changes ?? 0) === 0) throw new MaterializationClaimLostError();
		}
	}
}

async function rollbackSessionAttempt(db: D1Database, attempt: SessionAttempt, claim: MaterializationClaim, claimNow: number, removeSessionShell: boolean): Promise<void> {
	const claimBindings = [claim.submissionId, claim.ownerToken, claimNow] as const;
	const ownsClaim = `EXISTS (
    SELECT 1 FROM session_materialization_claims
    WHERE submission_id = ? AND owner_token = ? AND lease_expires_at > ?
  )`;
	const statements: D1PreparedStatement[] = [
		...attempt.resources.speakerTaskIds.map((id) => db.prepare(`DELETE FROM speaker_tasks WHERE id = ? AND ${ownsClaim}`).bind(id, ...claimBindings)),
		db.prepare(`UPDATE submissions SET submitter_person_id = ? WHERE id = ? AND ${ownsClaim}`).bind(attempt.originalSubmitterPersonId, attempt.submissionId, ...claimBindings),
		...Array.from(attempt.originalSpeakerPersonIds, ([speakerId, personId]) => db.prepare(`UPDATE submission_speakers SET person_id = ? WHERE id = ? AND submission_id = ? AND ${ownsClaim}`).bind(personId, speakerId, attempt.submissionId, ...claimBindings)),
		...attempt.createdSpeakerIds.map((speakerId) => db.prepare(`DELETE FROM submission_speakers WHERE id = ? AND submission_id = ? AND ${ownsClaim}`).bind(speakerId, attempt.submissionId, ...claimBindings)),
		...attempt.resources.personNameRestores.map((restore) => db.prepare(`UPDATE people SET name = ? WHERE id = ? AND name = ? AND ${ownsClaim}`).bind(restore.originalName, restore.personId, restore.writtenName, ...claimBindings)),
		...attempt.resources.speakerProfileIds.map((id) => db.prepare(`DELETE FROM speaker_profiles WHERE id = ? AND ${ownsClaim}`).bind(id, ...claimBindings)),
		...attempt.resources.eventMembershipIds.map((id) => db.prepare(`DELETE FROM event_members WHERE id = ? AND ${ownsClaim}`).bind(id, ...claimBindings)),
		...attempt.resources.personIds.map((id) => db.prepare(`DELETE FROM people
      WHERE id = ?
        AND NOT EXISTS (SELECT 1 FROM submission_speakers WHERE person_id = ?)
        AND NOT EXISTS (SELECT 1 FROM submissions WHERE submitter_person_id = ?)
        AND NOT EXISTS (SELECT 1 FROM speaker_profiles WHERE person_id = ?)
		AND NOT EXISTS (SELECT 1 FROM event_members WHERE person_id = ?)
		AND NOT EXISTS (SELECT 1 FROM auth_challenges WHERE person_id = ?)
		AND NOT EXISTS (SELECT 1 FROM assets WHERE uploaded_by_person_id = ?)
        AND ${ownsClaim}`).bind(id, id, id, id, id, id, id, ...claimBindings)),
	];
	if (removeSessionShell) statements.push(db.prepare(`DELETE FROM submissions WHERE id = ? AND ${ownsClaim}`).bind(attempt.submissionId, ...claimBindings));
	await db.batch(statements);
}

export async function commitSessionImport(db: D1Database, eventId: string, csv: string): Promise<SessionImportCommit> {
	const preview = await previewSessionImport(db, eventId, csv);
	if (!preview.ok) return preview;
	if (preview.rows.some((row) => row.issues.length > 0 && row.duplicate !== "idempotent")) return { ok: false, error: "Fix CSV validation errors before importing", rows: preview.rows };
	let created = 0; let idempotent = 0; let repaired = 0; let skipped = 0;
	const failures: SessionImportFailure[] = [];
	for (const row of preview.rows) {
		try {
			if (row.duplicate === "idempotent") {
				if (!row.input || !row.importKey) { skipped += 1; continue; }
				const existing = await db.prepare("SELECT id FROM submissions WHERE event_id = ? AND import_key = ?").bind(eventId, row.importKey).first<{ id: string }>();
				const beforeTasks = existing ? await db.prepare("SELECT COUNT(*) AS count FROM speaker_tasks WHERE submission_id = ?").bind(existing.id).first<{ count: number }>() : null;
				await createSession(db, { eventId, origin: "imported", input: row.input, importKey: row.importKey });
				const afterTasks = existing ? await db.prepare("SELECT COUNT(*) AS count FROM speaker_tasks WHERE submission_id = ?").bind(existing.id).first<{ count: number }>() : null;
				if ((afterTasks?.count ?? 0) > (beforeTasks?.count ?? 0)) repaired += 1;
				else idempotent += 1;
				continue;
			}
			if (!row.input || !row.importKey) { skipped += 1; continue; }
			const before = await db.prepare("SELECT id FROM submissions WHERE event_id = ? AND import_key = ?").bind(eventId, row.importKey).first<{ id: string }>();
			await createSession(db, { eventId, origin: "imported", input: row.input, importKey: row.importKey });
			if (before) idempotent += 1; else created += 1;
		} catch (error) {
			failures.push({ row: row.row, error: error instanceof Error ? error.message : "Could not materialize imported session", status: error instanceof SessionMaterializationBusyError ? error.status : 400 });
		}
	}
	const rows = preview.rows.map((row) => {
		const failure = failures.find((item) => item.row === row.row);
		return failure ? { ...row, issues: [...row.issues, `Commit failed: ${failure.error}`] } : row;
	});
	return { ok: true, created, idempotent, repaired, skipped, failed: failures.length, partial: failures.length > 0, rows, failures };
}

export async function cloneSession(db: D1Database, args: { targetEventId: string; sourceSubmissionId: string }): Promise<{ id: string; source: SubmissionRow }> {
	const source = await getSubmissionById(db, args.sourceSubmissionId);
	if (!source) throw new Error("Source session not found");
	if (source.status !== "accepted" && source.status !== "scheduled" && source.status !== "published") throw new Error("Only accepted, scheduled, or published sessions can be cloned");
	const answers = parseAnswers(source.answers_json);
	if (typeof answers.title !== "string" || !answers.title.trim()) throw new Error("Source session has no valid title");
	const sourceSpeakers = await listSpeakersForSubmission(db, source.id);
	const speakers = sourceSpeakers.filter((speaker) => speaker.status === "confirmed").map((speaker) => ({ name: speaker.name, email: speaker.email, bio: speaker.bio }));
	const root = source.lineage_root_submission_id ?? source.id;
	const created = await createSession(db, { eventId: args.targetEventId, origin: "cloned", input: { title: answers.title, abstract: typeof answers.abstract === "string" ? answers.abstract : "", category: source.category, videoUrl: source.video_url, googleDocUrl: source.google_doc_url, supportingUrl: source.supporting_url, speakers }, lineage: { parentSubmissionId: source.id, rootSubmissionId: root, sourceEventId: source.event_id } });
	return { id: created.id, source };
}

export type PublicSession = { event: { id: string; slug: string; name: string; timezone: string }; submission: SubmissionRow; slot: { id: string; roomName: string; startsAt: number; endsAt: number; trackId: string | null }; speakers: SubmissionSpeakerRow[] };

export async function loadPublicSession(db: D1Database, eventSlug: string, submissionId: string): Promise<PublicSession | null> {
	const event = await getEventBySlug(db, eventSlug);
	if (!event) return null;
	const row = await db.prepare(`SELECT s.*, a.id AS agenda_slot_id, a.room_name AS agenda_room_name, a.starts_at AS agenda_starts_at, a.ends_at AS agenda_ends_at, a.track_id AS agenda_track_id FROM submissions s INNER JOIN agenda_slots a ON a.submission_id = s.id AND a.event_id = s.event_id WHERE s.id = ? AND s.event_id = ? AND s.status = 'published'`).bind(submissionId, event.id).first<(SubmissionRow & { agenda_slot_id: string; agenda_room_name: string; agenda_starts_at: number; agenda_ends_at: number; agenda_track_id: string | null })>();
	if (!row) return null;
	const speakers = (await listSpeakersForSubmission(db, submissionId)).filter((speaker) => speaker.status === "confirmed");
	return { event: { id: event.id, slug: event.slug, name: event.name, timezone: event.timezone }, submission: row, slot: { id: row.agenda_slot_id, roomName: row.agenda_room_name, startsAt: row.agenda_starts_at, endsAt: row.agenda_ends_at, trackId: row.agenda_track_id }, speakers };
}

function parseAnswers(raw: string): Record<string, unknown> {
	try { const parsed: unknown = JSON.parse(raw); return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; }
}
