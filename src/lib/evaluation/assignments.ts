import {
	clearAssignmentsForSubmission,
	listAssignmentsForPlanSubmissions,
	listAssignmentsForReviewer,
	listAssignmentsForSubmission,
} from "@/lib/db/queries";
import type { ReviewAssignmentRow } from "@/lib/db/types";
import { listPlanReviewers } from "@/lib/evaluation/reviewers";

/**
 * Committee → all submissions.
 * Reviewer with assignments → only assigned ids.
 * Reviewer with zero assignments → empty (fail-closed). Pass emptyMeansAll only for
 * explicit non-board callers that want the old fail-open behavior.
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
	const reviewerIds = await validatePlanReviewerIds(db, args.planId, args.reviewerIds);
	const rows = await buildAssignmentRows(db, args.planId, [args.submissionId], reviewerIds);
	await db.batch(assignmentStatements(db, args.planId, [args.submissionId], rows));

	return rows;
}

export async function setBulkSubmissionReviewers(
	db: D1Database,
	args: { planId: string; submissionIds: string[]; reviewerIds: string[] },
): Promise<{ submissionIds: string[]; reviewerIds: string[] }> {
	const submissionIds = uniqueNonBlankIds(args.submissionIds, "submissionIds");
	const reviewerIds = uniqueNonBlankIds(args.reviewerIds, "reviewerIds");
	if (!submissionIds.length) throw new AssignmentValidationError("Select at least one submission");
	if (!reviewerIds.length) throw new AssignmentValidationError("Select at least one reviewer");
	const placeholders = submissionIds.map(() => "?").join(", ");
	const owned = await db.prepare(`SELECT s.id FROM submissions s INNER JOIN evaluation_plans p ON p.event_id = s.event_id WHERE p.id = ? AND s.id IN (${placeholders})`)
		.bind(args.planId, ...submissionIds).all<{ id: string }>();
	if (owned.results.length !== submissionIds.length) throw new AssignmentValidationError("One or more submissions do not belong to this event", 404);
	const validReviewerIds = await validatePlanReviewerIds(db, args.planId, reviewerIds);
	const rows = await buildAssignmentRows(db, args.planId, submissionIds, validReviewerIds);
	// D1 executes a batch as one transaction: no submission is cleared or
	// reassigned unless every delete and insert succeeds.
	await db.batch(assignmentStatements(db, args.planId, submissionIds, rows));
	return { submissionIds, reviewerIds };
}

async function validatePlanReviewerIds(db: D1Database, planId: string, reviewerIds: string[]): Promise<string[]> {
	const planReviewers = await listPlanReviewers(db, planId);
	const byId = new Map(planReviewers.map((row) => [row.id, row]));
	const uniqueIds = [...new Set(reviewerIds)];
	for (const id of uniqueIds) {
		const reviewer = byId.get(id);
		if (!reviewer) throw new AssignmentValidationError(`Reviewer ${id} is not on this plan`);
		if (reviewer.revoked_at !== null) throw new AssignmentValidationError(`Reviewer ${id} has been revoked`);
	}
	return uniqueIds;
}

async function buildAssignmentRows(
	db: D1Database,
	planId: string,
	submissionIds: string[],
	reviewerIds: string[],
): Promise<ReviewAssignmentRow[]> {
	const existing = await listAssignmentsForPlanSubmissions(db, planId, submissionIds);
	const recusalByKey = new Map<string, number>();
	for (const row of existing) {
		if (row.recused_at == null) continue;
		recusalByKey.set(`${row.reviewer_id}:${row.submission_id}`, row.recused_at);
	}
	const created_at = Date.now();
	return submissionIds.flatMap((submissionId) =>
		reviewerIds.map((reviewer_id) => ({
			id: crypto.randomUUID(),
			plan_id: planId,
			reviewer_id,
			submission_id: submissionId,
			created_at,
			recused_at: recusalByKey.get(`${reviewer_id}:${submissionId}`) ?? null,
		})),
	);
}

function assignmentStatements(db: D1Database, planId: string, submissionIds: string[], rows: ReviewAssignmentRow[]): D1PreparedStatement[] {
	const placeholders = submissionIds.map(() => "?").join(", ");
	return [
		db.prepare(`DELETE FROM review_assignments WHERE plan_id = ? AND submission_id IN (${placeholders})`).bind(planId, ...submissionIds),
		...rows.map((row) => db.prepare(`INSERT INTO review_assignments (id, plan_id, reviewer_id, submission_id, created_at, recused_at) VALUES (?, ?, ?, ?, ?, ?)`)
			.bind(row.id, row.plan_id, row.reviewer_id, row.submission_id, row.created_at, row.recused_at)),
	];
}

function uniqueNonBlankIds(values: string[], field: string): string[] {
	if (!Array.isArray(values)) throw new AssignmentValidationError(`${field} must be an array of ids`);
	const ids = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
	if (ids.length !== values.length) throw new AssignmentValidationError(`${field} must contain unique non-empty ids`);
	return ids;
}

export class AssignmentValidationError extends Error {
	constructor(message: string, readonly status = 400) {
		super(message);
		this.name = "AssignmentValidationError";
	}
}

export function assignedReviewerIds(
	assignments: ReviewAssignmentRow[],
): string[] {
	return assignments.map((row) => row.reviewer_id);
}
