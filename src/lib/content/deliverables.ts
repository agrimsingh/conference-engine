import type {
	AssetRow,
	DeliverableCommentRow,
	DeliverableVersionRow,
	SpeakerTaskRow,
} from "@/lib/db/types";

export const MAX_DELIVERABLE_COMMENT_LENGTH = 4_000;
export const MAX_DELIVERABLE_UPLOAD_BYTES = 25 * 1024 * 1024;

export type DeliverableTaskBundle = {
	task: SpeakerTaskRow;
	versions: Array<DeliverableVersionRow & { filename: string | null; content_type: string | null }>;
	comments: DeliverableCommentRow[];
};

export async function listDeliverableBundles(
	db: D1Database,
	args: { eventId?: string; personId?: string },
): Promise<Map<string, DeliverableTaskBundle>> {
	const where = args.eventId ? "st.event_id = ?" : "st.person_id = ?";
	const bind = args.eventId ?? args.personId;
	if (!bind) return new Map();
	const tasks = await db.prepare(
		`SELECT st.* FROM speaker_tasks st
		 WHERE ${where} AND COALESCE(st.template_task_kind, 'file') = 'file'
		 ORDER BY st.created_at DESC`,
	).bind(bind).all<SpeakerTaskRow>();
	const bundles = new Map<string, DeliverableTaskBundle>(tasks.results.map((task) => [task.id, { task, versions: [], comments: [] }]));
	if (!tasks.results.length) return bundles;
	const ids = tasks.results.map((task) => task.id);
	const idsJson = JSON.stringify(ids);
	const [versions, comments] = await Promise.all([
		db.prepare(
			`SELECT dv.*, a.filename, a.content_type
			 FROM deliverable_versions dv
			 INNER JOIN assets a ON a.id = dv.asset_id AND a.event_id = dv.event_id
			 WHERE dv.task_id IN (SELECT value FROM json_each(?))
			 ORDER BY dv.task_id, dv.version_number DESC`,
		).bind(idsJson).all<DeliverableVersionRow & { filename: string | null; content_type: string | null }>(),
		db.prepare(
			`SELECT * FROM deliverable_comments
			 WHERE task_id IN (SELECT value FROM json_each(?))
			 ORDER BY created_at ASC`,
		).bind(idsJson).all<DeliverableCommentRow>(),
	]);
	for (const version of versions.results) bundles.get(version.task_id)?.versions.push(version);
	for (const comment of comments.results) bundles.get(comment.task_id)?.comments.push(comment);
	return bundles;
}

export async function addDeliverableComment(
	db: D1Database,
	args: {
		taskId: string;
		eventId?: string;
		personId?: string;
		authorKind: "speaker" | "organizer";
		authorPersonId?: string | null;
		authorAccountId?: string | null;
		authorName: string;
		body: string;
	},
): Promise<{ ok: true; comment: DeliverableCommentRow } | { ok: false; status: number; error: string }> {
	const task = await db.prepare("SELECT * FROM speaker_tasks WHERE id = ?").bind(args.taskId).first<SpeakerTaskRow>();
	if (!task) return { ok: false, status: 404, error: "Deliverable not found" };
	if (args.eventId && task.event_id !== args.eventId) return { ok: false, status: 404, error: "Deliverable not found" };
	if (args.personId && task.person_id !== args.personId) return { ok: false, status: 404, error: "Deliverable not found" };
	const hasVersion = await db.prepare("SELECT id FROM deliverable_versions WHERE task_id = ? LIMIT 1").bind(task.id).first<{ id: string }>();
	if (!hasVersion) return { ok: false, status: 409, error: "Upload a file before commenting" };
	const body = args.body.trim();
	if (!body || body.length > MAX_DELIVERABLE_COMMENT_LENGTH) {
		return { ok: false, status: 400, error: `Comment must contain 1 to ${MAX_DELIVERABLE_COMMENT_LENGTH} characters` };
	}
	const comment: DeliverableCommentRow = {
		id: crypto.randomUUID(), event_id: task.event_id, task_id: task.id,
		author_kind: args.authorKind,
		author_person_id: args.authorPersonId ?? null,
		author_account_id: args.authorAccountId ?? null,
		author_name: args.authorName.trim() || (args.authorKind === "speaker" ? "Speaker" : "Organizer"),
		body, created_at: Date.now(),
	};
	await db.prepare(
		`INSERT INTO deliverable_comments (
		 id, event_id, task_id, author_kind, author_person_id,
		 author_account_id, author_name, body, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).bind(comment.id, comment.event_id, comment.task_id, comment.author_kind,
		comment.author_person_id, comment.author_account_id, comment.author_name,
		comment.body, comment.created_at).run();
	return { ok: true, comment };
}

export async function createFileRequestForAllSpeakers(
	db: D1Database,
	args: { eventId: string; label: string; instructions: string; dueAt: number },
): Promise<{ templateId: string; assigned: number }> {
	const label = args.label.trim();
	const instructions = args.instructions.trim();
	if (!label || label.length > 160) throw new Error("Task name must contain 1 to 160 characters");
	if (instructions.length > 4_000) throw new Error("Instructions must be at most 4000 characters");
	if (!Number.isFinite(args.dueAt)) throw new Error("Due date is required");
	const existing = await db.prepare(
		"SELECT id FROM task_templates WHERE event_id = ? AND lower(label) = lower(?) AND soft_deleted = 0",
	).bind(args.eventId, label).first<{ id: string }>();
	if (existing) throw new Error("A task with this name already exists");
	const speakers = await db.prepare(
		`SELECT s.id AS submission_id, ss.person_id AS person_id
		 FROM submissions s
		 INNER JOIN submission_speakers ss ON ss.submission_id = s.id
		 WHERE s.event_id = ?
		   AND s.status IN ('accepted', 'scheduled', 'published')
		   AND ss.status IN ('pending', 'confirmed')
		   AND ss.person_id IS NOT NULL
		 GROUP BY s.id, ss.person_id`,
	).bind(args.eventId).all<{ submission_id: string; person_id: string }>();
	const position = await db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM task_templates WHERE event_id = ?")
		.bind(args.eventId).first<{ position: number }>();
	const templateId = crypto.randomUUID();
	const keyBase = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "file-request";
	const key = `${keyBase}-${templateId.slice(0, 8)}`;
	const now = Date.now();
	const statements: D1PreparedStatement[] = [db.prepare(
		`INSERT INTO task_templates (
		 id, event_id, key, label, task_kind, required, position,
		 instructions, due_at, soft_deleted, created_at, updated_at
		) VALUES (?, ?, ?, ?, 'file', 1, ?, ?, ?, 0, ?, ?)`,
	).bind(templateId, args.eventId, key, label, position?.position ?? 0, instructions || null, args.dueAt, now, now)];
	for (const speaker of speakers.results) statements.push(db.prepare(
		`INSERT OR IGNORE INTO speaker_tasks (
		 id, event_id, submission_id, person_id, template_key,
		 template_label, template_task_kind, template_required,
		 instructions, due_at, status, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, 'file', 1, ?, ?, 'pending', ?, ?)`,
	).bind(crypto.randomUUID(), args.eventId, speaker.submission_id, speaker.person_id,
		key, label, instructions || null, args.dueAt, now, now));
	const results = await db.batch(statements);
	return { templateId, assigned: results.slice(1).reduce((sum, result) => sum + (result.meta.changes ?? 0), 0) };
}

export async function resolveDeliverableVersion(
	db: D1Database,
	args: { versionId: string; eventId?: string; personId?: string },
): Promise<{ version: DeliverableVersionRow; asset: AssetRow } | null> {
	const row = await db.prepare(
		`SELECT dv.*, st.person_id AS task_person_id
		 FROM deliverable_versions dv
		 INNER JOIN speaker_tasks st ON st.id = dv.task_id AND st.event_id = dv.event_id
		 WHERE dv.id = ?`,
	).bind(args.versionId).first<DeliverableVersionRow & { task_person_id: string }>();
	if (!row || (args.eventId && row.event_id !== args.eventId) || (args.personId && row.task_person_id !== args.personId)) return null;
	const asset = await db.prepare("SELECT * FROM assets WHERE id = ? AND event_id = ?").bind(row.asset_id, row.event_id).first<AssetRow>();
	return asset ? { version: row, asset } : null;
}

export function deliverableDownloadHeaders(asset: AssetRow): Headers {
	const headers = new Headers();
	const type = asset.content_type && /^[a-z]+\/[a-z0-9.+-]+$/i.test(asset.content_type) ? asset.content_type : "application/octet-stream";
	const filename = (asset.filename ?? "deliverable").replace(/[\\/\r\n"]/g, "_") || "deliverable";
	headers.set("Content-Type", type);
	headers.set("Content-Disposition", `attachment; filename="${filename}"`);
	headers.set("Cache-Control", "private, no-store");
	headers.set("X-Content-Type-Options", "nosniff");
	return headers;
}
