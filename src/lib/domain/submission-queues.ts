import type { DecisionTemplateKey } from "./decisions";
import type { SubmissionStatus } from "./submission-status";

/**
 * Organizer status queues. Staging a decision is separate from notifying the
 * submitter; "to_notify" is decided but still missing a durable decision email.
 */
export const SUBMISSION_QUEUE_TABS = [
	"pending",
	"to_notify",
	"notified",
	"withdrawn",
	"drafts",
	"all",
] as const;

export type SubmissionQueueTab = (typeof SUBMISSION_QUEUE_TABS)[number];

export const DECISION_OUTCOME_STATUSES = [
	"accepted",
	"rejected",
	"waitlisted",
] as const;

export type DecisionOutcomeStatus = (typeof DECISION_OUTCOME_STATUSES)[number];

export const DECISION_TEMPLATE_BY_STATUS: Record<
	DecisionOutcomeStatus,
	DecisionTemplateKey
> = {
	accepted: "acceptance",
	rejected: "rejection",
	waitlisted: "waitlist",
};

/** Delivery states that mean the organizer successfully notified. */
export const NOTIFIED_DELIVERY_STATUSES = ["sent", "provider_accepted"] as const;

export function isSubmissionQueueTab(value: string): value is SubmissionQueueTab {
	return (SUBMISSION_QUEUE_TABS as readonly string[]).includes(value);
}

export function isDecisionOutcomeStatus(
	status: string,
): status is DecisionOutcomeStatus {
	return (DECISION_OUTCOME_STATUSES as readonly string[]).includes(status);
}

export function decisionTemplateForStatus(
	status: string,
): DecisionTemplateKey | null {
	if (!isDecisionOutcomeStatus(status)) return null;
	return DECISION_TEMPLATE_BY_STATUS[status];
}

export type BulkNotifyTemplateSelection =
	| { kind: "uniform"; templateKey: DecisionTemplateKey }
	| { kind: "mixed" }
	| { kind: "none" };

export function bulkNotifyTemplateSelection(
	statuses: readonly string[],
): BulkNotifyTemplateSelection {
	const keys = new Set<DecisionTemplateKey>();
	for (const status of statuses) {
		const key = decisionTemplateForStatus(status);
		if (!key) return { kind: "none" };
		keys.add(key);
	}
	if (keys.size === 0) return { kind: "none" };
	if (keys.size > 1) return { kind: "mixed" };
	const templateKey = keys.values().next().value;
	if (!templateKey) return { kind: "none" };
	return { kind: "uniform", templateKey };
}

/**
 * Pure membership for a queue tab given status + derived notified flag.
 * scheduled/published count as Notified (past the notify stage).
 */
export function submissionMatchesQueue(
	status: SubmissionStatus,
	decisionNotified: boolean,
	queue: SubmissionQueueTab,
): boolean {
	switch (queue) {
		case "all":
			return true;
		case "pending":
			return status === "submitted" || status === "under_review";
		case "to_notify":
			return isDecisionOutcomeStatus(status) && !decisionNotified;
		case "notified":
			return (
				status === "scheduled" ||
				status === "published" ||
				(isDecisionOutcomeStatus(status) && decisionNotified)
			);
		case "withdrawn":
			return status === "withdrawn";
		case "drafts":
			return status === "draft";
		default: {
			const _exhaustive: never = queue;
			return _exhaustive;
		}
	}
}

export const SUBMISSION_QUEUE_LABELS: Record<SubmissionQueueTab, string> = {
	pending: "Pending review",
	to_notify: "To notify",
	notified: "Notified",
	withdrawn: "Withdrawn",
	drafts: "Drafts",
	all: "All",
};

export const SUBMISSION_QUEUE_COACHING: Partial<
	Record<SubmissionQueueTab, string>
> = {
	pending: "Accept or decline here. Speakers are not emailed until you notify.",
	to_notify:
		"These speakers have not been informed yet. Review the message, then send.",
};

/**
 * SQL predicate for decision-email presence. Callers bind nothing; it reads
 * `s.status` / `s.id` from the surrounding submissions alias.
 */
export function decisionNotifiedSqlExists(): string {
	return `EXISTS (
		SELECT 1 FROM email_deliveries d
		WHERE d.submission_id = s.id
		  AND (
		    (s.status = 'accepted' AND d.template_key = 'acceptance')
		    OR (s.status = 'rejected' AND d.template_key = 'rejection')
		    OR (s.status = 'waitlisted' AND d.template_key = 'waitlist')
		  )
		  AND d.status IN ('sent', 'provider_accepted')
	)`;
}

/** Queue filter clause for admin list queries (alias `s`). */
export function adminQueueSql(queue: SubmissionQueueTab): string | null {
	switch (queue) {
		case "all":
			return null;
		case "pending":
			return `s.status IN ('submitted', 'under_review')`;
		case "to_notify":
			return `s.status IN ('accepted', 'rejected', 'waitlisted') AND NOT ${decisionNotifiedSqlExists()}`;
		case "notified":
			return `(
				s.status IN ('scheduled', 'published')
				OR (s.status IN ('accepted', 'rejected', 'waitlisted') AND ${decisionNotifiedSqlExists()})
			)`;
		case "withdrawn":
			return `s.status = 'withdrawn'`;
		case "drafts":
			return `s.status = 'draft'`;
		default: {
			const _exhaustive: never = queue;
			return _exhaustive;
		}
	}
}
