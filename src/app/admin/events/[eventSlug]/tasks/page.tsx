import Link from "next/link";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { EmptyState, StatusPill } from "@/components/ui";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	getPersonById,
	getSubmissionById,
	listPendingCoSpeakersForEvent,
	listTasksForEvent,
} from "@/lib/db/queries";
import { titleFromAnswers } from "@/lib/domain";

type Props = {
	params: Promise<{ eventSlug: string }>;
};

export default async function AdminTasksPage({ params }: Props) {
	const { eventSlug } = await params;

	const db = await getDb();
	const { event } = await assertCanManageEvent(db, eventSlug);

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
	const pendingCoSpeakers = await listPendingCoSpeakersForEvent(db, event.id);

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

				{pendingCoSpeakers.length > 0 ? (
					<div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm">
						<div className="flex flex-wrap items-baseline justify-between gap-2">
							<p className="font-medium text-neutral-100">
								Co-speakers awaiting confirmation
							</p>
							<Link
								className="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
								href={`/admin/events/${event.slug}/submissions`}
							>
								Manage on submissions
							</Link>
						</div>
						<ul className="mt-2 divide-y divide-neutral-800">
							{pendingCoSpeakers.map((row) => (
								<li
									key={row.id}
									className="flex flex-wrap items-center justify-between gap-2 py-2"
								>
									<span>
										<span className="font-medium text-neutral-200">
											{row.name || row.email}
										</span>
										<span className="text-neutral-500">
											{" "}
											· {titleFromAnswers(parseAnswers(row.answers_json))}
										</span>
										{row.added_after_acceptance === 1 ? (
											<span className="ml-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-400">
												added late
											</span>
										) : null}
									</span>
									<StatusPill tone="warning">
										{row.invited_at ? "invite sent" : "not invited"}
									</StatusPill>
								</li>
							))}
						</ul>
					</div>
				) : null}

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
								{task.asset_id ? (
									<Link className="mt-2 inline-block text-xs font-medium text-neutral-200 underline underline-offset-2 hover:text-white" href={`/api/admin/events/${event.slug}/tasks/${task.id}/asset`}>
										Download uploaded file
									</Link>
								) : null}
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
