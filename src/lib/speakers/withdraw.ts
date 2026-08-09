import {
	IllegalSubmissionTransitionError,
	isSubmissionStatus,
	transitionSubmission,
	type SubmissionStatus,
} from "@/lib/domain";
import { getAgendaSlotBySubmission, getSubmissionById } from "@/lib/db/queries";
import { unplaceScheduledSubmission } from "@/lib/schedule/unplace";

export type WithdrawResult =
	| { ok: true; submissionId: string; status: "withdrawn" }
	| { ok: false; error: string; status: number };

/**
 * Speaker-initiated withdraw. Person must own the proposal as submitter or
 * linked speaker. Placed sessions unplace via EventRoom first (CANCEL invite),
 * then status moves to `withdrawn`.
 */
export async function withdrawSubmission(
	db: D1Database,
	args: { submissionId: string; personId: string },
): Promise<WithdrawResult> {
	const submission = await getSubmissionById(db, args.submissionId);
	if (!submission) {
		return { ok: false, error: "Submission not found", status: 404 };
	}

	const linked = await db
		.prepare(
			`SELECT 1 AS ok
       FROM submissions s
       LEFT JOIN submission_speakers ss ON ss.submission_id = s.id
       WHERE s.id = ?
         AND (s.submitter_person_id = ? OR ss.person_id = ?)
       LIMIT 1`,
		)
		.bind(args.submissionId, args.personId, args.personId)
		.first<{ ok: number }>();
	if (!linked) {
		return { ok: false, error: "Forbidden", status: 403 };
	}

	if (!isSubmissionStatus(submission.status)) {
		return { ok: false, error: `Unknown status: ${submission.status}`, status: 500 };
	}

	if (submission.status === "withdrawn") {
		return { ok: true, submissionId: submission.id, status: "withdrawn" };
	}

	let currentStatus: SubmissionStatus = submission.status;
	if (currentStatus === "scheduled" || currentStatus === "published") {
		const slot = await getAgendaSlotBySubmission(db, args.submissionId);
		if (slot) {
			const unplaced = await unplaceScheduledSubmission(db, {
				eventId: submission.event_id,
				submissionId: args.submissionId,
			});
			if (!unplaced.ok) {
				return unplaced;
			}
			const refreshed = await getSubmissionById(db, args.submissionId);
			if (!refreshed || !isSubmissionStatus(refreshed.status)) {
				return { ok: false, error: "Submission missing after unplace", status: 500 };
			}
			currentStatus = refreshed.status;
		}
	}

	let next: SubmissionStatus;
	try {
		next = transitionSubmission(currentStatus, "withdrawn");
	} catch (error) {
		if (error instanceof IllegalSubmissionTransitionError) {
			return {
				ok: false,
				error: `Cannot withdraw from ${currentStatus}`,
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

	return { ok: true, submissionId: args.submissionId, status: "withdrawn" };
}
