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
import {
	AIE_CATEGORY_LABELS,
	UNCATEGORIZED_CATEGORY,
	displayCategory,
} from "@/lib/domain";
import { AcceptButton } from "./accept-button";
import { ActivatePlanButton } from "./activate-plan-button";

type Props = {
	params: Promise<{ eventSlug: string }>;
	searchParams: Promise<{ category?: string }>;
};

export default async function AdminSubmissionsPage({ params, searchParams }: Props) {
	const { eventSlug } = await params;
	const { category: categoryParam } = await searchParams;

	if (!(await isAdminBypass())) {
		redirect(`/admin/bypass?next=/admin/events/${eventSlug}/submissions`);
	}

	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) notFound();

	const submissions = await listSubmissionsForEvent(db, event.id);
	const categoryFilter = categoryParam?.trim() || "all";

	const categoryCounts = new Map<string, number>();
	for (const row of submissions) {
		const label = displayCategory(row.category);
		categoryCounts.set(label, (categoryCounts.get(label) ?? 0) + 1);
	}

	const chipLabels = [
		...AIE_CATEGORY_LABELS,
		...[...categoryCounts.keys()].filter(
			(label) =>
				!(AIE_CATEGORY_LABELS as readonly string[]).includes(label) &&
				label !== UNCATEGORIZED_CATEGORY,
		),
		UNCATEGORIZED_CATEGORY,
	];

	const filtered =
		categoryFilter === "all"
			? submissions
			: submissions.filter(
					(row) => displayCategory(row.category) === categoryFilter,
				);

	const tasksBySubmission = new Map<
		string,
		Awaited<ReturnType<typeof listTasksForSubmission>>
	>();
	const personNames = new Map<string, string>();

	for (const row of filtered) {
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

	const baseHref = `/admin/events/${event.slug}/submissions`;

	return (
		<main className="mx-auto min-h-screen max-w-4xl px-4 py-10 text-neutral-900">
			<header className="mb-8 space-y-2 border-b border-neutral-200 pb-4">
				<p className="text-xs uppercase tracking-wide text-neutral-500">
					Organizer · local admin bypass cookie
				</p>
				<h1 className="text-3xl font-semibold tracking-tight">{event.name}</h1>
				<p className="text-sm text-neutral-600">
					Submissions ({filtered.length}
					{categoryFilter !== "all" ? ` of ${submissions.length}` : ""}). Auth is
					a temporary <code className="text-xs">ce_admin_bypass=1</code> cookie
					via{" "}
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
					<Link className="underline" href={`/admin/events/${event.slug}/schedule`}>
						Schedule
					</Link>
					{" · "}
					<Link className="underline" href={`/admin/events/${event.slug}/dashboard`}>
						Outstanding dashboard
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
					<Link className="underline" href={`/e/${event.slug}/schedule`}>
						Public schedule
					</Link>
					{" · "}
					<Link className="underline" href="/portal">
						Speaker portal
					</Link>
				</p>
				<div className="flex flex-wrap gap-2 pt-2 text-sm">
					<Link
						className={
							categoryFilter === "all"
								? "rounded border border-neutral-900 bg-neutral-900 px-2 py-0.5 text-xs text-white"
								: "rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700"
						}
						href={baseHref}
					>
						All ({submissions.length})
					</Link>
					{chipLabels.map((label) => {
						const count = categoryCounts.get(label) ?? 0;
						const active = categoryFilter === label;
						return (
							<Link
								key={label}
								className={
									active
										? "rounded border border-neutral-900 bg-neutral-900 px-2 py-0.5 text-xs text-white"
										: "rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700"
								}
								href={`${baseHref}?category=${encodeURIComponent(label)}`}
							>
								{label} ({count})
							</Link>
						);
					})}
				</div>
				<div className="pt-1">
					<ActivatePlanButton eventSlug={event.slug} />
				</div>
			</header>

			{filtered.length === 0 ? (
				<p className="text-sm text-neutral-600">No submissions yet.</p>
			) : (
				<ul className="divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
					{filtered.map((row) => {
						const answers = parseAnswers(row.answers_json);
						const tasks = tasksBySubmission.get(row.id) ?? [];
						const canAccept =
							row.status === "submitted" || row.status === "under_review";
						const completed = tasks.filter((t) => t.status === "completed").length;
						const category = displayCategory(row.category);
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
										<div className="flex flex-wrap justify-end gap-1.5">
											<span className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs tracking-wide text-neutral-700">
												{category}
											</span>
											<span className="rounded bg-neutral-100 px-2 py-0.5 text-xs uppercase tracking-wide">
												{row.status}
											</span>
										</div>
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
