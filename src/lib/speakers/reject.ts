import {
	IllegalSubmissionTransitionError,
	isSubmissionStatus,
	transitionSubmission,
	type SubmissionStatus,
} from "@/lib/domain";
import { getSubmissionById } from "@/lib/db/queries";
import { notifySubmissionLifecycle } from "@/lib/email/notify";
import type { OutboundSendResult } from "@/lib/email/resend";

export type RejectResult =
	| {
			ok: true;
			submissionId: string;
			status: "rejected";
			email: OutboundSendResult | null;
	  }
	| { ok: false; error: string; status?: number };

export async function rejectSubmission(
	db: D1Database,
	submissionId: string,
): Promise<RejectResult> {
	const submission = await getSubmissionById(db, submissionId);
	if (!submission) {
		return { ok: false, error: "Submission not found", status: 404 };
	}

	if (!isSubmissionStatus(submission.status)) {
		return { ok: false, error: `Unknown status: ${submission.status}`, status: 500 };
	}

	if (submission.status === "rejected") {
		const email = await notifySubmissionLifecycle(db, {
			submissionId,
			templateKey: "rejection",
		});
		return {
			ok: true,
			submissionId,
			status: "rejected",
			email,
		};
	}

	let nextStatus: SubmissionStatus;
	try {
		nextStatus = transitionSubmission(submission.status, "rejected");
	} catch (error) {
		if (error instanceof IllegalSubmissionTransitionError) {
			return { ok: false, error: error.message, status: 409 };
		}
		throw error;
	}

	const now = Date.now();
	await db
		.prepare(
			`UPDATE submissions
       SET status = ?, updated_at = ?
       WHERE id = ?`,
		)
		.bind(nextStatus, now, submissionId)
		.run();

	const email = await notifySubmissionLifecycle(db, {
		submissionId,
		templateKey: "rejection",
	});

	return {
		ok: true,
		submissionId,
		status: "rejected",
		email,
	};
}
