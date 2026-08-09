import {
	IllegalSubmissionTransitionError,
	isSubmissionStatus,
	transitionSubmission,
	type DecisionEmailChoice,
	type SubmissionStatus,
} from "@/lib/domain";
import {
	getSubmissionById,
	listSpeakersForSubmission,
} from "@/lib/db/queries";
import { notifySubmissionLifecycle } from "@/lib/email/notify";
import type { OutboundSendResult } from "@/lib/email/resend";
import {
	ensureTaskTemplates,
	MissingTaskTemplatesError,
	materializeAcceptedSpeaker,
} from "./materialize";

export type AcceptResult =
	| {
			ok: true;
			submissionId: string;
			status: "accepted";
			spawnedTaskKeys: string[];
			speakerPersonIds: string[];
			email: OutboundSendResult | null;
	  }
	| { ok: false; error: string; status?: number };

export async function acceptSubmission(
	db: D1Database,
	submissionId: string,
	emailChoice: DecisionEmailChoice,
): Promise<AcceptResult> {
	const submission = await getSubmissionById(db, submissionId);
	if (!submission) {
		return { ok: false, error: "Submission not found", status: 404 };
	}

	if (!isSubmissionStatus(submission.status)) {
		return { ok: false, error: `Unknown status: ${submission.status}`, status: 500 };
	}

	const now = Date.now();
	let nextStatus: SubmissionStatus = submission.status;

	if (submission.status !== "accepted") {
		try {
			nextStatus = transitionSubmission(submission.status, "accepted");
		} catch (error) {
			if (error instanceof IllegalSubmissionTransitionError) {
				return {
					ok: false,
					error: error.message,
					status: 409,
				};
			}
			throw error;
		}
	}

	const speakers = await listSpeakersForSubmission(db, submissionId);
	if (!speakers.length) {
		return { ok: false, error: "Submission has no speakers", status: 400 };
	}

	// Tasks spawn only for confirmed speakers. Pending co-speakers get theirs
	// when they confirm (see co-speakers.ts); declined/removed never do.
	const confirmed = speakers.filter((speaker) => speaker.status === "confirmed");
	if (!confirmed.length) {
		return { ok: false, error: "Submission has no confirmed speakers", status: 400 };
	}

	let templates;
	try {
		templates = await ensureTaskTemplates(db, submission.event_id);
	} catch (error) {
		if (error instanceof MissingTaskTemplatesError) {
			return { ok: false, error: error.message, status: 500 };
		}
		throw error;
	}

	if (submission.status !== "accepted") {
		await db
			.prepare(
				`UPDATE submissions
         SET status = ?, updated_at = ?
         WHERE id = ?`,
			)
			.bind(nextStatus, now, submissionId)
			.run();
	}

	const speakerPersonIds: string[] = [];
	const spawnedTaskKeys = new Set<string>();

	for (const speaker of confirmed) {
		const result = await materializeAcceptedSpeaker(
			db,
			{
				eventId: submission.event_id,
				submissionId,
				speaker,
				templates,
			},
			now,
		);
		speakerPersonIds.push(result.personId);
		for (const key of result.spawnedTaskKeys) spawnedTaskKeys.add(key);
	}

	const email = emailChoice.send
		? await notifySubmissionLifecycle(db, {
				submissionId,
				templateKey: "acceptance",
				override: { subject: emailChoice.subject, text: emailChoice.text },
				force: true,
			})
		: null;

	return {
		ok: true,
		submissionId,
		status: "accepted",
		spawnedTaskKeys: [...spawnedTaskKeys],
		speakerPersonIds,
		email,
	};
}
