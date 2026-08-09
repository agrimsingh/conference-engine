import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { getActiveEvaluationPlan, listAssignmentsForPlan, listEvaluationScoresForPlan, listReviewableSubmissions } from "@/lib/db/queries";
import { listCriteria, listEvaluationPlans } from "@/lib/evaluation/plan";
import { listPlanReviewers } from "@/lib/evaluation/reviewers";
import { listCriterionScoresForPlan } from "@/lib/evaluation/score";
import dynamic from "next/dynamic";

const ReviewWorkspace = dynamic(
	() => import("./review-workspace").then((m) => ({ default: m.ReviewWorkspace })),
	{ loading: () => <div className="h-64 animate-pulse rounded-lg bg-neutral-900" aria-hidden /> },
);

type Props = { params: Promise<{ eventSlug: string }>; searchParams: Promise<{ plan?: string }> };

export default async function AdminReviewPage({ params, searchParams }: Props) {
	const { eventSlug } = await params;
	const { plan: selectedPlanId } = await searchParams;
	const db = await getDb();
	const { event } = await assertCanManageEvent(db, eventSlug);
	const [plans, active] = await Promise.all([
		listEvaluationPlans(db, event.id),
		getActiveEvaluationPlan(db, event.id),
	]);
	const plan = plans.find((item) => item.id === selectedPlanId) ?? active ?? plans[0] ?? null;
	if (!plan) {
		return (
			<div className="min-h-dvh bg-neutral-950 text-neutral-200">
				<AdminEventNav eventSlug={event.slug} />
				<main className="mx-auto max-w-6xl px-4 py-10">
					<PageHeader eyebrow="Organizer · Review" title={event.name} description="Create a rubric before inviting reviewers or assigning proposals." />
					<ReviewWorkspace
						eventSlug={event.slug}
						eventName={event.name}
						plans={[]}
						plan={null}
						criteria={[]}
						reviewers={[]}
						submissions={[]}
						aggregates={[]}
						criterionScores={[]}
						summary={{ total: 0, scored: 0, accepted: 0, rejected: 0 }}
					/>
				</main>
			</div>
		);
	}
	const [criteria, reviewers, submissions, assignments, scores, criterionScores, speakerRows] = await Promise.all([
		listCriteria(db, plan.id),
		listPlanReviewers(db, plan.id),
		listReviewableSubmissions(db, event.id),
		listAssignmentsForPlan(db, plan.id),
		listEvaluationScoresForPlan(db, plan.id),
		listCriterionScoresForPlan(db, plan.id),
		db.prepare(`SELECT ss.submission_id, ss.name, ss.email, ss.status, ss.position
			FROM submission_speakers ss
			INNER JOIN submissions s ON s.id = ss.submission_id
			WHERE s.event_id = ?
				AND s.status IN ('submitted', 'under_review', 'accepted', 'rejected')
			ORDER BY ss.submission_id, ss.position, ss.name`).bind(event.id).all<{
				submission_id: string;
				name: string;
				email: string;
				status: string;
				position: number;
			}>(),
	]);
	const criteriaByPlan = new Map(await Promise.all(plans.map(async (item) => [item.id, await listCriteria(db, item.id)] as const)));
	const assignmentsBySubmission = new Map<string, string[]>();
	for (const assignment of assignments) {
		assignmentsBySubmission.set(assignment.submission_id, [...(assignmentsBySubmission.get(assignment.submission_id) ?? []), assignment.reviewer_id]);
	}
	const scoredBySubmission = new Set(scores.map((score) => score.submission_id));
	const reviewCount = new Map<string, number>();
	for (const score of scores) {
		if (score.reviewer_id) reviewCount.set(score.reviewer_id, (reviewCount.get(score.reviewer_id) ?? 0) + 1);
	}
	const workload = new Map<string, { assigned: number; scored: number }>();
	for (const reviewer of reviewers) workload.set(reviewer.id, { assigned: 0, scored: reviewCount.get(reviewer.id) ?? 0 });
	for (const assignment of assignments) {
		if (assignment.recused_at != null) continue;
		const row = workload.get(assignment.reviewer_id);
		if (row) row.assigned += 1;
	}
	const speakersBySubmission = new Map<string, Array<{ name: string; email: string; status: string }>>();
	for (const speaker of speakerRows.results) {
		speakersBySubmission.set(speaker.submission_id, [
			...(speakersBySubmission.get(speaker.submission_id) ?? []),
			{ name: speaker.name, email: speaker.email, status: speaker.status },
		]);
	}
	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={event.slug} />
			<main className="mx-auto max-w-6xl px-4 py-10">
				<PageHeader eyebrow="Organizer · Review" title={event.name} description="Build the rubric, issue named review links, balance workload, and decide proposals from one scoped workspace." />
				<ReviewWorkspace
					key={plan.id}
					eventSlug={event.slug}
					eventName={event.name}
					plans={plans.map((item) => ({ id: item.id, name: item.name, status: item.status, openAt: item.open_at, closeAt: item.close_at, blindReview: item.blind_review === 1, assignmentCap: item.assignment_cap, scorecardSummary: (criteriaByPlan.get(item.id) ?? []).map((criterion) => `${criterion.label} (${criterion.criterion_type === "numeric" ? `${criterion.scale_min}–${criterion.scale_max}, weight ${criterion.weight}` : criterion.criterion_type === "dropdown" ? "dropdown" : "free text"})`) }))}
					plan={{ id: plan.id, name: plan.name, status: plan.status, openAt: plan.open_at, closeAt: plan.close_at, blindReview: plan.blind_review === 1, assignmentCap: plan.assignment_cap }}
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
					reviewers={reviewers.map((reviewer) => ({
						id: reviewer.id,
						name: reviewer.name,
						email: reviewer.email,
						revokedAt: reviewer.revoked_at,
						assigned: workload.get(reviewer.id)?.assigned ?? 0,
						scored: workload.get(reviewer.id)?.scored ?? 0,
					}))}
					submissions={submissions.map((submission) => ({
						id: submission.id,
						title: titleFor(submission.answers_json),
						submitter: submission.submitter_name ?? submission.submitter_email ?? "Unknown submitter",
						speakers: speakersBySubmission.get(submission.id) ?? [],
						status: submission.status,
						assignedReviewerIds: assignmentsBySubmission.get(submission.id) ?? [],
						scored: scoredBySubmission.has(submission.id),
						criterionScoreCount: criterionScores.filter((score) => score.submission_id === submission.id).length,
					}))}
					aggregates={scores.map((score) => ({
						submissionId: score.submission_id,
						reviewerId: score.reviewer_id,
						scoredBy: score.scored_by,
						score: score.score,
						comment: score.comment,
					}))}
					criterionScores={criterionScores.map((score) => ({
						submissionId: score.submission_id,
						reviewerId: score.reviewer_id,
						criterionId: score.criterion_id,
						score: score.score,
						valueText: score.value_text,
						comment: score.comment,
					}))}
					summary={{
						total: submissions.length,
						scored: scoredBySubmission.size,
						accepted: submissions.filter((submission) => submission.status === "accepted").length,
						rejected: submissions.filter((submission) => submission.status === "rejected").length,
					}}
				/>
			</main>
		</div>
	);
}

function titleFor(answersJson: string): string {
	try {
		const parsed: unknown = JSON.parse(answersJson);
		return typeof parsed === "object" && parsed !== null && "title" in parsed && typeof (parsed as { title: unknown }).title === "string"
			? (parsed as { title: string }).title
			: "(untitled)";
	} catch {
		return "(untitled)";
	}
}
