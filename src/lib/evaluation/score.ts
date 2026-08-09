import {
	getSubmissionById,
	listAssignmentsForReviewer,
} from "@/lib/db/queries";
import type { EvaluationCriterionRow, EvaluationPlanRow, EvaluationScoreRow, ReviewerRow } from "@/lib/db/types";
import {
	IllegalSubmissionTransitionError,
	isReviewableSubmissionStatus,
	isSubmissionStatus,
	isValidScore,
	transitionSubmission,
} from "@/lib/domain";
import { filterBoardSubmissions } from "@/lib/evaluation/assignments";
import { DemoEventWriteError, requireWritableEventById } from "@/lib/events/writability";
import { listCriteria } from "@/lib/evaluation/plan";
import { backfillEvaluationTokenDigests, digestReviewToken } from "@/lib/evaluation/tokens";

export type CriterionScoreInput = {
	criterionId: string;
	score?: number;
	value?: number | string;
	comment?: string;
};

export type EvaluationCriterionScoreRow = {
	id: string;
	plan_id: string;
	criterion_id: string;
	submission_id: string;
	reviewer_id: string | null;
	score: number;
	value_text: string | null;
	comment: string | null;
	created_at: number;
	updated_at: number;
};

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
	await backfillEvaluationTokenDigests(db);
	const digest = await digestReviewToken(token);
	const reviewer = await db.prepare(`SELECT * FROM reviewers WHERE token_digest = ? AND revoked_at IS NULL`)
		.bind(digest).first<(ReviewerRow & { revoked_at: number | null })>();
	if (reviewer) {
		const plan = await db
			.prepare("SELECT * FROM evaluation_plans WHERE id = ?")
			.bind(reviewer.plan_id)
			.first<EvaluationPlanRow>();
		if (!plan) return null;
		return { mode: "reviewer", plan, reviewer };
	}

	const plan = await db.prepare(`SELECT * FROM evaluation_plans WHERE reviewer_token_digest = ?`)
		.bind(digest).first<EvaluationPlanRow>();
	if (!plan) return null;
	return { mode: "committee", plan, reviewer: null };
}

export async function upsertEvaluationScore(
	db: D1Database,
	args: {
		token: string;
		submissionId: string;
		score?: number;
		comment?: string;
		criterionScores?: CriterionScoreInput[];
		committeePlanId?: string;
	},
): Promise<ScoreResult> {
	if (args.score !== undefined && !isValidScore(args.score)) {
		return { ok: false, error: "score must be an integer 1–5", status: 400 };
	}
	if (args.score === undefined && !args.criterionScores) {
		return { ok: false, error: "score or criterionScores is required", status: 400 };
	}

	const identity = args.committeePlanId
		? await resolveTrustedCommitteeIdentity(db, args.committeePlanId)
		: await resolveReviewIdentity(db, args.token);
	if (!identity) {
		return { ok: false, error: "Invalid or inactive review token", status: 401 };
	}

	const { plan } = identity;
	const roundAvailability = reviewRoundAvailability(plan, Date.now());
	if (!roundAvailability.ok) return roundAvailability;
	try {
		await requireWritableEventById(db, plan.event_id);
	} catch (error) {
		if (error instanceof DemoEventWriteError) {
			return { ok: false, error: "This review is read-only", status: 403 };
		}
		throw error;
	}
	const submission = await getSubmissionById(db, args.submissionId);
	if (!submission || submission.event_id !== plan.event_id) {
		return { ok: false, error: "Submission not found", status: 404 };
	}

	if (identity.mode === "reviewer") {
		const assignments = await listAssignmentsForReviewer(
			db,
			plan.id,
			identity.reviewer.id,
		);
		const activeAssignments = assignments.filter((assignment) => assignment.recused_at === null);
		const allowed = filterBoardSubmissions([submission], {
			mode: "reviewer",
			assignments: activeAssignments,
		});
		if (allowed.length === 0) {
			return {
				ok: false,
				error: assignments.some((assignment) => assignment.submission_id === submission.id && assignment.recused_at !== null)
					? "You recused this assignment and cannot score it"
					: "Submission is not assigned to this reviewer",
				status: 403,
			};
		}
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

	const criteria = await listCriteria(db, plan.id);
	const validatedCriterionScores = validateCriterionScores(criteria, args.criterionScores);
	if ("error" in validatedCriterionScores) return validatedCriterionScores;
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

	const aggregateScore = validatedCriterionScores.numericRows.length
		? weightedAggregateScore(criteria, validatedCriterionScores.rows)
		: args.score ?? 1;
	let scoreRow: EvaluationScoreRow;
	const statements: D1PreparedStatement[] = [];

	if (existing) {
		statements.push(db.prepare(
				`UPDATE evaluation_scores
         SET score = ?, comment = ?, scored_by = ?, updated_at = ?
         WHERE id = ?`,
			)
			.bind(aggregateScore, comment, scoredBy, now, existing.id));
		scoreRow = {
			...existing,
			score: aggregateScore,
			comment,
			scored_by: scoredBy,
			reviewer_id: reviewerId,
			updated_at: now,
		};
	} else {
		const id = crypto.randomUUID();
		statements.push(db.prepare(
				`INSERT INTO evaluation_scores (
          id, plan_id, submission_id, score, comment, scored_by, reviewer_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				id,
				plan.id,
				args.submissionId,
				aggregateScore,
				comment,
				scoredBy,
				reviewerId,
				now,
				now,
			));
		scoreRow = {
			id,
			plan_id: plan.id,
			submission_id: args.submissionId,
			score: aggregateScore,
			comment,
			scored_by: scoredBy,
			reviewer_id: reviewerId,
			created_at: now,
			updated_at: now,
		};
	}

	for (const criterionScore of validatedCriterionScores.rows) {
		const numericScore = typeof criterionScore.value === "number" ? criterionScore.value : criterionScore.score ?? 0;
		const valueText = typeof criterionScore.value === "string" ? criterionScore.value : null;
		const existingCriterion = reviewerId
			? await db.prepare(`SELECT * FROM evaluation_criterion_scores WHERE criterion_id = ? AND submission_id = ? AND reviewer_id = ?`)
				.bind(criterionScore.criterionId, args.submissionId, reviewerId).first<EvaluationCriterionScoreRow>()
			: await db.prepare(`SELECT * FROM evaluation_criterion_scores WHERE criterion_id = ? AND submission_id = ? AND reviewer_id IS NULL`)
				.bind(criterionScore.criterionId, args.submissionId).first<EvaluationCriterionScoreRow>();
		const criterionComment = criterionScore.comment?.trim() || null;
		if (existingCriterion) {
			statements.push(db.prepare(`UPDATE evaluation_criterion_scores SET score = ?, value_text = ?, comment = ?, updated_at = ? WHERE id = ?`)
				.bind(numericScore, valueText, criterionComment, now, existingCriterion.id));
		} else {
			statements.push(db.prepare(`INSERT INTO evaluation_criterion_scores (id, plan_id, criterion_id, submission_id, reviewer_id, score, value_text, comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
				.bind(crypto.randomUUID(), plan.id, criterionScore.criterionId, args.submissionId, reviewerId, numericScore, valueText, criterionComment, now, now));
		}
	}
	await db.batch(statements);

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

export function validateCriterionScores(
	criteria: EvaluationCriterionRow[],
	values: CriterionScoreInput[] | undefined,
): { rows: CriterionScoreInput[]; numericRows: CriterionScoreInput[] } | { ok: false; error: string; status: number } {
	if (!values) return { rows: [], numericRows: [] };
	if (!criteria.length) return { ok: false, error: "This plan has no active criteria", status: 409 };
	if (!Array.isArray(values) || values.length !== criteria.length) {
		return { ok: false, error: "Score every active criterion exactly once", status: 400 };
	}
	const byId = new Map(criteria.map((criterion) => [criterion.id, criterion]));
	const seen = new Set<string>();
	const normalized: CriterionScoreInput[] = [];
	const numericRows: CriterionScoreInput[] = [];
	for (const value of values) {
		if (!value || typeof value.criterionId !== "string") return { ok: false, error: "Each criterion value needs an id", status: 400 };
		const criterion = byId.get(value.criterionId);
		if (!criterion || seen.has(value.criterionId)) return { ok: false, error: "Criterion scores do not match this plan", status: 400 };
		const submitted = value.value ?? value.score;
		if (criterion.criterion_type === "numeric") {
			if (typeof submitted !== "number" || !Number.isInteger(submitted) || submitted < criterion.scale_min || submitted > criterion.scale_max) return { ok: false, error: `${criterion.label} must be a whole number between ${criterion.scale_min} and ${criterion.scale_max}`, status: 400 };
			numericRows.push({ ...value, value: submitted });
			normalized.push({ ...value, value: submitted });
		} else if (criterion.criterion_type === "dropdown") {
			const options = parseOptions(criterion.options_json);
			if (typeof submitted !== "string" || !options.includes(submitted)) return { ok: false, error: `${criterion.label} must be one of its configured options`, status: 400 };
			normalized.push({ ...value, value: submitted });
		} else {
			if (typeof submitted !== "string" || !submitted.trim() || submitted.length > 10_000) return { ok: false, error: `${criterion.label} is required and must be 10,000 characters or less`, status: 400 };
			normalized.push({ ...value, value: submitted.trim() });
		}
		if (value.comment !== undefined && (typeof value.comment !== "string" || value.comment.length > 2_000)) {
			return { ok: false, error: "Criterion comments must be 2,000 characters or less", status: 400 };
		}
		seen.add(value.criterionId);
	}
	return { rows: normalized, numericRows };
}

export function weightedAggregateScore(criteria: EvaluationCriterionRow[], values: CriterionScoreInput[]): number {
	const byId = new Map(criteria.map((criterion) => [criterion.id, criterion]));
	let weighted = 0;
	let weights = 0;
	for (const value of values) {
		const criterion = byId.get(value.criterionId)!;
		if (criterion.criterion_type !== "numeric") continue;
		const numeric = typeof value.value === "number" ? value.value : value.score;
		if (numeric === undefined) continue;
		weighted += numeric * criterion.weight;
		weights += criterion.weight;
	}
	return weights ? weighted / weights : 1;
}

export function reviewRoundAvailability(plan: Pick<EvaluationPlanRow, "status" | "open_at" | "close_at">, now: number): { ok: true } | { ok: false; error: string; status: number } {
	if (plan.status !== "active") return { ok: false, error: "This review round is closed", status: 409 };
	if (plan.open_at !== null && now < plan.open_at) return { ok: false, error: "This review round has not opened yet", status: 409 };
	if (plan.close_at !== null && now > plan.close_at) return { ok: false, error: "This review round is closed", status: 409 };
	return { ok: true };
}

function parseOptions(raw: string | null): string[] {
	try { const value: unknown = raw ? JSON.parse(raw) : []; return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : []; } catch { return []; }
}

export async function listCriterionScoresForPlan(
	db: D1Database,
	planId: string,
): Promise<EvaluationCriterionScoreRow[]> {
	const result = await db.prepare(`SELECT scores.* FROM evaluation_criterion_scores scores
    INNER JOIN evaluation_criteria criteria ON criteria.id = scores.criterion_id
    WHERE scores.plan_id = ? AND criteria.plan_id = scores.plan_id AND criteria.soft_deleted = 0
    ORDER BY scores.updated_at DESC`)
		.bind(planId).all<EvaluationCriterionScoreRow>();
	return result.results;
}

async function resolveTrustedCommitteeIdentity(db: D1Database, planId: string): Promise<ReviewIdentity | null> {
	const plan = await db.prepare(`SELECT * FROM evaluation_plans WHERE id = ?`).bind(planId).first<EvaluationPlanRow>();
	return plan ? { mode: "committee", plan, reviewer: null } : null;
}
