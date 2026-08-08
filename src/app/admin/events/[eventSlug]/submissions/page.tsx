import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdminBypass } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	getEventBySlug,
	getPersonById,
	listSubmissionsForEvent,
	listTasksForSubmission,
} from "@/lib/db/queries";
import { AcceptButton } from "./accept-button";
import { ActivatePlanButton } from "./activate-plan-button";

type Props = {
	params: Promise<{ eventSlug: string }>;
};

export default async function AdminSubmissionsPage({ params }: Props) {
	const { eventSlug } = await params;

	if (!(await isAdminBypass())) {
		redirect(`/admin/bypass?next=/admin/events/${eventSlug}/submissions`);
	}

	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) notFound();

	const submissions = await listSubmissionsForEvent(db, event.id);
	const tasksBySubmission = new Map<
		string,
		Awaited<ReturnType<typeof listTasksForSubmission>>
	>();
	const personNames = new Map<string, string>();

	for (const row of submissions) {
		const tasks = await listTasksForSubmission(db, row.id);
		tasksBySubmission.set(row.id, tasks);
		for (const task of tasks) {
			if (!personNames.has(task.person_id)) {
				const person = await getPersonById(db, task.person_id);
				personNames.set(
					task.person_id,
					person?.name ?? person?.email ?? task.person_id,
				);
			}
		}
	}

	return (
		<main className="mx-auto min-h-screen max-w-4xl px-4 py-10 text-neutral-900">
			<header className="mb-8 space-y-2 border-b border-neutral-200 pb-4">
				<p className="text-xs uppercase tracking-wide text-neutral-500">
					Organizer · local admin bypass cookie
				</p>
				<h1 className="text-3xl font-semibold tracking-tight">{event.name}</h1>
				<p className="text-sm text-neutral-600">
					Submissions ({submissions.length}). Auth is a temporary{" "}
					<code className="text-xs">ce_admin_bypass=1</code> cookie via{" "}
					<Link className="underline" href="/admin/bypass">
						/admin/bypass
					</Link>
					.
				</p>
				<p className="text-sm">
					Public CFP:{" "}
					<Link className="underline" href={`/e/${event.slug}/submit/cfp`}>
						/e/{event.slug}/submit/cfp
					</Link>
					{" · "}
					<Link className="underline" href={`/admin/events/${event.slug}/tasks`}>
						Speaker tasks
					</Link>
					{" · "}
					<Link className="underline" href={`/review?event=${event.slug}`}>
						Review board
					</Link>
					{" · "}
					<Link className="underline" href="/portal">
						Speaker portal
					</Link>
				</p>
				<div className="pt-1">
					<ActivatePlanButton eventSlug={event.slug} />
				</div>
			</header>

			{submissions.length === 0 ? (
				<p className="text-sm text-neutral-600">No submissions yet.</p>
			) : (
				<ul className="divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
					{submissions.map((row) => {
						const answers = parseAnswers(row.answers_json);
						const tasks = tasksBySubmission.get(row.id) ?? [];
						const canAccept =
							row.status === "submitted" || row.status === "under_review";
						const completed = tasks.filter((t) => t.status === "completed").length;
						return (
							<li key={row.id} className="px-4 py-3 text-sm">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div>
										<p className="font-medium">
											{typeof answers.title === "string"
												? answers.title
												: "(untitled)"}
										</p>
										<p className="mt-1 text-neutral-600">
											{row.submitter_name} · {row.submitter_email}
											{typeof answers.format === "string"
												? ` · ${answers.format}`
												: ""}
										</p>
										<p className="mt-1 font-mono text-xs text-neutral-500">
											{row.id}
										</p>
									</div>
									<div className="flex flex-col items-end gap-2">
										<span className="rounded bg-neutral-100 px-2 py-0.5 text-xs uppercase tracking-wide">
											{row.status}
										</span>
										{(canAccept || row.status === "accepted") && (
											<AcceptButton
												eventSlug={event.slug}
												submissionId={row.id}
												disabled={!canAccept && row.status !== "accepted"}
											/>
										)}
									</div>
								</div>
								{tasks.length > 0 ? (
									<div className="mt-3 rounded bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
										<p className="font-medium">
											Tasks {completed}/{tasks.length}
										</p>
										<ul className="mt-1 space-y-0.5">
											{tasks.map((task) => (
												<li key={task.id}>
													{personNames.get(task.person_id) ?? task.person_id} ·{" "}
													{task.template_key} · {task.status}
												</li>
											))}
										</ul>
									</div>
								) : null}
							</li>
						);
					})}
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
