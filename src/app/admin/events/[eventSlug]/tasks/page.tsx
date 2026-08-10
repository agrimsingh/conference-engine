import { Suspense } from "react";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { listDeliverableBundles } from "@/lib/content/deliverables";
import { getDb } from "@/lib/db/cloudflare";
import { listPeopleByIds, listSubmissionsByIds, listTasksForEvent } from "@/lib/db/queries";
import { titleFromAnswers } from "@/lib/domain/schedule";
import { listEventSpeakerRoster } from "@/lib/speakers/roster";
import { listSpeakerActionAssignments } from "@/lib/speakers/operations";
import type { FileLibraryRow } from "../files/files-library";
import type { DeliverableDashboardRow } from "./deliverables-dashboard";
import { TasksConsole } from "./tasks-console";

function parseAnswers(raw: string): Record<string, unknown> {
	try {
		const value: unknown = JSON.parse(raw);
		return value && typeof value === "object" && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

export default async function AdminTasksPage({
	params,
}: {
	params: Promise<{ eventSlug: string }>;
}) {
	const { eventSlug } = await params;
	const db = await getDb();
	const { event } = await assertCanManageEvent(db, eventSlug);
	const [tasks, bundles, speakers, actions, fileResult] = await Promise.all([
		listTasksForEvent(db, event.id),
		listDeliverableBundles(db, { eventId: event.id }),
		listEventSpeakerRoster(db, event.id),
		listSpeakerActionAssignments(db, { eventId: event.id }),
		db
			.prepare(
				`SELECT st.id AS task_id, a.filename, dv.created_at, COUNT(allv.id) AS version_count,
				 COALESCE(json_extract(s.answers_json, '$.title'), s.id) AS session_title,
				 COALESCE(p.name, p.email) AS speaker_name
				 FROM speaker_tasks st
				 INNER JOIN submissions s ON s.id = st.submission_id AND s.event_id = st.event_id
				 INNER JOIN people p ON p.id = st.person_id
				 INNER JOIN deliverable_versions dv ON dv.task_id = st.id
				   AND dv.version_number = (SELECT MAX(v2.version_number) FROM deliverable_versions v2 WHERE v2.task_id = st.id)
				 INNER JOIN deliverable_versions allv ON allv.task_id = st.id
				 INNER JOIN assets a ON a.id = dv.asset_id AND a.event_id = st.event_id
				 WHERE st.event_id = ?
				 GROUP BY st.id, a.filename, dv.created_at, session_title, speaker_name
				 ORDER BY dv.created_at DESC`,
			)
			.bind(event.id)
			.all<{
				task_id: string;
				filename: string | null;
				created_at: number;
				version_count: number;
				session_title: string;
				speaker_name: string;
			}>(),
	]);
	const [people, submissions] = await Promise.all([
		listPeopleByIds(
			db,
			tasks.map((task) => task.person_id),
		),
		listSubmissionsByIds(
			db,
			tasks.map((task) => task.submission_id),
		),
	]);
	const personLabels = new Map(
		people.map((person) => [person.id, person.name?.trim() || person.email || person.id]),
	);
	const sessionLabels = new Map(
		submissions.map((submission) => [
			submission.id,
			titleFromAnswers(parseAnswers(submission.answers_json)),
		]),
	);
	const deliverableRows: DeliverableDashboardRow[] = tasks
		.filter((task) => (task.template_task_kind ?? "file") === "file")
		.map((task) => ({
			id: task.id,
			personId: task.person_id,
			speaker: personLabels.get(task.person_id) ?? task.person_id,
			session: sessionLabels.get(task.submission_id) ?? task.submission_id,
			label: task.template_label || task.template_key,
			status: task.status,
			dueAt: task.due_at ?? null,
			instructions: task.instructions ?? null,
			versions: (bundles.get(task.id)?.versions ?? []).map((version) => ({
				id: version.id,
				versionNumber: version.version_number,
				filename: version.filename,
				sizeBytes: version.size_bytes,
				createdAt: version.created_at,
			})),
			comments: (bundles.get(task.id)?.comments ?? []).map((comment) => ({
				id: comment.id,
				authorName: comment.author_name,
				authorKind: comment.author_kind,
				body: comment.body,
				createdAt: comment.created_at,
			})),
		}));
	const fileRows: FileLibraryRow[] = fileResult.results.map((row) => ({
		taskId: row.task_id,
		filename: row.filename ?? "deliverable",
		session: row.session_title,
		speaker: row.speaker_name,
		uploadedAt: row.created_at,
		versionCount: row.version_count,
	}));

	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={event.slug} />
			<main className="mx-auto max-w-6xl px-4 py-10">
				<PageHeader
					eyebrow="Organizer · Speaker tasks"
					title={event.name}
					description="Action tasks, file-request deliverables, and the uploaded file library in one workspace."
				/>
				<Suspense
					fallback={
						<p className="mt-8 text-sm text-neutral-500">Loading tasks…</p>
					}
				>
					<TasksConsole
						eventSlug={event.slug}
						speakers={speakers}
						actionRows={actions}
						deliverableRows={deliverableRows}
						fileRows={fileRows}
					/>
				</Suspense>
			</main>
		</div>
	);
}
