import {
	getEvaluationPlanByToken,
	getSubmissionById,
} from "@/lib/db/queries";
import type { EvaluationScoreRow } from "@/lib/db/types";
import {
	IllegalSubmissionTransitionError,
	isReviewableSubmissionStatus,
	isSubmissionStatus,
	isValidScore,
	transitionSubmission,
} from "@/lib/domain";

export type ScoreResult =
	| { ok: true; score: EvaluationScoreRow }
	| { ok: false; error: string; status: number };

export async function upsertEvaluationScore(
	db: D1Database,
	args: {
		token: string;
		submissionId: string;
		score: number;
		comment?: string;
		scoredBy: string;
	},
): Promise<ScoreResult> {
	if (!isValidScore(args.score)) {
		return { ok: false, error: "score must be an integer 1–5", status: 400 };
	}

	const plan = await getEvaluationPlanByToken(db, args.token);
	if (!plan || plan.status !== "active") {
		return { ok: false, error: "Invalid or inactive review token", status: 401 };
	}

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
	const scoredBy = args.scoredBy.trim() || "reviewer";
	const comment = args.comment?.trim() || null;

	const existing = await db
		.prepare(
			`SELECT * FROM evaluation_scores
       WHERE plan_id = ? AND submission_id = ? AND scored_by = ?`,
		)
		.bind(plan.id, args.submissionId, scoredBy)
		.first<EvaluationScoreRow>();

	let scoreRow: EvaluationScoreRow;

	if (existing) {
		await db
			.prepare(
				`UPDATE evaluation_scores
         SET score = ?, comment = ?, updated_at = ?
         WHERE id = ?`,
			)
			.bind(args.score, comment, now, existing.id)
			.run();
		scoreRow = {
			...existing,
			score: args.score,
			comment,
			updated_at: now,
		};
	} else {
		const id = crypto.randomUUID();
		await db
			.prepare(
				`INSERT INTO evaluation_scores (
          id, plan_id, submission_id, score, comment, scored_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				id,
				plan.id,
				args.submissionId,
				args.score,
				comment,
				scoredBy,
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
