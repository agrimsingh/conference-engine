import type { ReviewAssignmentRow } from "@/lib/db/types";

/** Active assignments still count toward required review completion. */
export function isActiveAssignment(row: Pick<ReviewAssignmentRow, "recused_at">): boolean {
	return row.recused_at == null;
}

export async function recuseAssignment(
	db: D1Database,
	args: {
		planId: string;
		reviewerId: string;
		submissionId: string;
		now?: number;
	},
): Promise<
	| { ok: true; assignment: ReviewAssignmentRow }
	| { ok: false; error: "not_found" | "already_recused" }
> {
	const existing = await db
		.prepare(
			`SELECT * FROM review_assignments
       WHERE plan_id = ? AND reviewer_id = ? AND submission_id = ?`,
		)
		.bind(args.planId, args.reviewerId, args.submissionId)
		.first<ReviewAssignmentRow>();
	if (!existing) return { ok: false, error: "not_found" };
	if (existing.recused_at != null) return { ok: false, error: "already_recused" };

	const recused_at = args.now ?? Date.now();
	await db
		.prepare(
			`UPDATE review_assignments
       SET recused_at = ?
       WHERE id = ? AND recused_at IS NULL`,
		)
		.bind(recused_at, existing.id)
		.run();

	return { ok: true, assignment: { ...existing, recused_at } };
}
