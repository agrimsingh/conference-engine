import type { ContentRevisionRow, SubmissionRow } from "@/lib/db/types";

export type ContentStatus = "draft" | "in_review" | "approved";
export const CONTENT_STATUSES: readonly ContentStatus[] = ["draft", "in_review", "approved"];

export type SessionContent = {
	title: string;
	abstract: string;
	contentStatus: ContentStatus;
};

export function publicationSnapshotFromAnswers(raw: string): { ok: true; snapshot: SessionContent } | { ok: false; error: string } {
	let value: unknown;
	try { value = JSON.parse(raw); } catch { return { ok: false, error: "Session content is invalid JSON. Save valid content before publishing." }; }
	if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Session content must be a JSON object. Save valid content before publishing." };
	const title = Reflect.get(value, "title");
	const abstract = Reflect.get(value, "abstract");
	if (typeof title !== "string" || title.trim().length === 0 || title.length > 240) return { ok: false, error: "Session title must contain 1 to 240 characters before publishing." };
	if (abstract !== undefined && typeof abstract !== "string") return { ok: false, error: "Session abstract must be text before publishing." };
	if (typeof abstract === "string" && abstract.length > 8_000) return { ok: false, error: "Session abstract must be at most 8000 characters before publishing." };
	return { ok: true, snapshot: { title, abstract: abstract ?? "", contentStatus: "draft" } };
}

function answersObject(raw: string): Record<string, unknown> {
	try {
		const value: unknown = JSON.parse(raw);
		if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
	} catch { /* validated below */ }
	return {};
}

export function sessionContentFromRow(row: SubmissionRow): SessionContent {
	const answers = answersObject(row.answers_json);
	return {
		title: typeof answers.title === "string" ? answers.title : "",
		abstract: typeof answers.abstract === "string" ? answers.abstract : "",
		contentStatus: CONTENT_STATUSES.includes(row.content_status as ContentStatus) ? row.content_status as ContentStatus : "draft",
	};
}

export async function updateSessionContent(
	db: D1Database,
	args: { eventId: string; submissionId: string; editorAccountId: string | null; editorName: string; content: Pick<SessionContent, "title" | "abstract"> },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
	const row = await db.prepare("SELECT * FROM submissions WHERE id = ? AND event_id = ?")
		.bind(args.submissionId, args.eventId).first<SubmissionRow>();
	if (!row) return { ok: false, status: 404, error: "Session not found" };
	const title = args.content.title.trim();
	const abstract = args.content.abstract.trim();
	if (!title || title.length > 240) return { ok: false, status: 400, error: "Title must contain 1 to 240 characters" };
	if (abstract.length > 8_000) return { ok: false, status: 400, error: "Abstract must be at most 8000 characters" };
	const previous = sessionContentFromRow(row);
	if (previous.title === title && previous.abstract === abstract) return { ok: true };
	const answers = answersObject(row.answers_json);
	answers.title = title;
	answers.abstract = abstract;
	const now = Date.now();
	const currentHead = await db.prepare(
		"SELECT current_revision_id FROM content_heads WHERE event_id = ? AND entity_type = 'session' AND entity_id = ?",
	).bind(args.eventId, row.id).first<{ current_revision_id: string }>();
	const latest = await db.prepare(
		"SELECT COALESCE(MAX(revision_number), 0) AS revision_number FROM content_revisions WHERE event_id = ? AND entity_type = 'session' AND entity_id = ?",
	).bind(args.eventId, row.id).first<{ revision_number: number }>();
	const revisionId = crypto.randomUUID();
	const snapshot: SessionContent = { title, abstract, contentStatus: "draft" };
	await db.batch([
		db.prepare(
			`INSERT INTO content_revisions (
			 id, event_id, entity_type, entity_id, revision_number, snapshot_json,
			 editor_account_id, editor_name, created_at
			) VALUES (?, ?, 'session', ?, ?, ?, ?, ?, ?)`,
		).bind(revisionId, args.eventId, row.id, (latest?.revision_number ?? 0) + 1, JSON.stringify(snapshot), args.editorAccountId, args.editorName, now),
		currentHead
			? db.prepare("UPDATE content_heads SET current_revision_id = ?, updated_at = ? WHERE event_id = ? AND entity_type = 'session' AND entity_id = ?")
				.bind(revisionId, now, args.eventId, row.id)
			: db.prepare("INSERT INTO content_heads (event_id, entity_type, entity_id, current_revision_id, approved_revision_id, updated_at) VALUES (?, 'session', ?, ?, NULL, ?)")
				.bind(args.eventId, row.id, revisionId, now),
		db.prepare("UPDATE submissions SET answers_json = ?, content_status = ?, updated_at = ? WHERE id = ? AND event_id = ?")
			.bind(JSON.stringify(answers), "draft", now, row.id, args.eventId),
	]);
	return { ok: true };
}

export async function setSessionContentStatus(
	db: D1Database,
	args: { eventId: string; submissionId: string; status: ContentStatus },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
	if (!CONTENT_STATUSES.includes(args.status)) return { ok: false, status: 400, error: "Invalid content status" };
	let row = await db.prepare(
		`SELECT s.id, h.current_revision_id
		 FROM submissions s
		 LEFT JOIN content_heads h ON h.event_id = s.event_id AND h.entity_type = 'session' AND h.entity_id = s.id
		 WHERE s.id = ? AND s.event_id = ?`,
	).bind(args.submissionId, args.eventId).first<{ id: string; current_revision_id: string | null }>();
	if (!row) return { ok: false, status: 404, error: "Session not found" };
	const now = Date.now();
	if (!row.current_revision_id) {
		const submission = await db.prepare("SELECT * FROM submissions WHERE id = ? AND event_id = ?").bind(args.submissionId, args.eventId).first<SubmissionRow>();
		if (!submission) return { ok: false, status: 404, error: "Session not found" };
		const revisionId = crypto.randomUUID();
		await db.batch([
			db.prepare("INSERT INTO content_revisions (id, event_id, entity_type, entity_id, revision_number, snapshot_json, editor_name, created_at) VALUES (?, ?, 'session', ?, 1, ?, 'Initial content', ?)").bind(revisionId, args.eventId, args.submissionId, JSON.stringify(sessionContentFromRow(submission)), now),
			db.prepare("INSERT INTO content_heads (event_id, entity_type, entity_id, current_revision_id, approved_revision_id, updated_at) VALUES (?, 'session', ?, ?, NULL, ?)").bind(args.eventId, args.submissionId, revisionId, now),
		]);
		row = { id: row.id, current_revision_id: revisionId };
	}
	await db.batch([
		db.prepare("UPDATE submissions SET content_status = ?, updated_at = ? WHERE id = ? AND event_id = ?")
			.bind(args.status, now, row.id, args.eventId),
		db.prepare("UPDATE content_heads SET approved_revision_id = ?, updated_at = ? WHERE event_id = ? AND entity_type = 'session' AND entity_id = ?")
			.bind(args.status === "approved" ? row.current_revision_id : null, now, args.eventId, row.id),
	]);
	return { ok: true };
}

export async function restoreSessionRevision(
	db: D1Database,
	args: { eventId: string; submissionId: string; revisionId: string; editorAccountId: string | null; editorName: string },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
	const [row, revision] = await Promise.all([
		db.prepare("SELECT * FROM submissions WHERE id = ? AND event_id = ?").bind(args.submissionId, args.eventId).first<SubmissionRow>(),
		db.prepare(
			"SELECT * FROM content_revisions WHERE id = ? AND event_id = ? AND entity_type = 'session' AND entity_id = ?",
		).bind(args.revisionId, args.eventId, args.submissionId).first<ContentRevisionRow>(),
	]);
	if (!row || !revision) return { ok: false, status: 404, error: "Revision not found" };
	let snapshot: SessionContent;
	try { snapshot = JSON.parse(revision.snapshot_json) as SessionContent; } catch { return { ok: false, status: 409, error: "Revision is invalid" }; }
	if (!snapshot.title || !CONTENT_STATUSES.includes(snapshot.contentStatus)) return { ok: false, status: 409, error: "Revision is invalid" };
	const answers = answersObject(row.answers_json);
	answers.title = snapshot.title;
	answers.abstract = snapshot.abstract;
	const now = Date.now();
	const latest = await db.prepare(
		"SELECT COALESCE(MAX(revision_number), 0) AS revision_number FROM content_revisions WHERE event_id = ? AND entity_type = 'session' AND entity_id = ?",
	).bind(args.eventId, row.id).first<{ revision_number: number }>();
	const restoredId = crypto.randomUUID();
	const restored: SessionContent = { title: snapshot.title, abstract: snapshot.abstract, contentStatus: "draft" };
	await db.batch([
		db.prepare(
			`INSERT INTO content_revisions (
			 id, event_id, entity_type, entity_id, revision_number, snapshot_json,
			 editor_account_id, editor_name, restored_from_revision_id, created_at
			) VALUES (?, ?, 'session', ?, ?, ?, ?, ?, ?, ?)`,
		).bind(restoredId, args.eventId, row.id, (latest?.revision_number ?? 0) + 1, JSON.stringify(restored), args.editorAccountId, args.editorName, revision.id, now),
		db.prepare("UPDATE content_heads SET current_revision_id = ?, updated_at = ? WHERE event_id = ? AND entity_type = 'session' AND entity_id = ?")
			.bind(restoredId, now, args.eventId, row.id),
		db.prepare("UPDATE submissions SET answers_json = ?, content_status = ?, updated_at = ? WHERE id = ? AND event_id = ?")
			.bind(JSON.stringify(answers), "draft", now, row.id, args.eventId),
	]);
	return { ok: true };
}

export async function listSessionRevisions(db: D1Database, eventId: string, submissionIds: string[]): Promise<ContentRevisionRow[]> {
	if (!submissionIds.length) return [];
	const placeholders = submissionIds.map(() => "?").join(", ");
	const rows = await db.prepare(
		`SELECT * FROM content_revisions
		 WHERE event_id = ? AND entity_type = 'session' AND entity_id IN (${placeholders})
		 ORDER BY created_at DESC`,
	).bind(eventId, ...submissionIds).all<ContentRevisionRow>();
	return rows.results;
}
