export const EVALUATION_PLAN_STATUSES = ["draft", "active", "closed"] as const;

export type EvaluationPlanStatus = (typeof EVALUATION_PLAN_STATUSES)[number];

export function isEvaluationPlanStatus(value: string): value is EvaluationPlanStatus {
	return (EVALUATION_PLAN_STATUSES as readonly string[]).includes(value);
}

export function isValidScore(value: number): value is 1 | 2 | 3 | 4 | 5 {
	return Number.isInteger(value) && value >= 1 && value <= 5;
}

export const REVIEWABLE_SUBMISSION_STATUSES = [
	"submitted",
	"under_review",
] as const;

export type ReviewableSubmissionStatus =
	(typeof REVIEWABLE_SUBMISSION_STATUSES)[number];

export function isReviewableSubmissionStatus(
	status: string,
): status is ReviewableSubmissionStatus {
	return (REVIEWABLE_SUBMISSION_STATUSES as readonly string[]).includes(status);
}
