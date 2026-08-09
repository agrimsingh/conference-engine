import { getSubmissionById } from "@/lib/db/queries";
import { isSubmissionStatus, transitionSubmission, type DecisionEmailChoice } from "@/lib/domain";
import { decideSubmission } from "@/lib/speakers/decide";
import type { DecideResult } from "@/lib/speakers/decide";

export type BulkDecisionAction = "accept" | "reject";

export class BulkDecisionValidationError extends Error {
	constructor(message: string, readonly status = 400) {
		super(message);
		this.name = "BulkDecisionValidationError";
	}
}

export type BulkDecisionOutcome =
	| { submissionId: string; ok: true; status: string }
	| { submissionId: string; ok: false; error: string; status: number };

export function parseBulkDecisionEmail(raw: unknown): DecisionEmailChoice {
	if (raw === undefined || raw === null) return { send: false };
	if (typeof raw !== "object") throw new BulkDecisionValidationError("email must be an object");
	const email = raw as Record<string, unknown>;
	if (email.send === false) return { send: false };
	if (email.send !== true) throw new BulkDecisionValidationError("email.send must be true or false");
	const subject = typeof email.subject === "string" ? email.subject.trim() : "";
	const text = typeof email.text === "string" ? email.text.trim() : "";
	if (!subject || !text) throw new BulkDecisionValidationError("email.subject and email.text are required when sending");
	return { send: true, subject, text };
}

/** Applies one decision across the selection. Email is opt-in via DecisionEmailChoice
 * (same override shape as DecisionButtons); default remains send:false. */
export async function bulkDecideSubmissions(
	db: D1Database,
	args: {
		eventId: string;
		submissionIds: string[];
		action: BulkDecisionAction;
		email?: DecisionEmailChoice;
		decide?: (submissionId: string, action: BulkDecisionAction, email: DecisionEmailChoice) => Promise<DecideResult>;
	},
): Promise<{ outcomes: BulkDecisionOutcome[]; succeeded: number; failed: number }> {
	if (args.action !== "accept" && args.action !== "reject") {
		throw new BulkDecisionValidationError("action must be accept or reject");
	}
	const emailChoice = args.email ?? { send: false };
	const submissionIds = [...new Set(args.submissionIds.map((id) => id.trim()).filter(Boolean))];
	if (!submissionIds.length || submissionIds.length !== args.submissionIds.length) {
		throw new BulkDecisionValidationError("Select unique submissions to decide");
	}
	const submissions = await Promise.all(submissionIds.map((submissionId) => getSubmissionById(db, submissionId)));
	if (submissions.some((submission) => !submission || submission.event_id !== args.eventId)) {
		throw new BulkDecisionValidationError("One or more submissions do not belong to this event", 404);
	}
	const outcomes: BulkDecisionOutcome[] = [];
	const ready: string[] = [];
	for (const submission of submissions) {
		if (!submission || !isSubmissionStatus(submission.status)) {
			outcomes.push({ submissionId: submission?.id ?? "unknown", ok: false, error: "Submission has an invalid status", status: 409 });
			continue;
		}
		const target = args.action === "accept" ? "accepted" : "rejected";
		if (submission.status !== target) {
			try {
				transitionSubmission(submission.status, target);
			} catch {
				outcomes.push({ submissionId: submission.id, ok: false, error: `Cannot ${args.action} from ${submission.status}`, status: 409 });
				continue;
			}
		}
		if (args.action === "accept") {
			const confirmed = await db.prepare(`SELECT COUNT(*) AS count FROM submission_speakers WHERE submission_id = ? AND status = 'confirmed'`)
				.bind(submission.id).first<{ count: number }>();
			if ((confirmed?.count ?? 0) === 0) {
				outcomes.push({ submissionId: submission.id, ok: false, error: "Submission has no confirmed speakers", status: 400 });
				continue;
			}
		}
		ready.push(submission.id);
	}
	const apply = args.decide ?? ((submissionId, action, email) => decideSubmission(db, submissionId, action, email));
	for (const submissionId of ready) {
		try {
			const result = await apply(submissionId, args.action, emailChoice);
			if (result.ok) outcomes.push({ submissionId: result.submissionId, ok: true, status: result.status });
			else outcomes.push({ submissionId, ok: false, error: result.error, status: result.status ?? 400 });
		} catch (error) {
			outcomes.push({
				submissionId,
				ok: false,
				error: error instanceof Error && error.message ? error.message : "Unable to apply this decision",
				status: 500,
			});
		}
	}
	return { outcomes, succeeded: outcomes.filter((outcome) => outcome.ok).length, failed: outcomes.filter((outcome) => !outcome.ok).length };
}
