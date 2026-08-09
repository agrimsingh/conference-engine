import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { listDeliverableBundles } from "@/lib/content/deliverables";
import { getDb } from "@/lib/db/cloudflare";
import { listPeopleByIds, listSubmissionsByIds, listTasksForEvent } from "@/lib/db/queries";
import { titleFromAnswers } from "@/lib/domain/schedule";
import { DeliverablesDashboard, type DeliverableDashboardRow } from "./deliverables-dashboard";
import { ActionTasksDashboard } from "./action-tasks-dashboard";
import { listEventSpeakerRoster } from "@/lib/speakers/roster";
import { listSpeakerActionAssignments } from "@/lib/speakers/operations";

function parseAnswers(raw: string): Record<string, unknown> {
	try { const value: unknown = JSON.parse(raw); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; } catch { return {}; }
}

export default async function AdminTasksPage({ params }: { params: Promise<{ eventSlug: string }> }) {
	const { eventSlug } = await params;
	const db = await getDb();
	const { event } = await assertCanManageEvent(db, eventSlug);
	const [tasks, bundles, speakers, actions] = await Promise.all([listTasksForEvent(db, event.id), listDeliverableBundles(db, { eventId: event.id }), listEventSpeakerRoster(db, event.id), listSpeakerActionAssignments(db, { eventId: event.id })]);
	const [people, submissions] = await Promise.all([
		listPeopleByIds(db, tasks.map((task) => task.person_id)),
		listSubmissionsByIds(db, tasks.map((task) => task.submission_id)),
	]);
	const personLabels = new Map(people.map((person) => [person.id, person.name?.trim() || person.email || person.id]));
	const sessionLabels = new Map(submissions.map((submission) => [submission.id, titleFromAnswers(parseAnswers(submission.answers_json))]));
	const rows: DeliverableDashboardRow[] = tasks.filter((task) => (task.template_task_kind ?? "file") === "file").map((task) => ({
		id: task.id, personId: task.person_id, speaker: personLabels.get(task.person_id) ?? task.person_id,
		session: sessionLabels.get(task.submission_id) ?? task.submission_id,
		label: task.template_label || task.template_key, status: task.status, dueAt: task.due_at ?? null,
		instructions: task.instructions ?? null,
		versions: (bundles.get(task.id)?.versions ?? []).map((version) => ({ id: version.id, versionNumber: version.version_number, filename: version.filename, sizeBytes: version.size_bytes, createdAt: version.created_at })),
		comments: (bundles.get(task.id)?.comments ?? []).map((comment) => ({ id: comment.id, authorName: comment.author_name, authorKind: comment.author_kind, body: comment.body, createdAt: comment.created_at })),
	}));
	return <div className="min-h-dvh bg-neutral-950 text-neutral-200"><AdminEventNav eventSlug={event.slug} /><main className="mx-auto max-w-7xl space-y-8 px-4 py-10"><PageHeader eyebrow="Organizer · Speaker tasks" title={event.name} description="Assign general onboarding actions and manage file-request deliverables in separate workflows." /><ActionTasksDashboard eventSlug={event.slug} speakers={speakers} rows={actions} /><DeliverablesDashboard eventSlug={event.slug} rows={rows} /></main></div>;
}
