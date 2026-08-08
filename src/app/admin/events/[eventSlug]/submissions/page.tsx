import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { Chip, EmptyState, StatusPill, submissionStatusTone } from "@/components/ui";
import { isAdminBypass } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	getEventBySlug,
	getPersonById,
	listLabelsForEvent,
	listSpeakersForSubmission,
	listSubmissionsForEvent,
	listTasksForSubmission,
} from "@/lib/db/queries";
import {
	AIE_CATEGORY_LABELS,
	UNCATEGORIZED_CATEGORY,
	displayCategory,
	renderDecisionPreviews,
} from "@/lib/domain";
import { DecisionButtons } from "@/components/decision-buttons";
import { ActivatePlanButton } from "./activate-plan-button";
import { SubmissionLabels } from "./submission-labels";
import { SubmissionSpeakers, type SpeakerSummary } from "./submission-speakers";

type Props = {
	params: Promise<{ eventSlug: string }>;
	searchParams: Promise<{ category?: string; label?: string }>;
};

export default async function AdminSubmissionsPage({ params, searchParams }: Props) {
	const { eventSlug } = await params;
	const { category: categoryParam, label: labelParam } = await searchParams;

	if (!(await isAdminBypass())) {
		redirect(`/admin/bypass?next=/admin/events/${eventSlug}/submissions`);
	}

	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) notFound();

	const submissions = await listSubmissionsForEvent(db, event.id);
	const categoryFilter = categoryParam?.trim() || "all";
	const labelFilter = labelParam?.trim() || "all";

	const labelRows = await listLabelsForEvent(db, event.id);
	const labelsBySubmission = new Map<string, string[]>();
	const labelCounts = new Map<string, number>();
	for (const row of labelRows) {
		const list = labelsBySubmission.get(row.submission_id) ?? [];
		list.push(row.label);
		labelsBySubmission.set(row.submission_id, list);
		labelCounts.set(row.label, (labelCounts.get(row.label) ?? 0) + 1);
	}

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

	const filtered = submissions.filter(
		(row) =>
			(categoryFilter === "all" ||
				displayCategory(row.category) === categoryFilter) &&
			(labelFilter === "all" ||
				(labelsBySubmission.get(row.id) ?? []).includes(labelFilter)),
	);

	const tasksBySubmission = new Map<
		string,
		Awaited<ReturnType<typeof listTasksForSubmission>>
	>();
	const speakersBySubmission = new Map<string, SpeakerSummary[]>();
	const personNames = new Map<string, string>();

	for (const row of filtered) {
		const speakers = await listSpeakersForSubmission(db, row.id);
		speakersBySubmission.set(
			row.id,
			speakers.map((speaker) => ({
				id: speaker.id,
				name: speaker.name,
				email: speaker.email,
				position: speaker.position,
				status: speaker.status,
				addedAfterAcceptance: speaker.added_after_acceptance === 1,
			})),
		);
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
	const filterHref = (category: string, label: string) => {
		const params = new URLSearchParams();
		if (category !== "all") params.set("category", category);
		if (label !== "all") params.set("label", label);
		const query = params.toString();
		return query ? `${baseHref}?${query}` : baseHref;
	};

	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
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
								className="font-medium text-neutral-100 underline underline-offset-2"
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
							href={filterHref("all", labelFilter)}
							label={`All (${submissions.length})`}
						/>
						{chipLabels.map((label) => {
							const count = categoryCounts.get(label) ?? 0;
							return (
								<CategoryChip
									key={label}
									active={categoryFilter === label}
									href={filterHref(label, labelFilter)}
									label={`${label} (${count})`}
								/>
							);
						})}
					</div>
					{labelCounts.size > 0 ? (
						<div className="flex flex-wrap items-center gap-1.5 pt-2">
							<span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
								Labels
							</span>
							<CategoryChip
								active={labelFilter === "all"}
								href={filterHref(categoryFilter, "all")}
								label="All"
							/>
							{[...labelCounts.entries()].map(([label, count]) => (
								<CategoryChip
									key={label}
									active={labelFilter === label}
									href={filterHref(categoryFilter, label)}
									label={`${label} (${count})`}
								/>
							))}
						</div>
					) : null}
					<div className="pt-3">
						<ActivatePlanButton eventSlug={event.slug} />
					</div>
				</PageHeader>

				{filtered.length === 0 ? (
					<EmptyState
						title="No submissions yet"
						description="Share your CFP link to start collecting talks."
					>
						<p className="mt-4">
							<Link
								className="text-sm font-medium text-neutral-200 underline underline-offset-2"
								href={`/e/${event.slug}/submit/cfp`}
							>
								/e/{event.slug}/submit/cfp
							</Link>
						</p>
					</EmptyState>
				) : (
					<ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900">
						{filtered.map((row) => {
							const answers = parseAnswers(row.answers_json);
							const tasks = tasksBySubmission.get(row.id) ?? [];
							const completed = tasks.filter(
								(t) => t.status === "completed",
							).length;
							const category = displayCategory(row.category);
							const title =
								typeof answers.title === "string" ? answers.title : "(untitled)";
							const previews = renderDecisionPreviews({
								eventName: event.name,
								submitterName: row.submitter_name ?? "there",
								title,
							});
							return (
								<li key={row.id} className="px-4 py-3 text-sm">
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div>
											<p className="font-medium text-neutral-100">{title}</p>
											<p className="mt-1 text-neutral-400">
												{row.submitter_name} · {row.submitter_email}
												{typeof answers.format === "string"
													? ` · ${answers.format}`
													: ""}
											</p>
										</div>
										<div className="flex flex-wrap justify-end gap-1.5">
											<Chip>{category}</Chip>
											<StatusPill tone={submissionStatusTone(row.status)}>
												{row.status.replaceAll("_", " ")}
											</StatusPill>
										</div>
									</div>
									<div className="mt-2">
										<SubmissionSpeakers
											eventSlug={event.slug}
											submissionId={row.id}
											speakers={speakersBySubmission.get(row.id) ?? []}
										/>
									</div>
									<div className="mt-2">
										<SubmissionLabels
											eventSlug={event.slug}
											submissionId={row.id}
											labels={labelsBySubmission.get(row.id) ?? []}
										/>
									</div>
									<div className="mt-3">
										<DecisionButtons
											eventSlug={event.slug}
											submissionId={row.id}
											status={row.status}
											previews={previews}
										/>
									</div>
									{tasks.length > 0 ? (
										<div className="mt-3 rounded-md border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-xs text-neutral-400">
											<p className="font-medium text-neutral-300">
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
					? "rounded-full border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-100"
					: "rounded-full border border-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
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
