import {
	COCKPIT_BLOCKER_LIST_LIMIT,
	titleFromAnswers,
	type CockpitFailedDeliveryItem,
	type CockpitIncompleteReviewItem,
	type CockpitSnapshot,
	type CockpitSubmissionRef,
} from "@/lib/domain";
import {
	getActiveEvaluationPlan,
	listAcceptedUnscheduledSubmissions,
	listIncompleteAssignedReviews,
	listNeedsReviewActivationSubmissions,
	listReviewedUndecidedSubmissions,
	listScheduledUnpublishedSubmissions,
	listUnassignedReviewSubmissions,
	type CockpitIncompleteReviewSqlRow,
	type CockpitSubmissionSqlRow,
} from "@/lib/db/queries";
import type { EventRow } from "@/lib/db/types";
import { countFailedEventDeliveries, listFailedEventDeliveries } from "@/lib/email/communications";
import { listPlanReviewers } from "@/lib/evaluation/reviewers";
import { loadOutstandingTasksSnapshot } from "@/lib/tasks/outstanding";

function parseAnswers(raw: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		// ignore
	}
	return {};
}

function toSubmissionRef(row: CockpitSubmissionSqlRow): CockpitSubmissionRef {
	return {
		submissionId: row.id,
		title: titleFromAnswers(parseAnswers(row.answers_json)),
		status: row.status,
		submitter: row.submitter_name ?? row.submitter_email ?? "Unknown submitter",
	};
}

function toIncompleteReview(row: CockpitIncompleteReviewSqlRow): CockpitIncompleteReviewItem {
	return {
		...toSubmissionRef(row),
		assignmentId: row.assignment_id,
		reviewerId: row.reviewer_id,
		reviewerName: row.reviewer_name,
	};
}

function toFailedDelivery(
	row: Awaited<ReturnType<typeof listFailedEventDeliveries>>[number],
): CockpitFailedDeliveryItem {
	return {
		deliveryKey: row.delivery_key,
		templateKey: row.template_key,
		toEmail: row.to_email,
		error: row.error,
		attemptCount: row.attempt_count,
		updatedAt: row.updated_at,
		replayable: row.replayable === 1,
	};
}

export async function loadCockpitSnapshot(
	db: D1Database,
	event: EventRow,
): Promise<CockpitSnapshot> {
	const [outstanding, plan] = await Promise.all([
		loadOutstandingTasksSnapshot(db, event),
		getActiveEvaluationPlan(db, event.id),
	]);

	const [
		needsActivation,
		unassigned,
		incomplete,
		undecided,
		accepted,
		scheduled,
		failedRows,
		failedTotal,
		reviewers,
	] = await Promise.all([
		plan
			? Promise.resolve({ rows: [] as CockpitSubmissionSqlRow[], total: 0 })
			: listNeedsReviewActivationSubmissions(db, event.id, COCKPIT_BLOCKER_LIST_LIMIT),
		plan
			? listUnassignedReviewSubmissions(db, event.id, plan.id, COCKPIT_BLOCKER_LIST_LIMIT)
			: Promise.resolve({ rows: [] as CockpitSubmissionSqlRow[], total: 0 }),
		plan
			? listIncompleteAssignedReviews(db, event.id, plan.id, COCKPIT_BLOCKER_LIST_LIMIT)
			: Promise.resolve({ rows: [] as CockpitIncompleteReviewSqlRow[], total: 0 }),
		plan
			? listReviewedUndecidedSubmissions(db, event.id, plan.id, COCKPIT_BLOCKER_LIST_LIMIT)
			: Promise.resolve({ rows: [] as CockpitSubmissionSqlRow[], total: 0 }),
		listAcceptedUnscheduledSubmissions(db, event.id, COCKPIT_BLOCKER_LIST_LIMIT),
		listScheduledUnpublishedSubmissions(db, event.id, COCKPIT_BLOCKER_LIST_LIMIT),
		listFailedEventDeliveries(db, event.id, COCKPIT_BLOCKER_LIST_LIMIT),
		countFailedEventDeliveries(db, event.id),
		plan ? listPlanReviewers(db, plan.id) : Promise.resolve([]),
	]);

	return {
		eventId: event.id,
		eventSlug: event.slug,
		fetchedAt: Date.now(),
		activePlanId: plan?.id ?? null,
		reviewers: reviewers
			.filter((reviewer) => reviewer.revoked_at === null)
			.map((reviewer) => ({ id: reviewer.id, name: reviewer.name })),
		outstandingTasks: {
			incompleteCount: outstanding.incompleteCount,
			groups: outstanding.groups,
		},
		pendingCoSpeakers: outstanding.pendingCoSpeakers,
		pendingSlotAcks: outstanding.pendingSlotAcks,
		needsReviewActivation: needsActivation.rows.map(toSubmissionRef),
		needsReviewActivationTotal: needsActivation.total,
		unassignedReviews: unassigned.rows.map(toSubmissionRef),
		unassignedReviewsTotal: unassigned.total,
		incompleteReviews: incomplete.rows.map(toIncompleteReview),
		incompleteReviewsTotal: incomplete.total,
		reviewedUndecided: undecided.rows.map(toSubmissionRef),
		reviewedUndecidedTotal: undecided.total,
		acceptedUnscheduled: accepted.rows.map(toSubmissionRef),
		acceptedUnscheduledTotal: accepted.total,
		scheduledUnpublished: scheduled.rows.map(toSubmissionRef),
		scheduledUnpublishedTotal: scheduled.total,
		failedDeliveries: failedRows.map(toFailedDelivery),
		failedDeliveriesTotal: failedTotal,
	};
}
