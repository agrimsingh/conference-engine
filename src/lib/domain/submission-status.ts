export const SUBMISSION_STATUSES = [
	"draft",
	"submitted",
	"under_review",
	"accepted",
	"rejected",
	"waitlisted",
	"scheduled",
	"published",
	"withdrawn",
] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

const LEGAL_TRANSITIONS: Record<SubmissionStatus, readonly SubmissionStatus[]> = {
	draft: ["submitted", "withdrawn"],
	submitted: ["under_review", "withdrawn"],
	under_review: ["accepted", "rejected", "waitlisted", "withdrawn"],
	accepted: ["scheduled", "rejected", "withdrawn"],
	rejected: ["under_review", "waitlisted"],
	waitlisted: ["accepted", "rejected", "under_review"],
	scheduled: ["published", "accepted"],
	published: ["scheduled"],
	withdrawn: [],
};

export class IllegalSubmissionTransitionError extends Error {
	readonly from: SubmissionStatus;
	readonly to: SubmissionStatus;

	constructor(from: SubmissionStatus, to: SubmissionStatus) {
		super(`Illegal submission transition: ${from} → ${to}`);
		this.name = "IllegalSubmissionTransitionError";
		this.from = from;
		this.to = to;
	}
}

export function isSubmissionStatus(value: string): value is SubmissionStatus {
	return (SUBMISSION_STATUSES as readonly string[]).includes(value);
}

export function canTransitionSubmission(
	from: SubmissionStatus,
	to: SubmissionStatus,
): boolean {
	return LEGAL_TRANSITIONS[from].includes(to);
}

export function transitionSubmission(
	from: SubmissionStatus,
	to: SubmissionStatus,
): SubmissionStatus {
	if (!canTransitionSubmission(from, to)) {
		throw new IllegalSubmissionTransitionError(from, to);
	}
	return to;
}

export function legalTargets(from: SubmissionStatus): readonly SubmissionStatus[] {
	return LEGAL_TRANSITIONS[from];
}
