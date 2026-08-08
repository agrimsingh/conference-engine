import type { EvaluationPlanRow } from "@/lib/db/types";
import { getActiveEvaluationPlan } from "@/lib/db/queries";
import { ensureSeedReviewers } from "@/lib/evaluation/reviewers";

export type ActivatePlanResult =
	| { ok: true; plan: EvaluationPlanRow; created: boolean }
	| { ok: false; error: string; status: number };

export async function activateEvaluationPlan(
	db: D1Database,
	args: { eventId: string; name?: string },
): Promise<ActivatePlanResult> {
	const now = Date.now();
	const existing = await getActiveEvaluationPlan(db, args.eventId);
	if (existing) {
		await ensureSeedReviewers(db, existing.id);
		return { ok: true, plan: existing, created: false };
	}

	const draft = await db
		.prepare(
			`SELECT * FROM evaluation_plans
       WHERE event_id = ? AND status = 'draft'
       ORDER BY created_at DESC
       LIMIT 1`,
		)
		.bind(args.eventId)
		.first<EvaluationPlanRow>();

	if (draft) {
		await db
			.prepare(
				`UPDATE evaluation_plans
         SET status = 'active', updated_at = ?
         WHERE id = ?`,
			)
			.bind(now, draft.id)
			.run();
		const plan: EvaluationPlanRow = {
			...draft,
			status: "active",
			updated_at: now,
		};
		await ensureSeedReviewers(db, plan.id);
		return { ok: true, plan, created: false };
	}

	const id = crypto.randomUUID();
	const reviewerToken = crypto.randomUUID().replace(/-/g, "");
	const name = args.name?.trim() || "Default review";

	await db
		.prepare(
			`INSERT INTO evaluation_plans (
        id, event_id, name, status, reviewer_token, created_at, updated_at
      ) VALUES (?, ?, ?, 'active', ?, ?, ?)`,
		)
		.bind(id, args.eventId, name, reviewerToken, now, now)
		.run();

	const plan: EvaluationPlanRow = {
		id,
		event_id: args.eventId,
		name,
		status: "active",
		reviewer_token: reviewerToken,
		created_at: now,
		updated_at: now,
	};

	await ensureSeedReviewers(db, plan.id);
	return { ok: true, plan, created: true };
}
