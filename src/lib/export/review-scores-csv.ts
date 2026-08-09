import {
	getActiveEvaluationPlan,
	getEventBySlug,
	listEvaluationScoresForPlan,
	listReviewableSubmissions,
} from "@/lib/db/queries";
import { titleFromAnswers } from "@/lib/domain";
import { listEvaluationPlans } from "@/lib/evaluation/plan";
import { listCriteria } from "@/lib/evaluation/plan";
import { listCriterionScoresForPlan } from "@/lib/evaluation/score";
import { listPlanReviewers } from "@/lib/evaluation/reviewers";
import { csvEscape } from "@/lib/export/submissions-csv";

export type ReviewScoreExportRow = {
	submission_id: string;
	title: string;
	status: string;
	average: string;
	scores_by_reviewer: Record<string, string>;
	criterion_values_by_reviewer?: Record<string, string>;
};

export type ReviewScoresExport = {
	eventSlug: string;
	planId: string;
	planName: string;
	reviewerNames: { id: string; name: string }[];
	criteria?: { id: string; label: string }[];
	rows: ReviewScoreExportRow[];
};

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

export function buildReviewScoreExportRows(args: {
	submissions: { id: string; status: string; answers_json: string }[];
	reviewers: { id: string; name: string }[];
	aggregates: { submission_id: string; reviewer_id: string | null; score: number }[];
	criteria?: { id: string; type: "numeric" | "dropdown" | "text" }[];
	criterionScores?: { submission_id: string; reviewer_id: string | null; criterion_id: string; score: number; value_text: string | null }[];
}): ReviewScoreExportRow[] {
	const scoreByPair = new Map<string, number>();
	for (const aggregate of args.aggregates) {
		if (!aggregate.reviewer_id) continue;
		scoreByPair.set(`${aggregate.submission_id}:${aggregate.reviewer_id}`, aggregate.score);
	}

	return args.submissions.map((submission) => {
		const scores_by_reviewer: Record<string, string> = {};
		const criterion_values_by_reviewer: Record<string, string> = {};
		const values: number[] = [];
		for (const reviewer of args.reviewers) {
			const score = scoreByPair.get(`${submission.id}:${reviewer.id}`);
			scores_by_reviewer[reviewer.id] = score === undefined ? "" : String(score);
			if (score !== undefined) values.push(score);
		}
		for (const reviewer of args.reviewers) for (const criterion of args.criteria ?? []) {
			const value = args.criterionScores?.find((row) => row.submission_id === submission.id && row.reviewer_id === reviewer.id && row.criterion_id === criterion.id);
			criterion_values_by_reviewer[`${reviewer.id}:${criterion.id}`] = value ? (criterion.type === "numeric" ? String(value.score) : value.value_text ?? "") : "";
		}
		const average = values.length
			? String(values.reduce((sum, value) => sum + value, 0) / values.length)
			: "";
		return {
			submission_id: submission.id,
			title: titleFromAnswers(parseAnswers(submission.answers_json)),
			status: submission.status,
			average,
			scores_by_reviewer,
			...(args.criteria?.length ? { criterion_values_by_reviewer } : {}),
		};
	});
}

export function reviewScoresToCsv(exportData: ReviewScoresExport): string {
	const reviewerHeaders = exportData.reviewerNames.map((reviewer) => reviewer.name);
	const criterionHeaders = exportData.reviewerNames.flatMap((reviewer) => (exportData.criteria ?? []).map((criterion) => `${reviewer.name} · ${criterion.label}`));
	const headers = ["submission_id", "title", "status", "average", ...reviewerHeaders, ...criterionHeaders];
	const lines = [
		headers.map(csvEscape).join(","),
		...exportData.rows.map((row) =>
			[
				row.submission_id,
				row.title,
				row.status,
				row.average,
				...exportData.reviewerNames.map((reviewer) => row.scores_by_reviewer[reviewer.id] ?? ""),
				...exportData.reviewerNames.flatMap((reviewer) => (exportData.criteria ?? []).map((criterion) => row.criterion_values_by_reviewer?.[`${reviewer.id}:${criterion.id}`] ?? "")),
			]
				.map(csvEscape)
				.join(","),
		),
	];
	return `${lines.join("\n")}\n`;
}

export async function loadReviewScoresExportForSlug(
	db: D1Database,
	eventSlug: string,
	planId?: string | null,
): Promise<{ ok: true; data: ReviewScoresExport } | { ok: false; error: "not_found" | "no_plan" }> {
	const event = await getEventBySlug(db, eventSlug);
	if (!event) return { ok: false, error: "not_found" };

	const plans = await listEvaluationPlans(db, event.id);
	const active = await getActiveEvaluationPlan(db, event.id);
	const plan =
		(planId ? plans.find((item) => item.id === planId) : null) ??
		active ??
		plans[0] ??
		null;
	if (!plan) return { ok: false, error: "no_plan" };

	const [reviewers, submissions, scores, criteria, criterionScores] = await Promise.all([
		listPlanReviewers(db, plan.id),
		listReviewableSubmissions(db, event.id),
		listEvaluationScoresForPlan(db, plan.id),
		listCriteria(db, plan.id),
		listCriterionScoresForPlan(db, plan.id),
	]);
	const liveReviewers = reviewers
		.filter((reviewer) => reviewer.revoked_at === null)
		.map((reviewer) => ({ id: reviewer.id, name: reviewer.name }));

	const rows = buildReviewScoreExportRows({
		submissions,
		reviewers: liveReviewers,
		aggregates: scores.map((score) => ({
			submission_id: score.submission_id,
			reviewer_id: score.reviewer_id,
			score: score.score,
		})),
		criteria: criteria.map((criterion) => ({ id: criterion.id, type: criterion.criterion_type })),
		criterionScores,
	});

	return {
		ok: true,
		data: {
			eventSlug: event.slug,
			planId: plan.id,
			planName: plan.name,
			reviewerNames: liveReviewers,
			criteria: criteria.map((criterion) => ({ id: criterion.id, label: criterion.label })),
			rows,
		},
	};
}
