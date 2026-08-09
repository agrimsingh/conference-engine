import {
	IllegalSubmissionTransitionError,
	isSubmissionStatus,
	transitionSubmission,
	WITHDRAWN_RESTORE_STATUS,
	type SubmissionStatus,
} from "@/lib/domain";
import { getSubmissionById } from "@/lib/db/queries";

export type RestoreWithdrawnResult =
	| { ok: true; submissionId: string; status: typeof WITHDRAWN_RESTORE_STATUS }
	| { ok: false; error: string; status: number };

/**
 * Organizer-only restore. Speakers have no portal path here.
 * Target is always under_review (see WITHDRAWN_RESTORE_STATUS).
 */
export async function restoreWithdrawnSubmission(
	db: D1Database,
	args: { submissionId: string; eventId: string },
): Promise<RestoreWithdrawnResult> {
	const submission = await getSubmissionById(db, args.submissionId);
	if (!submission || submission.event_id !== args.eventId) {
		return { ok: false, error: "Submission not found", status: 404 };
	}

	if (!isSubmissionStatus(submission.status)) {
		return { ok: false, error: `Unknown status: ${submission.status}`, status: 500 };
	}

	if (submission.status !== "withdrawn") {
		return {
			ok: false,
			error: `Cannot restore from ${submission.status}`,
			status: 409,
		};
	}

	let next: SubmissionStatus;
	try {
		next = transitionSubmission(submission.status, WITHDRAWN_RESTORE_STATUS);
	} catch (error) {
		if (error instanceof IllegalSubmissionTransitionError) {
			return {
				ok: false,
				error: `Cannot restore from ${submission.status}`,
				status: 409,
			};
		}
		throw error;
	}

	await db
		.prepare(
			`UPDATE submissions
       SET status = ?, updated_at = ?
       WHERE id = ?`,
		)
		.bind(next, Date.now(), args.submissionId)
		.run();

	return {
		ok: true,
		submissionId: args.submissionId,
		status: WITHDRAWN_RESTORE_STATUS,
	};
}
