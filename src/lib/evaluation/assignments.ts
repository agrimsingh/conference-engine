import {
	clearAssignmentsForSubmission,
	insertReviewAssignment,
	listAssignmentsForReviewer,
	listAssignmentsForSubmission,
	listReviewersForPlan,
} from "@/lib/db/queries";
import type { ReviewAssignmentRow } from "@/lib/db/types";

/**
 * Committee → all submissions.
 * Reviewer with assignments → only assigned ids.
 * Reviewer with zero assignments → empty unless emptyMeansAll (board UI compat).
 */
export function filterBoardSubmissions<T extends { id: string }>(
	submissions: T[],
	args: {
		mode: "committee" | "reviewer";
		assignments: ReviewAssignmentRow[];
		emptyMeansAll?: boolean;
	},
): T[] {
	if (args.mode === "committee") return submissions;
	if (args.assignments.length === 0) {
		return args.emptyMeansAll ? submissions : [];
	}
	const allowed = new Set(args.assignments.map((row) => row.submission_id));
	return submissions.filter((row) => allowed.has(row.id));
}

export async function listAssignments(
	db: D1Database,
	args: { planId: string; submissionId: string },
): Promise<ReviewAssignmentRow[]> {
	return listAssignmentsForSubmission(db, args.planId, args.submissionId);
}

export async function listReviewerAssignments(
	db: D1Database,
	args: { planId: string; reviewerId: string },
): Promise<ReviewAssignmentRow[]> {
	return listAssignmentsForReviewer(db, args.planId, args.reviewerId);
}

export async function clearAssignments(
	db: D1Database,
	args: { planId: string; submissionId: string },
): Promise<void> {
	await clearAssignmentsForSubmission(db, args.planId, args.submissionId);
}

export async function setSubmissionReviewers(
	db: D1Database,
	args: {
		planId: string;
		submissionId: string;
		reviewerIds: string[];
	},
): Promise<ReviewAssignmentRow[]> {
	const planReviewers = await listReviewersForPlan(db, args.planId);
	const byId = new Map(planReviewers.map((row) => [row.id, row]));

	const uniqueIds: string[] = [];
	const seen = new Set<string>();
	for (const id of args.reviewerIds) {
		if (seen.has(id)) continue;
		seen.add(id);
		if (!byId.has(id)) {
			throw new AssignmentValidationError(
				`Reviewer ${id} is not on this plan`,
			);
		}
		uniqueIds.push(id);
	}

	await clearAssignmentsForSubmission(db, args.planId, args.submissionId);

	const now = Date.now();
	const rows: ReviewAssignmentRow[] = uniqueIds.map((reviewerId) => ({
		id: crypto.randomUUID(),
		plan_id: args.planId,
		reviewer_id: reviewerId,
		submission_id: args.submissionId,
		created_at: now,
	}));

	for (const row of rows) {
		await insertReviewAssignment(db, row);
	}

	return rows;
}

export class AssignmentValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AssignmentValidationError";
	}
}

export function assignedReviewerIds(
	assignments: ReviewAssignmentRow[],
): string[] {
	return assignments.map((row) => row.reviewer_id);
}
