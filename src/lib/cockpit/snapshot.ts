import {
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
	listReviewedUndecidedSubmissions,
	listScheduledUnpublishedSubmissions,
	listUnassignedReviewSubmissions,
	type CockpitIncompleteReviewSqlRow,
	type CockpitSubmissionSqlRow,
} from "@/lib/db/queries";
import type { EventRow } from "@/lib/db/types";
import { listFailedEventDeliveries } from "@/lib/email/communications";
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
		unassignedRows,
		incompleteRows,
		undecidedRows,
		acceptedRows,
		scheduledRows,
		failedRows,
		reviewers,
	] = await Promise.all([
		plan
			? listUnassignedReviewSubmissions(db, event.id, plan.id)
			: Promise.resolve([] as CockpitSubmissionSqlRow[]),
		plan
			? listIncompleteAssignedReviews(db, event.id, plan.id)
			: Promise.resolve([] as CockpitIncompleteReviewSqlRow[]),
		plan
			? listReviewedUndecidedSubmissions(db, event.id, plan.id)
			: Promise.resolve([] as CockpitSubmissionSqlRow[]),
		listAcceptedUnscheduledSubmissions(db, event.id),
		listScheduledUnpublishedSubmissions(db, event.id),
		listFailedEventDeliveries(db, event.id),
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
		unassignedReviews: unassignedRows.map(toSubmissionRef),
		incompleteReviews: incompleteRows.map(toIncompleteReview),
		reviewedUndecided: undecidedRows.map(toSubmissionRef),
		acceptedUnscheduled: acceptedRows.map(toSubmissionRef),
		scheduledUnpublished: scheduledRows.map(toSubmissionRef),
		failedDeliveries: failedRows.map(toFailedDelivery),
	};
}
