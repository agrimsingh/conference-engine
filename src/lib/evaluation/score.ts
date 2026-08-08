import {
	getEvaluationPlanByToken,
	getReviewerByToken,
	getSubmissionById,
} from "@/lib/db/queries";
import type { EvaluationPlanRow, EvaluationScoreRow, ReviewerRow } from "@/lib/db/types";
import {
	IllegalSubmissionTransitionError,
	isReviewableSubmissionStatus,
	isSubmissionStatus,
	isValidScore,
	transitionSubmission,
} from "@/lib/domain";

export type ReviewIdentity =
	| { mode: "reviewer"; plan: EvaluationPlanRow; reviewer: ReviewerRow }
	| { mode: "committee"; plan: EvaluationPlanRow; reviewer: null };

export type ScoreResult =
	| { ok: true; score: EvaluationScoreRow }
	| { ok: false; error: string; status: number };

export async function resolveReviewIdentity(
	db: D1Database,
	token: string,
): Promise<ReviewIdentity | null> {
	const reviewer = await getReviewerByToken(db, token);
	if (reviewer) {
		const plan = await db
			.prepare("SELECT * FROM evaluation_plans WHERE id = ?")
			.bind(reviewer.plan_id)
			.first<EvaluationPlanRow>();
		if (!plan) return null;
		return { mode: "reviewer", plan, reviewer };
	}

	const plan = await getEvaluationPlanByToken(db, token);
	if (!plan) return null;
	return { mode: "committee", plan, reviewer: null };
}

export async function upsertEvaluationScore(
	db: D1Database,
	args: {
		token: string;
		submissionId: string;
		score: number;
		comment?: string;
	},
): Promise<ScoreResult> {
	if (!isValidScore(args.score)) {
		return { ok: false, error: "score must be an integer 1–5", status: 400 };
	}

	const identity = await resolveReviewIdentity(db, args.token);
	if (!identity || identity.plan.status !== "active") {
		return { ok: false, error: "Invalid or inactive review token", status: 401 };
	}

	const { plan } = identity;
	const submission = await getSubmissionById(db, args.submissionId);
	if (!submission || submission.event_id !== plan.event_id) {
		return { ok: false, error: "Submission not found", status: 404 };
	}

	if (
		!isReviewableSubmissionStatus(submission.status) &&
		submission.status !== "accepted" &&
		submission.status !== "rejected"
	) {
		return {
			ok: false,
			error: `Cannot score submission in status ${submission.status}`,
			status: 409,
		};
	}

	const now = Date.now();
	const comment = args.comment?.trim() || null;
	const scoredBy =
		identity.mode === "reviewer" ? identity.reviewer.name : "committee";
	const reviewerId =
		identity.mode === "reviewer" ? identity.reviewer.id : null;

	let existing: EvaluationScoreRow | null;
	if (reviewerId) {
		existing = await db
			.prepare(
				`SELECT * FROM evaluation_scores
         WHERE submission_id = ? AND reviewer_id = ?`,
			)
			.bind(args.submissionId, reviewerId)
			.first<EvaluationScoreRow>();
	} else {
		existing = await db
			.prepare(
				`SELECT * FROM evaluation_scores
         WHERE plan_id = ? AND submission_id = ? AND scored_by = ? AND reviewer_id IS NULL`,
			)
			.bind(plan.id, args.submissionId, scoredBy)
			.first<EvaluationScoreRow>();
	}

	let scoreRow: EvaluationScoreRow;

	if (existing) {
		await db
			.prepare(
				`UPDATE evaluation_scores
         SET score = ?, comment = ?, scored_by = ?, updated_at = ?
         WHERE id = ?`,
			)
			.bind(args.score, comment, scoredBy, now, existing.id)
			.run();
		scoreRow = {
			...existing,
			score: args.score,
			comment,
			scored_by: scoredBy,
			reviewer_id: reviewerId,
			updated_at: now,
		};
	} else {
		const id = crypto.randomUUID();
		await db
			.prepare(
				`INSERT INTO evaluation_scores (
          id, plan_id, submission_id, score, comment, scored_by, reviewer_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				id,
				plan.id,
				args.submissionId,
				args.score,
				comment,
				scoredBy,
				reviewerId,
				now,
				now,
			)
			.run();
		scoreRow = {
			id,
			plan_id: plan.id,
			submission_id: args.submissionId,
			score: args.score,
			comment,
			scored_by: scoredBy,
			reviewer_id: reviewerId,
			created_at: now,
			updated_at: now,
		};
	}

	if (
		isSubmissionStatus(submission.status) &&
		submission.status === "submitted"
	) {
		try {
			const next = transitionSubmission(submission.status, "under_review");
			await db
				.prepare(
					`UPDATE submissions SET status = ?, updated_at = ? WHERE id = ?`,
				)
				.bind(next, now, submission.id)
				.run();
		} catch (error) {
			if (!(error instanceof IllegalSubmissionTransitionError)) {
				throw error;
			}
		}
	}

	return { ok: true, score: scoreRow };
}
