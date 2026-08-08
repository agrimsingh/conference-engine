import type { ReviewerRow } from "@/lib/db/types";
import { listReviewersForPlan } from "@/lib/db/queries";

const SEED_REVIEWER_NAMES = ["Reviewer A", "Reviewer B", "Reviewer C"] as const;

export function newReviewerToken(): string {
	return crypto.randomUUID().replace(/-/g, "");
}

export async function createReviewer(
	db: D1Database,
	args: { planId: string; name: string },
): Promise<ReviewerRow> {
	const name = args.name.trim();
	if (!name) {
		throw new Error("Reviewer name is required");
	}

	const id = crypto.randomUUID();
	const token = newReviewerToken();
	const createdAt = Date.now();

	await db
		.prepare(
			`INSERT INTO reviewers (id, plan_id, name, token, created_at)
       VALUES (?, ?, ?, ?, ?)`,
		)
		.bind(id, args.planId, name, token, createdAt)
		.run();

	return {
		id,
		plan_id: args.planId,
		name,
		token,
		created_at: createdAt,
	};
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
	const rows: ReviewerRow[] = SEED_REVIEWER_NAMES.map((name) => ({
		id: crypto.randomUUID(),
		plan_id: planId,
		name,
		token: newReviewerToken(),
		created_at: now,
	}));

	await db.batch(
		rows.map((row) =>
			db
				.prepare(
					`INSERT INTO reviewers (id, plan_id, name, token, created_at)
           VALUES (?, ?, ?, ?, ?)`,
				)
				.bind(row.id, row.plan_id, row.name, row.token, row.created_at),
		),
	);

	return rows;
}

export function reviewPathForToken(token: string): string {
	return `/review?token=${token}`;
}
