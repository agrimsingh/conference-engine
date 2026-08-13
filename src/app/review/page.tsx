import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { isAdminBypass } from "@/lib/auth/admin";
import { buildSubmissionAnswerDisplays } from "@/lib/cfp/submission-answers";
import { fieldLabelsForSubmissions } from "@/lib/cfp/form-revisions";
import { getCloudflareEnv, getDb } from "@/lib/db/cloudflare";
import {
	getActiveEvaluationPlan,
	getEventById,
	getEventBySlug,
	listEvaluationScoresForPlan,
	listReviewableSubmissions,
} from "@/lib/db/queries";
import { displayCategory } from "@/lib/domain";
import {
	absoluteAppUrl,
	listEventMessageTemplates,
	renderDecisionMessagePreviews,
} from "@/lib/email/templates";
import {
	filterBoardSubmissions,
	listReviewerAssignments,
} from "@/lib/evaluation/assignments";
import { resolveReviewIdentity } from "@/lib/evaluation/score";
import { listCriteria } from "@/lib/evaluation/plan";
import { listCriterionScoresForPlan } from "@/lib/evaluation/score";
import { ReviewBoard } from "./review-board";
import { canUseReviewDecisionControls } from "./review-access";
import { reviewerIdentityFields } from "@/lib/evaluation/blind";

type Props = {
	searchParams: Promise<{ token?: string; event?: string }>;
};

export default async function ReviewPage({ searchParams }: Props) {
	const params = await searchParams;
	const db = await getDb();
	const admin = await isAdminBypass();

	let identity = params.token
		? await resolveReviewIdentity(db, params.token)
		: null;
	let accessToken = params.token?.trim() || "";

	if (!identity && admin && params.event) {
		const event = await getEventBySlug(db, params.event);
		if (event) {
			const plan = await getActiveEvaluationPlan(db, event.id);
			if (plan) {
				identity = { mode: "committee", plan, reviewer: null };
				accessToken = "";
			}
		}
	}

	if (!identity) {
		return (
			<main className="mx-auto max-w-3xl px-4 py-10">
				<PageHeader
					eyebrow="Review"
					title="Open your review link"
					description="Use the personal link from your invite email, or ask an organizer to activate the evaluation plan and share the board URL."
				/>
				{admin ? (
					<p className="text-sm text-neutral-400">
						As organizer: open an event from{" "}
						<Link
							className="font-medium text-neutral-200 underline underline-offset-2"
							href="/admin"
						>
							Admin
						</Link>
						, activate a plan on Submissions, then reopen this page with{" "}
						<code className="rounded-md bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-300">
							?event=&lt;event-slug&gt;
						</code>
						.
					</p>
				) : (
					<p className="text-sm text-neutral-400">
						Missing or invalid token.{" "}
						<Link
							className="text-neutral-200 underline underline-offset-2"
							href="/"
						>
							Back home
						</Link>
					</p>
				)}
			</main>
		);
	}

	const { plan } = identity;
	const event = await getEventById(db, plan.event_id);
	if (!event) notFound();

	const reviewable = await listReviewableSubmissions(db, event.id);
	const reviewerAssignments =
		identity.mode === "reviewer"
			? await listReviewerAssignments(db, {
					planId: plan.id,
					reviewerId: identity.reviewer.id,
				})
			: [];
	const submissions = filterBoardSubmissions(reviewable, {
		mode: identity.mode,
		assignments: reviewerAssignments,
	});
	const [scores, criteria, criterionScores, messageTemplates, cloudflareEnv] = await Promise.all([
		listEvaluationScoresForPlan(db, plan.id),
		listCriteria(db, plan.id),
		listCriterionScoresForPlan(db, plan.id),
		listEventMessageTemplates(db, event.id),
		getCloudflareEnv(),
	]);
	const portalUrl = absoluteAppUrl(cloudflareEnv.APP_ORIGIN, "/portal");
	const scoresBySubmission = new Map<string, typeof scores>();
	for (const score of scores) {
		const list = scoresBySubmission.get(score.submission_id) ?? [];
		list.push(score);
		scoresBySubmission.set(score.submission_id, list);
	}

	const recusalBySubmission = new Map(
		reviewerAssignments.map((assignment) => [assignment.submission_id, assignment.recused_at]),
	);
	const fieldLabelsBySubmission = await fieldLabelsForSubmissions(db, submissions);
	const rows = submissions.map((row) => {
		let title = "(untitled)";
		let parsedAnswers: Record<string, unknown> = {};
		try {
			const answers: unknown = JSON.parse(row.answers_json);
			if (
				typeof answers === "object" &&
				answers !== null &&
				"title" in answers &&
				typeof (answers as { title: unknown }).title === "string"
			) {
				title = (answers as { title: string }).title;
			}
			if (typeof answers === "object" && answers !== null && !Array.isArray(answers)) parsedAnswers = answers as Record<string, unknown>;
		} catch {
			// ignore
		}
		const recusedAt = identity.mode === "reviewer" ? (recusalBySubmission.get(row.id) ?? null) : null;
		const identityFields = { submitterName: row.submitter_name, submitterEmail: row.submitter_email, answers: parsedAnswers };
		const safe = identity.mode === "reviewer"
			? reviewerIdentityFields(identityFields, plan.blind_review === 1)
			: identityFields;
		return {
			id: row.id,
			status: row.status,
			submitterName: safe.submitterName,
			submitterEmail: safe.submitterEmail,
			title,
			category: displayCategory(row.category),
			format: typeof parsedAnswers.format === "string" ? parsedAnswers.format : null,
			assignment:
				identity.mode === "reviewer"
					? recusedAt
						? "Recused"
						: "Assigned to you"
					: "Committee review",
			recusedAt,
			answers: buildSubmissionAnswerDisplays(safe.answers, {
				submissionId: row.id,
				downloadHref: (fieldKey) => {
					const params = new URLSearchParams();
					if (accessToken) params.set("token", accessToken);
					else if (admin && event.slug) params.set("eventSlug", event.slug);
					const query = params.toString();
					return `/api/review/submissions/${row.id}/fields/${encodeURIComponent(fieldKey)}/asset${query ? `?${query}` : ""}`;
				},
				fieldLabels: fieldLabelsBySubmission.get(row.id),
			}),
			previews: renderDecisionMessagePreviews(messageTemplates, {
				eventName: event.name,
				submitterName: row.submitter_name ?? "there",
				title,
				portalUrl,
			}),
			scores: (scoresBySubmission.get(row.id) ?? []).filter((s) => identity.mode === "committee" || s.reviewer_id === identity.reviewer.id).map((s) => ({
				id: s.id,
				score: s.score,
				comment: s.comment,
				scoredBy: s.scored_by,
			})),
			criterionScores: (criterionScores.filter((score) => score.submission_id === row.id && (identity.mode === "committee" || score.reviewer_id === identity.reviewer.id))).map((score) => ({
				id: score.id,
				criterionId: score.criterion_id,
				score: score.score,
				comment: score.comment,
				reviewerId: score.reviewer_id,
				valueText: score.value_text,
			})),
		};
	});

	const reviewingAs =
		identity.mode === "reviewer" ? identity.reviewer.name : "committee";

	return (
		<main className="mx-auto max-w-3xl px-4 py-10">
			<header className="mb-8 space-y-3 border-b border-neutral-800 pb-5">
				<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
					Review · {plan.name}
				</p>
				<h1 className="text-balance text-3xl font-semibold tracking-tight text-neutral-100">
					{event.name}
				</h1>
				<p className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-100">
					Reviewing as {reviewingAs}
				</p>
				<p className="text-pretty text-sm text-neutral-400">
					Score every rubric criterion and save the review. Organizers can accept or
					reject from here when signed in.
				</p>
			</header>

			<ReviewBoard
				eventSlug={event.slug}
				token={accessToken}
				canDecide={canUseReviewDecisionControls(identity, admin)}
				reviewerId={identity.reviewer?.id ?? null}
				criteria={criteria.map((criterion) => ({
					id: criterion.id,
					label: criterion.label,
					description: criterion.description,
					weight: criterion.weight,
					scaleMin: criterion.scale_min,
					scaleMax: criterion.scale_max,
					type: criterion.criterion_type,
					options: criterion.options_json ? JSON.parse(criterion.options_json) as string[] : [],
				}))}
				submissions={rows}
			/>
		</main>
	);
}
