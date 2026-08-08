import { notFound, redirect } from "next/navigation";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { EmptyState, StatusPill } from "@/components/ui";
import { isAdminBypass } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	getEventBySlug,
	getPersonById,
	getSubmissionById,
	listTasksForEvent,
} from "@/lib/db/queries";

type Props = {
	params: Promise<{ eventSlug: string }>;
};

export default async function AdminTasksPage({ params }: Props) {
	const { eventSlug } = await params;

	if (!(await isAdminBypass())) {
		redirect(`/admin/bypass?next=/admin/events/${eventSlug}/tasks`);
	}

	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) notFound();

	const tasks = await listTasksForEvent(db, event.id);
	const labels = new Map<string, string>();

	for (const task of tasks) {
		if (!labels.has(task.person_id)) {
			const person = await getPersonById(db, task.person_id);
			labels.set(task.person_id, person?.email ?? task.person_id);
		}
		if (!labels.has(task.submission_id)) {
			const submission = await getSubmissionById(db, task.submission_id);
			if (submission) {
				const answers = parseAnswers(submission.answers_json);
				labels.set(
					task.submission_id,
					typeof answers.title === "string" ? answers.title : submission.id,
				);
			}
		}
	}

	const completed = tasks.filter((t) => t.status === "completed").length;

	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={event.slug} />
			<main className="mx-auto max-w-4xl px-4 py-10">
				<PageHeader
					eyebrow="Organizer · Tasks"
					title={event.name}
					description={
						tasks.length === 0
							? "Speaker onboarding checklist across accepted talks."
							: `${completed}/${tasks.length} tasks complete.`
					}
				/>

				{tasks.length === 0 ? (
					<EmptyState
						title="No speaker tasks yet"
						description="Accept a submission to generate bio, headshot, slides, and docs tasks."
					/>
				) : (
					<ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900">
						{tasks.map((task) => (
							<li key={task.id} className="px-4 py-3 text-sm">
								<div className="flex flex-wrap items-baseline justify-between gap-2">
									<p className="font-medium text-neutral-100">
										{labels.get(task.submission_id) ?? task.submission_id} ·{" "}
										{task.template_key}
									</p>
									<StatusPill
										tone={task.status === "completed" ? "positive" : "warning"}
									>
										{task.status}
									</StatusPill>
								</div>
								<p className="mt-1 text-neutral-400">
									{labels.get(task.person_id) ?? task.person_id}
									{task.asset_id ? ` · file uploaded` : ""}
									{task.text_value
										? ` · ${task.text_value.slice(0, 80)}${task.text_value.length > 80 ? "…" : ""}`
										: ""}
								</p>
							</li>
						))}
					</ul>
				)}
			</main>
		</div>
	);
}

function parseAnswers(raw: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		// ignore
	}
	return {};
}
