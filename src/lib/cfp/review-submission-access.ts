import { getActiveEvaluationPlan, getSubmissionById } from "@/lib/db/queries";
import { filterBoardSubmissions, listReviewerAssignments } from "@/lib/evaluation/assignments";
import { resolveReviewIdentity } from "@/lib/evaluation/score";

export type ReviewSubmissionAccess =
	| { ok: true; eventId: string }
	| { ok: false; error: string; status: number };

export async function authorizeReviewSubmissionAccess(
	db: D1Database,
	args: {
		token: string;
		submissionId: string;
		adminCommitteeEventId?: string;
	},
): Promise<ReviewSubmissionAccess> {
	const submission = await getSubmissionById(db, args.submissionId);
	if (!submission) return { ok: false, error: "Submission not found", status: 404 };

	const token = args.token.trim();
	if (!token && args.adminCommitteeEventId) {
		if (args.adminCommitteeEventId !== submission.event_id) {
			return { ok: false, error: "Event not found", status: 404 };
		}
		const plan = await getActiveEvaluationPlan(db, submission.event_id);
		if (!plan) {
			return { ok: false, error: "No active evaluation plan", status: 409 };
		}
		return { ok: true, eventId: submission.event_id };
	}

	if (!token) return { ok: false, error: "Unauthorized", status: 401 };

	const identity = await resolveReviewIdentity(db, token);
	if (!identity || identity.plan.status !== "active") {
		return { ok: false, error: "Invalid or inactive review token", status: 401 };
	}
	if (identity.plan.event_id !== submission.event_id) {
		return { ok: false, error: "Submission not found", status: 404 };
	}

	if (identity.mode === "reviewer") {
		const assignments = await listReviewerAssignments(db, {
			planId: identity.plan.id,
			reviewerId: identity.reviewer.id,
		});
		const allowed = filterBoardSubmissions([submission], {
			mode: "reviewer",
			assignments,
		});
		if (allowed.length === 0) {
			return { ok: false, error: "Submission is not assigned to this reviewer", status: 403 };
		}
	}

	return { ok: true, eventId: submission.event_id };
}
