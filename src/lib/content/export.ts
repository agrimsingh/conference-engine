import { buildStoredZip, safeZipSegment } from "./zip";

type ExportRow = { task_id: string; r2_key: string; filename: string | null; created_at: number; title: string; speaker_name: string };

export async function exportLatestDeliverables(
	db: D1Database,
	files: R2Bucket,
	args: { eventId: string; taskIds: string[] },
): Promise<{ ok: true; body: Uint8Array; count: number } | { ok: false; status: number; error: string }> {
	const ids = [...new Set(args.taskIds)];
	if (!ids.length || ids.length > 50 || ids.some((id) => !id || id.length > 128)) return { ok: false, status: 400, error: "Choose between 1 and 50 uploaded files" };
	const placeholders = ids.map(() => "?").join(", ");
	const rows = await db.prepare(
		`SELECT st.id AS task_id, a.r2_key, a.filename, dv.created_at,
		 COALESCE(json_extract(s.answers_json, '$.title'), s.id) AS title,
		 COALESCE(p.name, p.email, st.person_id) AS speaker_name
		 FROM speaker_tasks st
		 INNER JOIN submissions s ON s.id = st.submission_id AND s.event_id = st.event_id
		 INNER JOIN people p ON p.id = st.person_id
		 INNER JOIN deliverable_versions dv ON dv.task_id = st.id
		   AND dv.version_number = (SELECT MAX(v2.version_number) FROM deliverable_versions v2 WHERE v2.task_id = st.id)
		 INNER JOIN assets a ON a.id = dv.asset_id AND a.event_id = st.event_id
		 WHERE st.event_id = ? AND st.id IN (${placeholders})`,
	).bind(args.eventId, ...ids).all<ExportRow>();
	// Validate the complete selection before touching R2 so mixed-event and stale
	// identifiers cannot produce a partial archive.
	if (rows.results.length !== ids.length) return { ok: false, status: 404, error: "One or more files are outside this event or unavailable" };
	const entries: Array<{ path: string; bytes: Uint8Array; modifiedAt: number }> = [];
	let total = 0;
	for (const row of rows.results) {
		const object = await files.get(row.r2_key);
		if (!object) return { ok: false, status: 404, error: "One or more files are unavailable" };
		const bytes = new Uint8Array(await object.arrayBuffer());
		total += bytes.length;
		if (total > 25 * 1024 * 1024) return { ok: false, status: 413, error: "Selected files exceed the 25 MB export limit" };
		const filename = safeZipSegment(row.filename ?? "deliverable", "deliverable");
		entries.push({ path: `${safeZipSegment(row.title, "Session")}/${safeZipSegment(row.speaker_name, "Speaker")}/${safeZipSegment(row.task_id.slice(0, 12), "task")}-${filename}`, bytes, modifiedAt: row.created_at });
	}
	return { ok: true, body: buildStoredZip(entries), count: entries.length };
}
