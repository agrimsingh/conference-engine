import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { FilesLibrary, type FileLibraryRow } from "./files-library";

export default async function FilesPage({ params }: { params: Promise<{ eventSlug: string }> }) {
	const { eventSlug } = await params; const db = await getDb(); const { event } = await assertCanManageEvent(db, eventSlug);
	const result = await db.prepare(`SELECT st.id AS task_id, a.filename, dv.created_at, COUNT(allv.id) AS version_count, COALESCE(json_extract(s.answers_json, '$.title'), s.id) AS session_title, COALESCE(p.name, p.email) AS speaker_name FROM speaker_tasks st INNER JOIN submissions s ON s.id = st.submission_id AND s.event_id = st.event_id INNER JOIN people p ON p.id = st.person_id INNER JOIN deliverable_versions dv ON dv.task_id = st.id AND dv.version_number = (SELECT MAX(v2.version_number) FROM deliverable_versions v2 WHERE v2.task_id = st.id) INNER JOIN deliverable_versions allv ON allv.task_id = st.id INNER JOIN assets a ON a.id = dv.asset_id AND a.event_id = st.event_id WHERE st.event_id = ? GROUP BY st.id, a.filename, dv.created_at, session_title, speaker_name ORDER BY dv.created_at DESC`).bind(event.id).all<{ task_id: string; filename: string | null; created_at: number; version_count: number; session_title: string; speaker_name: string }>();
	const rows: FileLibraryRow[] = result.results.map((row) => ({ taskId: row.task_id, filename: row.filename ?? "deliverable", session: row.session_title, speaker: row.speaker_name, uploadedAt: row.created_at, versionCount: row.version_count }));
	return <div className="min-h-dvh bg-neutral-950 text-neutral-200"><AdminEventNav eventSlug={event.slug} /><main className="mx-auto max-w-6xl px-4 py-10"><PageHeader eyebrow="Organizer · Files" title={event.name} description="Central library of uploaded deliverables across sessions, with immutable version counts and latest-version ZIP export." />{rows.length ? <FilesLibrary eventSlug={event.slug} rows={rows} /> : <EmptyState title="No uploaded files" description="Create a file request in Deliverables, then uploads appear here with session and speaker metadata." />}</main></div>;
}
