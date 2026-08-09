import type { OutstandingTaskGroup, PendingCoSpeakerItem } from "./outstanding-tasks";

/** Max rows returned per cockpit blocker section; totals may be higher. */
export const COCKPIT_BLOCKER_LIST_LIMIT = 50;

/** Default visible rows per cockpit section before inline expand. */
export const COCKPIT_SECTION_PREVIEW_COUNT = 5;

export function cockpitSectionPreview<T>(
	items: readonly T[],
	expanded: boolean,
): readonly T[] {
	return expanded ? items : items.slice(0, COCKPIT_SECTION_PREVIEW_COUNT);
}

export function cockpitSectionHasMore(
	items: readonly unknown[],
	expanded: boolean,
): boolean {
	return !expanded && items.length > COCKPIT_SECTION_PREVIEW_COUNT;
}

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
	/** Submitted pipeline work with no active evaluation plan. */
	needsReviewActivation: CockpitSubmissionRef[];
	needsReviewActivationTotal: number;
	unassignedReviews: CockpitSubmissionRef[];
	unassignedReviewsTotal: number;
	incompleteReviews: CockpitIncompleteReviewItem[];
	incompleteReviewsTotal: number;
	reviewedUndecided: CockpitSubmissionRef[];
	reviewedUndecidedTotal: number;
	acceptedUnscheduled: CockpitSubmissionRef[];
	acceptedUnscheduledTotal: number;
	scheduledUnpublished: CockpitSubmissionRef[];
	scheduledUnpublishedTotal: number;
	failedDeliveries: CockpitFailedDeliveryItem[];
	failedDeliveriesTotal: number;
};

export type CockpitBlockerKey =
	| "outstandingTasks"
	| "pendingCoSpeakers"
	| "needsReviewActivation"
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
		needsReviewActivation: snapshot.needsReviewActivationTotal,
		unassignedReviews: snapshot.unassignedReviewsTotal,
		incompleteReviews: snapshot.incompleteReviewsTotal,
		reviewedUndecided: snapshot.reviewedUndecidedTotal,
		acceptedUnscheduled: snapshot.acceptedUnscheduledTotal,
		scheduledUnpublished: snapshot.scheduledUnpublishedTotal,
		failedDeliveries: snapshot.failedDeliveriesTotal,
	};
}

/** Human label when a section list is truncated to COCKPIT_BLOCKER_LIST_LIMIT. */
export function cockpitSectionCaption(shown: number, total: number): string | null {
	if (total <= shown) return null;
	return `Showing ${shown} of ${total}`;
}

export function cockpitTotalBlockers(snapshot: CockpitSnapshot): number {
	const counts = cockpitBlockerCounts(snapshot);
	return Object.values(counts).reduce((sum, count) => sum + count, 0);
}
