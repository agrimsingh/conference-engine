import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
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
import { RejectButton } from "./reject-button";

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
		<div className="min-h-dvh bg-neutral-50 text-neutral-900">
			<AdminEventNav eventSlug={event.slug} />
			<main className="mx-auto max-w-4xl px-4 py-10">
				<PageHeader
					eyebrow="Organizer · Submissions"
					title={event.name}
					description={
						<>
							Triage proposals by category, then accept or reject.{" "}
							{filtered.length}
							{categoryFilter !== "all" ? ` of ${submissions.length}` : ""} shown.{" "}
							<Link
								className="font-medium text-neutral-900 underline underline-offset-2"
								href={`/e/${event.slug}/submit/cfp`}
							>
								Share CFP link
							</Link>
						</>
					}
				>
					<div className="flex flex-wrap gap-1.5 pt-2">
						<CategoryChip
							active={categoryFilter === "all"}
							href={baseHref}
							label={`All (${submissions.length})`}
						/>
						{chipLabels.map((label) => {
							const count = categoryCounts.get(label) ?? 0;
							return (
								<CategoryChip
									key={label}
									active={categoryFilter === label}
									href={`${baseHref}?category=${encodeURIComponent(label)}`}
									label={`${label} (${count})`}
								/>
							);
						})}
					</div>
					<div className="pt-3">
						<ActivatePlanButton eventSlug={event.slug} />
					</div>
				</PageHeader>

				{filtered.length === 0 ? (
					<div className="rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-10 text-center">
						<p className="text-sm font-medium text-neutral-900">
							No submissions yet
						</p>
						<p className="mt-1 text-sm text-neutral-600">
							Share your CFP link to start collecting talks.
						</p>
						<p className="mt-4">
							<Link
								className="text-sm font-medium underline underline-offset-2"
								href={`/e/${event.slug}/submit/cfp`}
							>
								/e/{event.slug}/submit/cfp
							</Link>
						</p>
					</div>
				) : (
					<ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
						{filtered.map((row) => {
							const answers = parseAnswers(row.answers_json);
							const tasks = tasksBySubmission.get(row.id) ?? [];
							const canDecide =
								row.status === "submitted" || row.status === "under_review";
							const completed = tasks.filter(
								(t) => t.status === "completed",
							).length;
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
										</div>
										<div className="flex flex-col items-end gap-2">
											<div className="flex flex-wrap justify-end gap-1.5">
												<span className="rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-xs text-neutral-700">
													{category}
												</span>
												<span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-neutral-700">
													{row.status.replaceAll("_", " ")}
												</span>
											</div>
											{(canDecide ||
												row.status === "accepted" ||
												row.status === "rejected") && (
												<div className="flex gap-2">
													<AcceptButton
														eventSlug={event.slug}
														submissionId={row.id}
														disabled={
															!canDecide || row.status === "accepted"
														}
													/>
													<RejectButton
														eventSlug={event.slug}
														submissionId={row.id}
														disabled={
															!canDecide || row.status === "rejected"
														}
													/>
												</div>
											)}
										</div>
									</div>
									{tasks.length > 0 ? (
										<div className="mt-3 rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
											<p className="font-medium">
												Speaker tasks {completed}/{tasks.length}
											</p>
											<ul className="mt-1 space-y-0.5">
												{tasks.map((task) => (
													<li key={task.id}>
														{personNames.get(task.person_id) ??
															task.person_id}{" "}
														· {task.template_key} · {task.status}
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
		</div>
	);
}

function CategoryChip({
	active,
	href,
	label,
}: {
	active: boolean;
	href: string;
	label: string;
}) {
	return (
		<Link
			href={href}
			className={
				active
					? "rounded-full bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white"
					: "rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-400"
			}
		>
			{label}
		</Link>
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
