import Link from "next/link";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	decisionNotifiedLabel,
	getActiveEvaluationPlan,
	getSubmissionFacetCounts,
	getSubmissionQueueCounts,
	listAssignmentsForPlanSubmissions,
	listAdminSubmissionsPage,
	listDecisionNotifiedForSubmissions,
	listLabelsForSubmissions,
	listSpeakersForSubmissions,
	listTasksForSubmissions,
} from "@/lib/db/queries";
import {
	AIE_CATEGORY_LABELS,
	UNCATEGORIZED_CATEGORY,
	displayCategory,
	isSubmissionQueueTab,
	renderMessageTemplate,
	SUBMISSION_QUEUE_LABELS,
	SUBMISSION_QUEUE_TABS,
	type SubmissionQueueTab,
} from "@/lib/domain";
import { ActivatePlanButton } from "./activate-plan-button";
import { BulkNotifyBar } from "./bulk-notify-bar";
import { ExportButtons } from "./export-buttons";
import { SubmissionRow } from "./submission-row";

type Props = {
	params: Promise<{ eventSlug: string }>;
	searchParams: Promise<{
		category?: string;
		label?: string;
		status?: string;
		q?: string;
		sort?: string;
		page?: string;
		queue?: string;
	}>;
};

export default async function AdminSubmissionsPage({ params, searchParams }: Props) {
	const { eventSlug } = await params;
	const {
		category: categoryParam,
		label: labelParam,
		status: statusParam,
		q: queryParam,
		sort: sortParam,
		page: pageParam,
		queue: queueParam,
	} = await searchParams;

	const db = await getDb();
	const { event } = await assertCanManageEvent(db, eventSlug);

	const categoryFilter = categoryParam?.trim() || "all";
	const labelFilter = labelParam?.trim() || "all";
	const statusFilter = statusParam?.trim() || "all";
	const query = queryParam?.trim().toLowerCase() || "";
	const sort = sortParam === "title" || sortParam === "status" ? sortParam : "newest";
	const queue: SubmissionQueueTab =
		queueParam && isSubmissionQueueTab(queueParam) ? queueParam : "pending";

	const pageSize = 25;
	const requestedPage = Math.max(1, Number(pageParam) || 1);
	const activePlan = await getActiveEvaluationPlan(db, event.id);
	const [pageResult, facets, queueCounts] = await Promise.all([
		listAdminSubmissionsPage(db, event.id, {
			category: categoryFilter,
			label: labelFilter,
			status: statusFilter,
			query,
			sort,
			page: requestedPage,
			pageSize,
			queue,
		}),
		getSubmissionFacetCounts(db, event.id),
		getSubmissionQueueCounts(db, event.id),
	]);
	const totalPages = Math.max(1, Math.ceil(pageResult.total / pageSize));
	const page = Math.min(requestedPage, totalPages);
	const pageRows =
		page === requestedPage
			? pageResult.rows
			: (
					await listAdminSubmissionsPage(db, event.id, {
						category: categoryFilter,
						label: labelFilter,
						status: statusFilter,
						query,
						sort,
						page,
						pageSize,
						queue,
					})
				).rows;
	const pageSubmissionIds = pageRows.map((row) => row.id);
	const [pageLabels, pageTasks, bulkSpeakers, planAssignments, notifiedById] =
		await Promise.all([
			listLabelsForSubmissions(db, pageSubmissionIds),
			listTasksForSubmissions(db, pageSubmissionIds),
			listSpeakersForSubmissions(db, pageSubmissionIds),
			activePlan
				? listAssignmentsForPlanSubmissions(db, activePlan.id, pageSubmissionIds)
				: Promise.resolve([]),
			listDecisionNotifiedForSubmissions(db, pageSubmissionIds),
		]);

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
	const speakersBySubmission = new Map<string, Array<{ id: string; name: string }>>();
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
			})),
		);
	}

	const baseHref = `/admin/events/${event.slug}/submissions`;
	const buildFilterParams = (
		category: string,
		label: string,
		extras: Record<string, string> = {},
	) => {
		const params = new URLSearchParams();
		if (queue !== "pending") params.set("queue", queue);
		if (category !== "all") params.set("category", category);
		if (label !== "all") params.set("label", label);
		if (statusFilter !== "all") params.set("status", statusFilter);
		if (query) params.set("q", query);
		if (sort !== "newest") params.set("sort", sort);
		for (const [key, value] of Object.entries(extras)) {
			if (key === "queue" && value === "pending") {
				params.delete("queue");
				continue;
			}
			params.set(key, value);
		}
		return params;
	};
	const filterHref = (
		category: string,
		label: string,
		extras: Record<string, string> = {},
	) => {
		const queryString = buildFilterParams(category, label, extras).toString();
		return queryString ? `${baseHref}?${queryString}` : baseHref;
	};
	const submissionDetailHref = (submissionId: string) => {
		const queryString = buildFilterParams(categoryFilter, labelFilter, {
			page: String(page),
		}).toString();
		const base = `/admin/events/${event.slug}/submissions/${submissionId}`;
		return queryString ? `${base}?${queryString}` : base;
	};

	const notifyPreview = renderMessageTemplate("acceptance", {
		eventName: event.name,
		submitterName: "there",
		title: "(untitled)",
	});

	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={event.slug} />
			<main className="mx-auto max-w-4xl px-4 py-10">
				<PageHeader
					eyebrow="Organizer · Submissions"
					title={event.name}
					description={
						<>
							Decide first, notify later. Queue shows{" "}
							{pageResult.total}
							{queue !== "all" ? ` of ${facets.total}` : ""} in{" "}
							{SUBMISSION_QUEUE_LABELS[queue].toLowerCase()}.{" "}
							<Link
								className="font-medium text-neutral-100 underline underline-offset-2"
								href={`/e/${event.slug}/submit/cfp`}
							>
								Share CFP link
							</Link>
						</>
					}
				>
					<div className="flex flex-wrap gap-1.5 pt-2" role="tablist" aria-label="Status queues">
						{SUBMISSION_QUEUE_TABS.map((tab) => (
							<CategoryChip
								key={tab}
								active={queue === tab}
								href={filterHref(categoryFilter, labelFilter, {
									queue: tab,
									page: "1",
								})}
								label={`${SUBMISSION_QUEUE_LABELS[tab]} (${queueCounts[tab]})`}
							/>
						))}
					</div>
					<div className="flex flex-wrap gap-1.5 pt-3">
						<CategoryChip
							active={categoryFilter === "all"}
							href={filterHref("all", labelFilter)}
							label={`All categories (${facets.total})`}
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
						<input
							type="search"
							name="q"
							defaultValue={queryParam ?? ""}
							className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
							placeholder="Search title, speaker, email, or abstract"
						/>
						<select
							name="status"
							defaultValue={statusFilter}
							className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
						>
							<option value="all">All statuses</option>
							{facets.byStatus.map(({ value: status }) => (
								<option key={status} value={status}>
									{status.replaceAll("_", " ")}
								</option>
							))}
						</select>
						<select
							name="sort"
							defaultValue={sort}
							className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
						>
							<option value="newest">Newest</option>
							<option value="title">Title A–Z</option>
							<option value="status">Status</option>
						</select>
						<input type="hidden" name="queue" value={queue} />
						<input
							type="hidden"
							name="category"
							value={categoryFilter === "all" ? "" : categoryFilter}
						/>
						<input
							type="hidden"
							name="label"
							value={labelFilter === "all" ? "" : labelFilter}
						/>
						<button
							className="justify-self-start rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 sm:col-span-3"
							type="submit"
						>
							Apply filters
						</button>
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
						<ActivatePlanButton eventSlug={event.slug} planActive={Boolean(activePlan)} />
						<ExportButtons eventSlug={event.slug} />
					</div>
				</PageHeader>

				{queue === "to_notify" && pageSubmissionIds.length > 0 ? (
					<BulkNotifyBar
						eventSlug={event.slug}
						submissionIds={pageSubmissionIds}
						defaultSubject={notifyPreview.subject}
						defaultText={notifyPreview.text}
					/>
				) : null}

				{pageResult.total === 0 ? (
					<EmptyState
						title={facets.total === 0 ? "No submissions yet" : "No matching submissions"}
						description={
							facets.total === 0
								? "Share your CFP link to start collecting talks."
								: "Try another queue tab or clear a filter."
						}
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
								const tasks = tasksBySubmission.get(row.id) ?? [];
								const requiredTasks = tasks.filter(
									(task) => task.template_required !== 0,
								);
								const completed = requiredTasks.filter(
									(t) => t.status === "completed",
								).length;
								const taskSummary =
									requiredTasks.length > 0
										? { completed, required: requiredTasks.length }
										: null;
								return (
									<SubmissionRow
										key={row.id}
										eventSlug={event.slug}
										row={row}
										href={submissionDetailHref(row.id)}
										labels={labelsBySubmission.get(row.id) ?? []}
										speakers={speakersBySubmission.get(row.id) ?? []}
										taskSummary={taskSummary}
										assignedReviewerCount={
											(assignedBySubmission.get(row.id) ?? []).length
										}
										notifiedLabel={decisionNotifiedLabel(
											row.status,
											notifiedById.get(row.id) ?? false,
										)}
									/>
								);
							})}
						</ul>
						{totalPages > 1 ? (
							<nav
								className="mt-4 flex items-center justify-between text-sm"
								aria-label="Submission pages"
							>
								{page <= 1 ? (
									<span
										className="rounded-md border border-neutral-800 px-3 py-2 text-neutral-600"
										aria-disabled="true"
									>
										Previous
									</span>
								) : (
									<Link
										className="rounded-md border border-neutral-700 px-3 py-2 text-neutral-200"
										href={filterHref(categoryFilter, labelFilter, {
											page: String(page - 1),
										})}
									>
										Previous
									</Link>
								)}
								<span className="text-neutral-500">
									Page {page} of {totalPages}
								</span>
								{page >= totalPages ? (
									<span
										className="rounded-md border border-neutral-800 px-3 py-2 text-neutral-600"
										aria-disabled="true"
									>
										Next
									</span>
								) : (
									<Link
										className="rounded-md border border-neutral-700 px-3 py-2 text-neutral-200"
										href={filterHref(categoryFilter, labelFilter, {
											page: String(page + 1),
										})}
									>
										Next
									</Link>
								)}
							</nav>
						) : null}
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
