import type { EvaluationCriterionRow, EvaluationPlanRow } from "@/lib/db/types";
import { getActiveEvaluationPlan } from "@/lib/db/queries";
import { ensureSeedReviewers } from "@/lib/evaluation/reviewers";
import { backfillEvaluationTokenDigests, digestReviewToken, newReviewToken, storedTokenMarker } from "@/lib/evaluation/tokens";

const DEFAULT_CRITERIA = [
	{ label: "Content quality", description: "Clear, useful, and technically sound.", weight: 1 },
	{ label: "Audience fit", description: "A strong fit for this event's audience.", weight: 1 },
	{ label: "Speaker readiness", description: "The proposal gives confidence it can be delivered well.", weight: 1 },
] as const;

export type EvaluationPlanWithCriteria = EvaluationPlanRow & {
	criteria: EvaluationCriterionRow[];
};

export type ActivatePlanResult =
	| { ok: true; plan: EvaluationPlanRow; created: boolean; committeeToken?: string }
	| { ok: false; error: string; status: number };

export async function activateEvaluationPlan(
	db: D1Database,
	args: { eventId: string; name?: string; planId?: string },
): Promise<ActivatePlanResult> {
	await backfillEvaluationTokenDigests(db);
	const now = Date.now();
	const existing = await getActiveEvaluationPlan(db, args.eventId);
	if (existing) {
		if (args.planId && args.planId !== existing.id) {
			return { ok: false, error: "Another evaluation plan is already active for this event", status: 409 };
		}
		return { ok: true, plan: existing, created: false };
	}

	const draft = args.planId
		? await db.prepare(`SELECT * FROM evaluation_plans WHERE event_id = ? AND status = 'draft' AND id = ?`).bind(args.eventId, args.planId).first<EvaluationPlanRow>()
		: await db.prepare(`SELECT * FROM evaluation_plans WHERE event_id = ? AND status = 'draft' ORDER BY created_at DESC LIMIT 1`).bind(args.eventId).first<EvaluationPlanRow>();

	if (draft) {
		await ensureDefaultCriteria(db, draft.id);
		await ensureSeedReviewers(db, draft.id);
		const committeeToken = newReviewToken();
		const activated = await db.prepare(`UPDATE evaluation_plans
        SET status = 'active', reviewer_token = ?, reviewer_token_digest = ?, updated_at = ?
        WHERE id = ? AND event_id = ? AND status = 'draft'
          AND NOT EXISTS (SELECT 1 FROM evaluation_plans WHERE event_id = ? AND status = 'active')`)
			.bind(storedTokenMarker(draft.id), await digestReviewToken(committeeToken), now, draft.id, args.eventId, args.eventId).run();
		if ((activated.meta.changes ?? 0) === 0) {
			return { ok: false, error: "Another evaluation plan is already active for this event", status: 409 };
		}
		const plan: EvaluationPlanRow = {
			...draft,
			status: "active",
			updated_at: now,
		};
		return { ok: true, plan, created: false, committeeToken };
	}

	const id = crypto.randomUUID();
	const reviewerToken = newReviewToken();
	const name = args.name?.trim() || "Default review";

	// Build the rubric while the plan is still a draft. This keeps the immutable
	// active-plan contract true even for the first plan an event creates.
	await db
		.prepare(
			`INSERT INTO evaluation_plans (
        id, event_id, name, status, reviewer_token, reviewer_token_digest, created_at, updated_at
      ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?)`,
		)
		.bind(id, args.eventId, name, storedTokenMarker(id), await digestReviewToken(reviewerToken), now, now)
		.run();
	await ensureDefaultCriteria(db, id);
	await ensureSeedReviewers(db, id);
	const activated = await db.prepare(`UPDATE evaluation_plans
      SET status = 'active', updated_at = ?
      WHERE id = ? AND event_id = ? AND status = 'draft'
        AND NOT EXISTS (SELECT 1 FROM evaluation_plans WHERE event_id = ? AND status = 'active')`)
		.bind(now, id, args.eventId, args.eventId).run();
	if ((activated.meta.changes ?? 0) === 0) {
		return { ok: false, error: "Another evaluation plan is already active for this event", status: 409 };
	}

	const plan: EvaluationPlanRow = {
		id,
		event_id: args.eventId,
		name,
		status: "active",
		reviewer_token: storedTokenMarker(id),
		created_at: now,
		updated_at: now,
	};

	return { ok: true, plan, created: true, committeeToken: reviewerToken };
}

export async function listEvaluationPlans(
	db: D1Database,
	eventId: string,
): Promise<EvaluationPlanRow[]> {
	await backfillEvaluationTokenDigests(db);
	const result = await db
		.prepare(`SELECT * FROM evaluation_plans WHERE event_id = ? ORDER BY updated_at DESC, created_at DESC`)
		.bind(eventId)
		.all<EvaluationPlanRow>();
	return result.results;
}

export async function getEvaluationPlanForEvent(
	db: D1Database,
	args: { eventId: string; planId: string },
): Promise<EvaluationPlanRow | null> {
	return db
		.prepare(`SELECT * FROM evaluation_plans WHERE id = ? AND event_id = ?`)
		.bind(args.planId, args.eventId)
		.first<EvaluationPlanRow>();
}

export async function createEvaluationPlan(
	db: D1Database,
	args: { eventId: string; name: string },
): Promise<EvaluationPlanWithCriteria> {
	const name = args.name.trim();
	if (!name) throw new EvaluationPlanValidationError("Plan name is required");
	if (name.length > 120) throw new EvaluationPlanValidationError("Plan name must be 120 characters or less");
	const now = Date.now();
	const id = crypto.randomUUID();
	const plan: EvaluationPlanRow = {
		id, event_id: args.eventId, name, status: "draft",
		reviewer_token: storedTokenMarker(id), created_at: now, updated_at: now,
	};
	// Keep draft plan links non-secret too. A committee link is minted only when
	// the organizer activates this draft.
	await db.prepare(`INSERT INTO evaluation_plans (id, event_id, name, status, reviewer_token, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?, ?)`)
		.bind(plan.id, plan.event_id, plan.name, plan.reviewer_token, now, now).run();
	await db.prepare(`UPDATE evaluation_plans SET reviewer_token_digest = ? WHERE id = ?`)
		.bind(await digestReviewToken(newReviewToken()), plan.id).run();
	const criteria = await ensureDefaultCriteria(db, plan.id);
	return { ...plan, criteria };
}

export async function updateEvaluationPlan(
	db: D1Database,
	args: { eventId: string; planId: string; name?: string; status?: "draft" | "closed" },
): Promise<EvaluationPlanRow> {
	const current = await getEvaluationPlanForEvent(db, args);
	if (!current) throw new EvaluationPlanValidationError("Evaluation plan not found", 404);
	if (current.status === "active" && args.status && args.status !== "closed") {
		throw new EvaluationPlanValidationError("Active plans can only be closed or renamed");
	}
	const name = args.name === undefined ? current.name : args.name.trim();
	if (!name) throw new EvaluationPlanValidationError("Plan name is required");
	if (name.length > 120) throw new EvaluationPlanValidationError("Plan name must be 120 characters or less");
	const status = args.status ?? current.status;
	const updated_at = Date.now();
	await db.prepare(`UPDATE evaluation_plans SET name = ?, status = ?, updated_at = ? WHERE id = ? AND event_id = ?`)
		.bind(name, status, updated_at, args.planId, args.eventId).run();
	return { ...current, name, status, updated_at };
}

export async function deleteDraftEvaluationPlan(
	db: D1Database,
	args: { eventId: string; planId: string },
): Promise<void> {
	const plan = await getEvaluationPlanForEvent(db, args);
	if (!plan) throw new EvaluationPlanValidationError("Evaluation plan not found", 404);
	if (plan.status !== "draft") throw new EvaluationPlanValidationError("Only draft plans can be deleted");
	const usage = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM evaluation_scores WHERE plan_id = ?) AS scores,
      (SELECT COUNT(*) FROM review_assignments WHERE plan_id = ?) AS assignments`)
		.bind(plan.id, plan.id).first<{ scores: number; assignments: number }>();
	if ((usage?.scores ?? 0) > 0 || (usage?.assignments ?? 0) > 0) {
		throw new EvaluationPlanValidationError("A plan with scores or assignments cannot be deleted");
	}
	await db.batch([
		db.prepare(`DELETE FROM evaluation_criteria WHERE plan_id = ?`).bind(plan.id),
		db.prepare(`DELETE FROM reviewers WHERE plan_id = ?`).bind(plan.id),
		db.prepare(`DELETE FROM evaluation_plans WHERE id = ? AND event_id = ?`).bind(plan.id, args.eventId),
	]);
}

export async function listCriteria(
	db: D1Database,
	planId: string,
): Promise<EvaluationCriterionRow[]> {
	const result = await db.prepare(`SELECT * FROM evaluation_criteria WHERE plan_id = ? AND soft_deleted = 0 ORDER BY position ASC, label ASC`)
		.bind(planId).all<EvaluationCriterionRow>();
	return result.results;
}

export async function ensureDefaultCriteria(db: D1Database, planId: string): Promise<EvaluationCriterionRow[]> {
	const existing = await listCriteria(db, planId);
	if (existing.length) return existing;
	const now = Date.now();
	const rows: EvaluationCriterionRow[] = DEFAULT_CRITERIA.map((criterion, position) => ({
		id: crypto.randomUUID(), plan_id: planId, label: criterion.label, description: criterion.description,
		weight: criterion.weight, scale_min: 1, scale_max: 5, position, soft_deleted: 0, created_at: now, updated_at: now,
	}));
	await db.batch(rows.map((row) => db.prepare(`INSERT INTO evaluation_criteria (id, plan_id, label, description, weight, scale_min, scale_max, position, soft_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
		.bind(row.id, row.plan_id, row.label, row.description, row.weight, row.scale_min, row.scale_max, row.position, now, now)));
	return rows;
}

export async function createCriterion(db: D1Database, args: { planId: string; label: string; description?: string; weight: number; scaleMin?: number; scaleMax?: number }): Promise<EvaluationCriterionRow> {
	await assertCriteriaMutable(db, args.planId);
	const values = validateCriterion(args);
	const next = await db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS position FROM evaluation_criteria WHERE plan_id = ?`)
		.bind(args.planId).first<{ position: number }>();
	const now = Date.now();
	const row: EvaluationCriterionRow = { id: crypto.randomUUID(), plan_id: args.planId, ...values, position: next?.position ?? 0, soft_deleted: 0, created_at: now, updated_at: now };
	await db.prepare(`INSERT INTO evaluation_criteria (id, plan_id, label, description, weight, scale_min, scale_max, position, soft_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
		.bind(row.id, row.plan_id, row.label, row.description, row.weight, row.scale_min, row.scale_max, row.position, now, now).run();
	return row;
}

export async function updateCriterion(db: D1Database, args: { planId: string; criterionId: string; label?: string; description?: string | null; weight?: number; scaleMin?: number; scaleMax?: number; position?: number }): Promise<EvaluationCriterionRow> {
	await assertCriteriaMutable(db, args.planId);
	const current = await db.prepare(`SELECT * FROM evaluation_criteria WHERE id = ? AND plan_id = ? AND soft_deleted = 0`)
		.bind(args.criterionId, args.planId).first<EvaluationCriterionRow>();
	if (!current) throw new EvaluationPlanValidationError("Criterion not found", 404);
	const values = validateCriterion({ label: args.label ?? current.label, description: args.description === undefined ? current.description ?? undefined : args.description ?? undefined, weight: args.weight ?? current.weight, scaleMin: args.scaleMin ?? current.scale_min, scaleMax: args.scaleMax ?? current.scale_max });
	const position = args.position === undefined ? current.position : args.position;
	if (!Number.isInteger(position) || position < 0) throw new EvaluationPlanValidationError("position must be a non-negative integer");
	const updated_at = Date.now();
	await db.prepare(`UPDATE evaluation_criteria SET label = ?, description = ?, weight = ?, scale_min = ?, scale_max = ?, position = ?, updated_at = ? WHERE id = ? AND plan_id = ?`)
		.bind(values.label, values.description, values.weight, values.scale_min, values.scale_max, position, updated_at, args.criterionId, args.planId).run();
	return { ...current, ...values, position, updated_at };
}

export async function deleteCriterion(db: D1Database, args: { planId: string; criterionId: string }): Promise<void> {
	await assertCriteriaMutable(db, args.planId);
	const criterion = await db.prepare(`SELECT id FROM evaluation_criteria WHERE id = ? AND plan_id = ? AND soft_deleted = 0`).bind(args.criterionId, args.planId).first();
	if (!criterion) throw new EvaluationPlanValidationError("Criterion not found", 404);
	const count = await db.prepare(`SELECT COUNT(*) AS count FROM evaluation_criteria WHERE plan_id = ? AND soft_deleted = 0`).bind(args.planId).first<{ count: number }>();
	if ((count?.count ?? 0) <= 1) throw new EvaluationPlanValidationError("A plan needs at least one criterion");
	await db.prepare(`UPDATE evaluation_criteria SET soft_deleted = 1, updated_at = ? WHERE id = ? AND plan_id = ?`).bind(Date.now(), args.criterionId, args.planId).run();
}

async function assertCriteriaMutable(db: D1Database, planId: string): Promise<void> {
	const plan = await db.prepare(`SELECT status FROM evaluation_plans WHERE id = ?`).bind(planId).first<{ status: string }>();
	if (!plan) throw new EvaluationPlanValidationError("Evaluation plan not found", 404);
	if (plan.status !== "draft") throw new EvaluationPlanValidationError("Criteria are frozen once a plan is activated", 409);
}


function validateCriterion(args: { label: string; description?: string; weight: number; scaleMin?: number; scaleMax?: number }) {
	const label = args.label.trim();
	if (!label) throw new EvaluationPlanValidationError("Criterion label is required");
	if (label.length > 120) throw new EvaluationPlanValidationError("Criterion label must be 120 characters or less");
	const description = args.description?.trim() || null;
	if (description && description.length > 500) throw new EvaluationPlanValidationError("Criterion description must be 500 characters or less");
	if (!Number.isFinite(args.weight) || args.weight <= 0 || args.weight > 100) throw new EvaluationPlanValidationError("weight must be greater than 0 and at most 100");
	const scale_min = args.scaleMin ?? 1;
	const scale_max = args.scaleMax ?? 5;
	if (!Number.isInteger(scale_min) || !Number.isInteger(scale_max) || scale_min >= scale_max || scale_min < 0 || scale_max > 100) throw new EvaluationPlanValidationError("scaleMin and scaleMax must be whole numbers where scaleMin is lower than scaleMax");
	return { label, description, weight: args.weight, scale_min, scale_max };
}

export class EvaluationPlanValidationError extends Error {
	constructor(message: string, readonly status = 400) {
		super(message);
		this.name = "EvaluationPlanValidationError";
	}
}
