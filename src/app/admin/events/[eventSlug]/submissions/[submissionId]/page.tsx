import { notFound } from "next/navigation";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { Chip, StatusPill, submissionStatusTone } from "@/components/ui";
import { DecisionButtons } from "@/components/decision-buttons";
import { SubmissionAnswersList } from "@/components/submission-answers-list";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { buildSubmissionAnswerDisplays } from "@/lib/cfp/submission-answers";
import { getDb } from "@/lib/db/cloudflare";
import {
	getActiveEvaluationPlan,
	getSubmissionById,
	listAdminSubmissionIds,
	listAssignmentsForSubmission,
	listFormFields,
	listLabelsForSubmissions,
	listOutboundForSubmission,
	listPeopleByIds,
	listReviewersForPlan,
	listSpeakersForSubmission,
	listTasksForSubmission,
} from "@/lib/db/queries";
import {
	displayCategory,
	DECISION_REGISTRY,
	type DecisionAction,
	type RenderedMessage,
} from "@/lib/domain";
import {
	defaultMessageTemplate,
	listEventMessageTemplates,
	renderStoredMessageTemplate,
} from "@/lib/email/templates";
import { AssignmentControls } from "../assignment-controls";
import { SubmissionLabels } from "../submission-labels";
import { SubmissionSpeakers, type SpeakerSummary } from "../submission-speakers";
import { SubmissionNav } from "./submission-nav";

type Props = {
	params: Promise<{ eventSlug: string; submissionId: string }>;
	searchParams: Promise<{
		category?: string;
		label?: string;
		status?: string;
		q?: string;
		sort?: string;
		page?: string;
	}>;
};

export default async function AdminSubmissionDetailPage({
	params,
	searchParams,
}: Props) {
	const { eventSlug, submissionId } = await params;
	const {
		category: categoryParam,
		label: labelParam,
		status: statusParam,
		q: queryParam,
		sort: sortParam,
		page: pageParam,
	} = await searchParams;

	const db = await getDb();
	const { event } = await assertCanManageEvent(db, eventSlug);

	const row = await getSubmissionById(db, submissionId);
	if (!row || row.event_id !== event.id) notFound();

	const categoryFilter = categoryParam?.trim() || "all";
	const labelFilter = labelParam?.trim() || "all";
	const statusFilter = statusParam?.trim() || "all";
	const query = queryParam?.trim().toLowerCase() || "";
	const sort = sortParam === "title" || sortParam === "status" ? sortParam : "newest";

	const activePlan = await getActiveEvaluationPlan(db, event.id);

	const [speakers, labelsMap, tasks, configuredTemplates, outboundMessages, formFields] =
		await Promise.all([
			listSpeakersForSubmission(db, submissionId),
			listLabelsForSubmissions(db, [submissionId]),
			listTasksForSubmission(db, submissionId),
			listEventMessageTemplates(db, event.id),
			listOutboundForSubmission(db, submissionId),
			listFormFields(db, row.form_id),
		]);

	const [reviewers, assignments] = activePlan
		? await Promise.all([
				listReviewersForPlan(db, activePlan.id),
				listAssignmentsForSubmission(db, activePlan.id, submissionId),
			])
		: [[], []];

	const people = await listPeopleByIds(db, tasks.map((task) => task.person_id));
	const personNames = new Map(
		people.map((person) => [person.id, person.name ?? person.email]),
	);

	const answers = parseAnswers(row.answers_json);
	const title = typeof answers.title === "string" ? answers.title : "(untitled)";
	const category = displayCategory(row.category);

	const configuredTemplateByKey = new Map(
		configuredTemplates.map((template) => [template.template_key, template]),
	);
	const decisionContext = {
		eventName: event.name,
		submitterName: row.submitter_name ?? "there",
		title,
	};
	const previews = Object.fromEntries(
		Object.entries(DECISION_REGISTRY).map(([action, meta]) => {
			const saved = configuredTemplateByKey.get(meta.templateKey);
			return [
				action,
				renderStoredMessageTemplate(
					saved
						? { subject: saved.subject_template, text: saved.text_template }
						: defaultMessageTemplate(meta.templateKey),
					{
						...decisionContext,
						portalHint:
							meta.templateKey === "acceptance"
								? "Sign in at /portal with your speaker email to complete bio, headshot, slides, and supporting docs."
								: undefined,
					},
				),
			];
		}),
	) as Record<DecisionAction, RenderedMessage>;

	const fieldLabels = new Map(formFields.map((field) => [field.key, field.label]));
	const answerDisplays = buildSubmissionAnswerDisplays(answers, {
		submissionId: row.id,
		downloadHref: (fieldKey) =>
			`/api/admin/events/${event.slug}/submissions/${row.id}/fields/${encodeURIComponent(fieldKey)}/asset`,
		fieldLabels,
	});

	const speakerSummaries: SpeakerSummary[] = speakers.map((speaker) => ({
		id: speaker.id,
		name: speaker.name,
		email: speaker.email,
		position: speaker.position,
		status: speaker.status,
		addedAfterAcceptance: speaker.added_after_acceptance === 1,
	}));

	const assignedReviewerIds = assignments.map((assignment) => assignment.reviewer_id);
	const labels = labelsMap.get(submissionId) ?? [];

	const requiredTasks = tasks.filter((task) => task.template_required !== 0);
	const completed = requiredTasks.filter((task) => task.status === "completed").length;

	const filterQueryString = buildFilterQueryString({
		category: categoryFilter,
		label: labelFilter,
		status: statusFilter,
		query,
		sort,
		page: pageParam?.trim() || undefined,
	});

	const submissionIds = await listAdminSubmissionIds(db, event.id, {
		category: categoryFilter,
		label: labelFilter,
		status: statusFilter,
		query,
		sort,
	});

	const idx = submissionIds.indexOf(submissionId);
	const position =
		idx === -1 ? null : { index: idx, total: submissionIds.length };
	const detailBase = `/admin/events/${event.slug}/submissions`;
	const backHref = `${detailBase}${filterQueryString}`;
	const prevHref =
		position && idx > 0
			? `${detailBase}/${submissionIds[idx - 1]}${filterQueryString}`
			: null;
	const nextHref =
		position && idx < submissionIds.length - 1
			? `${detailBase}/${submissionIds[idx + 1]}${filterQueryString}`
			: null;

	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={event.slug} />
			<SubmissionNav
				eventSlug={event.slug}
				backHref={backHref}
				prevHref={prevHref}
				nextHref={nextHref}
				position={position}
			/>
			<main className="mx-auto max-w-3xl px-4 py-10">
				<PageHeader
					eyebrow="Organizer · Submission"
					title={title}
					description={
						<>
							{row.submitter_name} · {row.submitter_email}
							{typeof answers.format === "string" ? ` · ${answers.format}` : ""}
						</>
					}
				/>

				<section className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
					<div className="flex flex-wrap items-center gap-2">
						<Chip>{category}</Chip>
						<StatusPill tone={submissionStatusTone(row.status)}>
							{row.status.replaceAll("_", " ")}
						</StatusPill>
						<span className="text-xs text-neutral-500">
							Submitted {new Date(row.created_at).toLocaleString()}
						</span>
					</div>
				</section>

				<section className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
					<h2 className="text-sm font-medium text-neutral-200">Proposal answers</h2>
					<div className="mt-2">
						<SubmissionAnswersList answers={answerDisplays} />
					</div>
				</section>

				<div className="mt-4">
					<DecisionButtons
						eventSlug={event.slug}
						submissionId={row.id}
						status={row.status}
						previews={previews}
					/>
				</div>

				{activePlan ? (
					<div className="mt-4">
						<AssignmentControls
							key={`${row.id}:${assignedReviewerIds.join(",")}`}
							eventSlug={event.slug}
							submissionId={row.id}
							reviewers={reviewers.map((reviewer) => ({
								id: reviewer.id,
								name: reviewer.name,
							}))}
							assignedReviewerIds={assignedReviewerIds}
						/>
					</div>
				) : null}

				<div className="mt-4">
					<SubmissionSpeakers
						eventSlug={event.slug}
						submissionId={row.id}
						speakers={speakerSummaries}
					/>
				</div>

				<div className="mt-4">
					<SubmissionLabels
						eventSlug={event.slug}
						submissionId={row.id}
						labels={labels}
					/>
				</div>

				{tasks.length > 0 ? (
					<section className="mt-4 rounded-md border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-xs text-neutral-400">
						<p className="font-medium text-neutral-300">
							Speaker tasks {completed}/{requiredTasks.length} required complete
						</p>
						<ul className="mt-1 space-y-0.5">
							{tasks.map((task) => (
								<li key={task.id}>
									{personNames.get(task.person_id) ?? task.person_id} ·{" "}
									{task.template_label || task.template_key} · {task.status}
									{task.template_required === 0 ? " (optional)" : ""}
								</li>
							))}
						</ul>
					</section>
				) : null}

				{outboundMessages.length > 0 ? (
					<section className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
						<h2 className="text-sm font-medium text-neutral-200">Email history</h2>
						<ul className="mt-2 divide-y divide-neutral-800">
							{outboundMessages.map((message) => (
								<li key={message.id} className="py-2 text-sm">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<span className="text-neutral-300">
											{new Date(message.created_at).toLocaleString()}
										</span>
										<StatusPill
											tone={
												message.status === "sent"
													? "positive"
													: message.status === "failed"
														? "negative"
														: "neutral"
											}
										>
											{message.status}
										</StatusPill>
									</div>
									<p className="mt-1 text-neutral-400">
										To: {message.to_email}
									</p>
									<p className="text-neutral-400">
										{message.template_key} · {message.subject}
									</p>
									{message.error ? (
										<p className="mt-1 text-red-400">{message.error}</p>
									) : null}
								</li>
							))}
						</ul>
					</section>
				) : null}
			</main>
		</div>
	);
}

function buildFilterQueryString(filters: {
	category: string;
	label: string;
	status: string;
	query: string;
	sort: string;
	page?: string;
}): string {
	const params = new URLSearchParams();
	if (filters.category !== "all") params.set("category", filters.category);
	if (filters.label !== "all") params.set("label", filters.label);
	if (filters.status !== "all") params.set("status", filters.status);
	if (filters.query) params.set("q", filters.query);
	if (filters.sort !== "newest") params.set("sort", filters.sort);
	if (filters.page) params.set("page", filters.page);
	const queryString = params.toString();
	return queryString ? `?${queryString}` : "";
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
