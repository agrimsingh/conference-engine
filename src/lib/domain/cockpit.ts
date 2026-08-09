import type { OutstandingTaskGroup, PendingCoSpeakerItem } from "./outstanding-tasks";

export type CockpitSubmissionRef = {
	submissionId: string;
	title: string;
	status: string;
	submitter: string;
};

export type CockpitIncompleteReviewItem = CockpitSubmissionRef & {
	assignmentId: string;
	reviewerId: string;
	reviewerName: string;
};

export type CockpitFailedDeliveryItem = {
	deliveryKey: string;
	templateKey: string;
	toEmail: string;
	error: string | null;
	attemptCount: number;
	updatedAt: number;
	replayable: boolean;
};

export type CockpitReviewerOption = {
	id: string;
	name: string;
};

/**
 * Program cockpit: one typed snapshot of every pipeline blocker the
 * organizer can act on from the dashboard.
 */
export type CockpitSnapshot = {
	eventId: string;
	eventSlug: string;
	fetchedAt: number;
	activePlanId: string | null;
	reviewers: CockpitReviewerOption[];
	outstandingTasks: {
		incompleteCount: number;
		groups: OutstandingTaskGroup[];
	};
	pendingCoSpeakers: PendingCoSpeakerItem[];
	unassignedReviews: CockpitSubmissionRef[];
	incompleteReviews: CockpitIncompleteReviewItem[];
	reviewedUndecided: CockpitSubmissionRef[];
	acceptedUnscheduled: CockpitSubmissionRef[];
	scheduledUnpublished: CockpitSubmissionRef[];
	failedDeliveries: CockpitFailedDeliveryItem[];
};

export type CockpitBlockerKey =
	| "outstandingTasks"
	| "pendingCoSpeakers"
	| "unassignedReviews"
	| "incompleteReviews"
	| "reviewedUndecided"
	| "acceptedUnscheduled"
	| "scheduledUnpublished"
	| "failedDeliveries";

export function cockpitBlockerCounts(snapshot: CockpitSnapshot): Record<CockpitBlockerKey, number> {
	return {
		outstandingTasks: snapshot.outstandingTasks.incompleteCount,
		pendingCoSpeakers: snapshot.pendingCoSpeakers.length,
		unassignedReviews: snapshot.unassignedReviews.length,
		incompleteReviews: snapshot.incompleteReviews.length,
		reviewedUndecided: snapshot.reviewedUndecided.length,
		acceptedUnscheduled: snapshot.acceptedUnscheduled.length,
		scheduledUnpublished: snapshot.scheduledUnpublished.length,
		failedDeliveries: snapshot.failedDeliveries.length,
	};
}

export function cockpitTotalBlockers(snapshot: CockpitSnapshot): number {
	const counts = cockpitBlockerCounts(snapshot);
	return Object.values(counts).reduce((sum, count) => sum + count, 0);
}
