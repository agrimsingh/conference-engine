import Link from "next/link";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { Chip, EmptyState, StatusPill, submissionStatusTone } from "@/components/ui";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	getActiveEvaluationPlan,
	getSubmissionFacetCounts,
	listPeopleByIds,
	listAssignmentsForPlanSubmissions,
	listAdminSubmissionsPage,
	listLabelsForSubmissions,
	listReviewersForPlan,
	listSpeakersForSubmissions,
	listTasksForSubmissions,
} from "@/lib/db/queries";
import {
	AIE_CATEGORY_LABELS,
	UNCATEGORIZED_CATEGORY,
	displayCategory,
	DECISION_REGISTRY,
} from "@/lib/domain";
import { defaultMessageTemplate, listEventMessageTemplates, renderStoredMessageTemplate } from "@/lib/email/templates";
import { DecisionButtons } from "@/components/decision-buttons";
import { ActivatePlanButton } from "./activate-plan-button";
import { AssignmentControls } from "./assignment-controls";
import { ExportButtons } from "./export-buttons";
import { SubmissionLabels } from "./submission-labels";
import { SubmissionSpeakers, type SpeakerSummary } from "./submission-speakers";

type Props = {
	params: Promise<{ eventSlug: string }>;
	searchParams: Promise<{ category?: string; label?: string; status?: string; q?: string; sort?: string; page?: string }>;
};

export default async function AdminSubmissionsPage({ params, searchParams }: Props) {
	const { eventSlug } = await params;
	const { category: categoryParam, label: labelParam, status: statusParam, q: queryParam, sort: sortParam, page: pageParam } = await searchParams;

	const db = await getDb();
	const { event } = await assertCanManageEvent(db, eventSlug);

	const categoryFilter = categoryParam?.trim() || "all";
	const labelFilter = labelParam?.trim() || "all";
	const statusFilter = statusParam?.trim() || "all";
	const query = queryParam?.trim().toLowerCase() || "";
	const sort = sortParam === "title" || sortParam === "status" ? sortParam : "newest";

	const pageSize = 25;
	const requestedPage = Math.max(1, Number(pageParam) || 1);
	const activePlan = await getActiveEvaluationPlan(db, event.id);
	const [pageResult, facets, reviewers, configuredTemplates] = await Promise.all([
		listAdminSubmissionsPage(db, event.id, { category: categoryFilter, label: labelFilter, status: statusFilter, query, sort, page: requestedPage, pageSize }),
		getSubmissionFacetCounts(db, event.id),
		activePlan ? listReviewersForPlan(db, activePlan.id) : Promise.resolve([]),
		listEventMessageTemplates(db, event.id),
	]);
	const configuredTemplateByKey = new Map(configuredTemplates.map((template) => [template.template_key, template]));
	const totalPages = Math.max(1, Math.ceil(pageResult.total / pageSize));
	const page = Math.min(requestedPage, totalPages);
	const pageRows = page === requestedPage
		? pageResult.rows
		: (await listAdminSubmissionsPage(db, event.id, { category: categoryFilter, label: labelFilter, status: statusFilter, query, sort, page, pageSize })).rows;
	const pageSubmissionIds = pageRows.map((row) => row.id);
	const [pageLabels, pageTasks, bulkSpeakers, planAssignments] = await Promise.all([
		listLabelsForSubmissions(db, pageSubmissionIds),
		listTasksForSubmissions(db, pageSubmissionIds),
		listSpeakersForSubmissions(db, pageSubmissionIds),
		activePlan ? listAssignmentsForPlanSubmissions(db, activePlan.id, pageSubmissionIds) : Promise.resolve([]),
	]);
	const people = await listPeopleByIds(db, pageTasks.map((task) => task.person_id));

	const planReviewers = reviewers;
	const assignedBySubmission = new Map<string, string[]>();
	for (const row of planAssignments) {
		const list = assignedBySubmission.get(row.submission_id) ?? [];
		list.push(row.reviewer_id);
		assignedBySubmission.set(row.submission_id, list);
	}

	const labelsBySubmission = pageLabels;
	const labelCounts = new Map<string, number>();
	for (const row of facets.byLabel) labelCounts.set(row.value, row.count);

	const categoryCounts = new Map<string, number>();
	for (const row of facets.byCategory) categoryCounts.set(displayCategory(row.value), row.count);

	const chipLabels = [
		...AIE_CATEGORY_LABELS,
		...[...categoryCounts.keys()].filter(
			(label) =>
				!(AIE_CATEGORY_LABELS as readonly string[]).includes(label) &&
				label !== UNCATEGORIZED_CATEGORY,
		),
		UNCATEGORIZED_CATEGORY,
	];

	const tasksBySubmission = new Map<string, typeof pageTasks>();
	const speakersBySubmission = new Map<string, SpeakerSummary[]>();
	for (const task of pageTasks) {
		const list = tasksBySubmission.get(task.submission_id) ?? [];
		list.push(task);
		tasksBySubmission.set(task.submission_id, list);
	}
	for (const row of pageRows) {
		const speakers = bulkSpeakers.get(row.id) ?? [];
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
	}
	const personNames = new Map(people.map((person) => [person.id, person.name ?? person.email]));

	const baseHref = `/admin/events/${event.slug}/submissions`;
	const filterHref = (category: string, label: string, extras: Record<string, string> = {}) => {
		const params = new URLSearchParams();
		if (category !== "all") params.set("category", category);
		if (label !== "all") params.set("label", label);
		if (statusFilter !== "all") params.set("status", statusFilter);
		if (query) params.set("q", query);
		if (sort !== "newest") params.set("sort", sort);
		for (const [key, value] of Object.entries(extras)) params.set(key, value);
		const queryString = params.toString();
		return queryString ? `${baseHref}?${queryString}` : baseHref;
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
							{pageResult.total}
							{categoryFilter !== "all" ? ` of ${facets.total}` : ""} shown.{" "}
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
							label={`All (${facets.total})`}
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
					<form className="grid gap-2 pt-3 sm:grid-cols-[1fr_auto_auto]" method="get">
						<input type="search" name="q" defaultValue={queryParam ?? ""} className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100" placeholder="Search title, speaker, email, or abstract" />
						<select name="status" defaultValue={statusFilter} className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"><option value="all">All statuses</option>{facets.byStatus.map(({ value: status }) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select>
						<select name="sort" defaultValue={sort} className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"><option value="newest">Newest</option><option value="title">Title A–Z</option><option value="status">Status</option></select>
						<input type="hidden" name="category" value={categoryFilter === "all" ? "" : categoryFilter} />
						<input type="hidden" name="label" value={labelFilter === "all" ? "" : labelFilter} />
						<button className="justify-self-start rounded-md bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400 sm:col-span-3" type="submit">Apply filters</button>
					</form>
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
					<div className="flex flex-wrap items-start gap-x-6 gap-y-3 pt-3">
						<ActivatePlanButton eventSlug={event.slug} />
						<ExportButtons eventSlug={event.slug} />
					</div>
				</PageHeader>

				{pageResult.total === 0 ? (
					<EmptyState
						title={facets.total === 0 ? "No submissions yet" : "No matching submissions"}
						description={facets.total === 0 ? "Share your CFP link to start collecting talks." : "Try clearing a filter or changing your search."}
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
					<>
					<ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900">
						{pageRows.map((row) => {
							const answers = parseAnswers(row.answers_json);
							const tasks = tasksBySubmission.get(row.id) ?? [];
							const requiredTasks = tasks.filter((task) => task.template_required !== 0);
							const completed = requiredTasks.filter(
								(t) => t.status === "completed",
							).length;
							const category = displayCategory(row.category);
							const title =
								typeof answers.title === "string" ? answers.title : "(untitled)";
							const decisionContext = {
								eventName: event.name,
								submitterName: row.submitter_name ?? "there",
								title,
							};
							const previews = Object.fromEntries(
								Object.entries(DECISION_REGISTRY).map(([action, meta]) => {
									const saved = configuredTemplateByKey.get(meta.templateKey);
									return [action, renderStoredMessageTemplate(
										saved ? { subject: saved.subject_template, text: saved.text_template } : defaultMessageTemplate(meta.templateKey),
										{ ...decisionContext, portalHint: meta.templateKey === "acceptance" ? "Sign in at /portal with your speaker email to complete bio, headshot, slides, and supporting docs." : undefined },
									)];
								}),
							) as ReturnType<typeof import("@/lib/domain").renderDecisionPreviews>;
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
									{activePlan ? (
										<div className="mt-2">
											<AssignmentControls
												key={`${row.id}:${(assignedBySubmission.get(row.id) ?? []).join(",")}`}
												eventSlug={event.slug}
												submissionId={row.id}
												reviewers={planReviewers.map((reviewer) => ({
													id: reviewer.id,
													name: reviewer.name,
												}))}
												assignedReviewerIds={
													assignedBySubmission.get(row.id) ?? []
												}
											/>
										</div>
									) : null}
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
												Speaker tasks {completed}/{requiredTasks.length} required complete
											</p>
											<ul className="mt-1 space-y-0.5">
												{tasks.map((task) => (
													<li key={task.id}>
														{personNames.get(task.person_id) ??
															task.person_id}{" "}
														· {task.template_label || task.template_key} · {task.status}{task.template_required === 0 ? " (optional)" : ""}
													</li>
												))}
											</ul>
										</div>
									) : null}
								</li>
							);
						})}
					</ul>
					{totalPages > 1 ? <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Submission pages">{page <= 1 ? <span className="rounded-md border border-neutral-800 px-3 py-2 text-neutral-600" aria-disabled="true">Previous</span> : <Link className="rounded-md border border-neutral-700 px-3 py-2 text-neutral-200" href={filterHref(categoryFilter, labelFilter, { page: String(page - 1) })}>Previous</Link>}<span className="text-neutral-500">Page {page} of {totalPages}</span>{page >= totalPages ? <span className="rounded-md border border-neutral-800 px-3 py-2 text-neutral-600" aria-disabled="true">Next</span> : <Link className="rounded-md border border-neutral-700 px-3 py-2 text-neutral-200" href={filterHref(categoryFilter, labelFilter, { page: String(page + 1) })}>Next</Link>}</nav> : null}
					</>
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
