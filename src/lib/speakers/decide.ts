import {
	DECISION_REGISTRY,
	IllegalSubmissionTransitionError,
	isSubmissionStatus,
	transitionSubmission,
	type DecisionAction,
	type DecisionEmailChoice,
	type SubmissionStatus,
} from "@/lib/domain";
import { getSubmissionById } from "@/lib/db/queries";
import { notifySubmissionLifecycle } from "@/lib/email/notify";
import type { OutboundSendResult } from "@/lib/email/resend";
import { acceptSubmission } from "./accept";

export type DecideResult =
	| {
			ok: true;
			submissionId: string;
			status: SubmissionStatus;
			email: OutboundSendResult | null;
	  }
	| { ok: false; error: string; status?: number };

/**
 * Applies a decision (accept / waitlist / reject) as a status transition,
 * then sends email only if the organizer explicitly chose to. Statuses and
 * communication are decoupled: skipping the email still applies the decision.
 */
export async function decideSubmission(
	db: D1Database,
	submissionId: string,
	action: DecisionAction,
	emailChoice: DecisionEmailChoice,
): Promise<DecideResult> {
	if (action === "accept") {
		const result = await acceptSubmission(db, submissionId, emailChoice);
		if (!result.ok) return result;
		return {
			ok: true,
			submissionId,
			status: result.status,
			email: result.email,
		};
	}

	const meta = DECISION_REGISTRY[action];
	const submission = await getSubmissionById(db, submissionId);
	if (!submission) {
		return { ok: false, error: "Submission not found", status: 404 };
	}
	if (!isSubmissionStatus(submission.status)) {
		return {
			ok: false,
			error: `Unknown status: ${submission.status}`,
			status: 500,
		};
	}

	if (submission.status !== meta.targetStatus) {
		try {
			transitionSubmission(submission.status, meta.targetStatus);
		} catch (error) {
			if (error instanceof IllegalSubmissionTransitionError) {
				return { ok: false, error: error.message, status: 409 };
			}
			throw error;
		}

		await db
			.prepare(
				`UPDATE submissions
         SET status = ?, updated_at = ?
         WHERE id = ?`,
			)
			.bind(meta.targetStatus, Date.now(), submissionId)
			.run();
	}

	const email = emailChoice.send
		? await notifySubmissionLifecycle(db, {
				submissionId,
				templateKey: meta.templateKey,
				override: { subject: emailChoice.subject, text: emailChoice.text },
				force: true,
			})
		: null;

	return { ok: true, submissionId, status: meta.targetStatus, email };
}
