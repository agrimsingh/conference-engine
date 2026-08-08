import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
		<main className="mx-auto min-h-screen max-w-4xl px-4 py-10 text-neutral-900">
			<header className="mb-8 space-y-2 border-b border-neutral-200 pb-4">
				<p className="text-xs uppercase tracking-wide text-neutral-500">
					Organizer · speaker tasks
				</p>
				<h1 className="text-3xl font-semibold tracking-tight">{event.name}</h1>
				<p className="text-sm text-neutral-600">
					{completed}/{tasks.length} tasks complete.{" "}
					<Link
						className="underline"
						href={`/admin/events/${event.slug}/dashboard`}
					>
						Live outstanding dashboard
					</Link>
					{" · "}
					<Link
						className="underline"
						href={`/admin/events/${event.slug}/submissions`}
					>
						Back to submissions
					</Link>
				</p>
			</header>

			{tasks.length === 0 ? (
				<p className="text-sm text-neutral-600">
					No speaker tasks yet. Accept a submission first.
				</p>
			) : (
				<ul className="divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
					{tasks.map((task) => (
						<li key={task.id} className="px-4 py-3 text-sm">
							<div className="flex flex-wrap items-baseline justify-between gap-2">
								<p className="font-medium">
									{labels.get(task.submission_id) ?? task.submission_id} ·{" "}
									{task.template_key}
								</p>
								<span className="rounded bg-neutral-100 px-2 py-0.5 text-xs uppercase tracking-wide">
									{task.status}
								</span>
							</div>
							<p className="mt-1 text-neutral-600">
								{labels.get(task.person_id) ?? task.person_id}
								{task.asset_id ? ` · asset ${task.asset_id}` : ""}
								{task.text_value
									? ` · ${task.text_value.slice(0, 80)}${task.text_value.length > 80 ? "…" : ""}`
									: ""}
							</p>
						</li>
					))}
				</ul>
			)}
		</main>
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
