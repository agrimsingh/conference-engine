import {
	DECISION_REGISTRY,
	decisionTemplateForStatus,
	isDecisionAction,
	isDecisionOutcomeStatus,
	type DecisionAction,
	type DecisionEmailChoice,
	type DecisionTemplateKey,
} from "@/lib/domain";
import { getSubmissionById } from "@/lib/db/queries";
import { decideSubmission, type DecideResult } from "./decide";

export type NotifyDecidedOutcome =
	| { submissionId: string; ok: true; status: string }
	| { submissionId: string; ok: false; error: string; status: number };

/**
 * Sends decision email for already-decided submissions without changing status.
 * Reuses decideSubmission with the matching action + email choice.
 */
export async function notifyDecidedSubmissions(
	db: D1Database,
	args: {
		eventId: string;
		submissionIds: string[];
		email: Extract<DecisionEmailChoice, { send: true }>;
		decide?: (
			submissionId: string,
			action: DecisionAction,
			email: DecisionEmailChoice,
		) => Promise<DecideResult>;
	},
): Promise<{ outcomes: NotifyDecidedOutcome[]; succeeded: number; failed: number }> {
	const submissionIds = [...new Set(args.submissionIds.map((id) => id.trim()).filter(Boolean))];
	if (!submissionIds.length || submissionIds.length !== args.submissionIds.length) {
		return {
			outcomes: [
				{
					submissionId: "unknown",
					ok: false,
					error: "Select unique decided submissions to notify",
					status: 400,
				},
			],
			succeeded: 0,
			failed: 1,
		};
	}

	const apply =
		args.decide ??
		((submissionId, action, email) => decideSubmission(db, submissionId, action, email));
	const outcomes: NotifyDecidedOutcome[] = [];

	for (const submissionId of submissionIds) {
		const submission = await getSubmissionById(db, submissionId);
		if (!submission || submission.event_id !== args.eventId) {
			outcomes.push({
				submissionId,
				ok: false,
				error: "Submission not found",
				status: 404,
			});
			continue;
		}
		if (!isDecisionOutcomeStatus(submission.status)) {
			outcomes.push({
				submissionId,
				ok: false,
				error: `Cannot notify from ${submission.status}`,
				status: 409,
			});
			continue;
		}
		const templateKey = decisionTemplateForStatus(submission.status);
		const action = actionForTemplate(templateKey);
		if (!action || !templateKey) {
			outcomes.push({
				submissionId,
				ok: false,
				error: "No decision template for this status",
				status: 409,
			});
			continue;
		}
		try {
			const result = await apply(submissionId, action, args.email);
			if (result.ok) {
				outcomes.push({
					submissionId: result.submissionId,
					ok: true,
					status: result.status,
				});
			} else {
				outcomes.push({
					submissionId,
					ok: false,
					error: result.error,
					status: result.status ?? 400,
				});
			}
		} catch (error) {
			outcomes.push({
				submissionId,
				ok: false,
				error:
					error instanceof Error && error.message
						? error.message
						: "Unable to notify this submission",
				status: 500,
			});
		}
	}

	return {
		outcomes,
		succeeded: outcomes.filter((outcome) => outcome.ok).length,
		failed: outcomes.filter((outcome) => !outcome.ok).length,
	};
}

function actionForTemplate(
	templateKey: DecisionTemplateKey | null,
): DecisionAction | null {
	if (!templateKey) return null;
	const entry = Object.values(DECISION_REGISTRY).find(
		(meta) => meta.templateKey === templateKey,
	);
	return entry && isDecisionAction(entry.action) ? entry.action : null;
}
