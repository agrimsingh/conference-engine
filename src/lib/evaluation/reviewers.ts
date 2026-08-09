import type { ReviewerRow } from "@/lib/db/types";
import { listReviewersForPlan } from "@/lib/db/queries";
import { backfillEvaluationTokenDigests, digestReviewToken, newReviewToken, storedTokenMarker } from "@/lib/evaluation/tokens";

const SEED_REVIEWER_NAMES = ["Reviewer A", "Reviewer B", "Reviewer C"] as const;

export type ReviewerWithState = ReviewerRow & { revoked_at: number | null };
export type ReviewerIssue = { reviewer: ReviewerRow; token: string };

export function newReviewerToken(): string {
	return newReviewToken();
}

export async function createReviewer(
	db: D1Database,
	args: { planId: string; name: string },
): Promise<ReviewerIssue> {
	const name = args.name.trim();
	if (!name) {
		throw new Error("Reviewer name is required");
	}

	const id = crypto.randomUUID();
	const token = newReviewerToken();
	const createdAt = Date.now();

	const tokenDigest = await digestReviewToken(token);
	const reviewer: ReviewerRow = {
		id,
		plan_id: args.planId,
		name,
		token: storedTokenMarker(id),
		created_at: createdAt,
	};
	await db
		.prepare(
			`INSERT INTO reviewers (id, plan_id, name, token, token_digest, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
		)
		.bind(id, args.planId, name, reviewer.token, tokenDigest, createdAt)
		.run();

	return { reviewer, token };
}

export async function listPlanReviewers(
	db: D1Database,
	planId: string,
): Promise<ReviewerWithState[]> {
	await backfillEvaluationTokenDigests(db);
	const result = await db.prepare(`SELECT * FROM reviewers WHERE plan_id = ? ORDER BY created_at ASC, name ASC`)
		.bind(planId).all<ReviewerWithState>();
	return result.results;
}

export async function regenerateReviewerToken(
	db: D1Database,
	args: { planId: string; reviewerId: string },
): Promise<ReviewerIssue> {
	const reviewer = await getPlanReviewer(db, args);
	if (!reviewer) throw new ReviewerValidationError("Reviewer not found", 404);
	if (reviewer.revoked_at !== null) throw new ReviewerValidationError("Revoked reviewers cannot receive a new token");
	const token = newReviewerToken();
	await db.prepare(`UPDATE reviewers SET token = ?, token_digest = ? WHERE id = ? AND plan_id = ? AND revoked_at IS NULL`)
		.bind(storedTokenMarker(reviewer.id), await digestReviewToken(token), args.reviewerId, args.planId).run();
	return { reviewer: { ...reviewer, token: storedTokenMarker(reviewer.id) }, token };
}

export async function revokeReviewer(
	db: D1Database,
	args: { planId: string; reviewerId: string },
): Promise<ReviewerWithState> {
	const reviewer = await getPlanReviewer(db, args);
	if (!reviewer) throw new ReviewerValidationError("Reviewer not found", 404);
	if (reviewer.revoked_at !== null) return reviewer;
	const revoked_at = Date.now();
	await db.batch([
		db.prepare(`UPDATE reviewers SET revoked_at = ? WHERE id = ? AND plan_id = ?`).bind(revoked_at, args.reviewerId, args.planId),
		db.prepare(`DELETE FROM review_assignments WHERE plan_id = ? AND reviewer_id = ?`).bind(args.planId, args.reviewerId),
	]);
	return { ...reviewer, revoked_at };
}

export async function getPlanReviewer(
	db: D1Database,
	args: { planId: string; reviewerId: string },
): Promise<ReviewerWithState | null> {
	await backfillEvaluationTokenDigests(db);
	return db.prepare(`SELECT * FROM reviewers WHERE id = ? AND plan_id = ?`).bind(args.reviewerId, args.planId).first<ReviewerWithState>();
}

/** Idempotent: seeds A/B/C only when the plan has zero reviewers. */
export async function ensureSeedReviewers(
	db: D1Database,
	planId: string,
): Promise<ReviewerRow[]> {
	const existing = await listReviewersForPlan(db, planId);
	if (existing.length > 0) {
		return existing;
	}

	const now = Date.now();
	const issued = await Promise.all(SEED_REVIEWER_NAMES.map(async (name) => {
		const id = crypto.randomUUID();
		return { row: { id, plan_id: planId, name, token: storedTokenMarker(id), created_at: now }, digest: await digestReviewToken(newReviewerToken()) };
	}));
	const rows = issued.map((item) => item.row);

	await db.batch(
		rows.map((row) =>
			db
				.prepare(
				`INSERT INTO reviewers (id, plan_id, name, token, token_digest, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
				)
				.bind(row.id, row.plan_id, row.name, row.token, issued.find((item) => item.row.id === row.id)?.digest, row.created_at),
		),
	);

	return rows;
}

export function reviewPathForToken(token: string): string {
	return `/review?token=${token}`;
}

export class ReviewerValidationError extends Error {
	constructor(message: string, readonly status = 400) {
		super(message);
		this.name = "ReviewerValidationError";
	}
}
