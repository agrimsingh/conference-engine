import { describe, expect, it } from "vitest";
import {
	cockpitBlockerCounts,
	cockpitSectionCaption,
	cockpitTotalBlockers,
	type CockpitSnapshot,
} from "./cockpit";
import { shouldRefetchOnInvalidate } from "./outstanding-tasks";

function emptySnapshot(overrides: Partial<CockpitSnapshot> = {}): CockpitSnapshot {
	return {
		eventId: "evt",
		eventSlug: "evt",
		fetchedAt: 0,
		activePlanId: null,
		reviewers: [],
		outstandingTasks: { incompleteCount: 0, groups: [] },
		pendingCoSpeakers: [],
		needsReviewActivation: [],
		needsReviewActivationTotal: 0,
		unassignedReviews: [],
		unassignedReviewsTotal: 0,
		incompleteReviews: [],
		incompleteReviewsTotal: 0,
		reviewedUndecided: [],
		reviewedUndecidedTotal: 0,
		acceptedUnscheduled: [],
		acceptedUnscheduledTotal: 0,
		scheduledUnpublished: [],
		scheduledUnpublishedTotal: 0,
		failedDeliveries: [],
		failedDeliveriesTotal: 0,
		...overrides,
	};
}

describe("cockpitBlockerCounts", () => {
	it("sums each blocker list", () => {
		const snapshot = emptySnapshot({
			outstandingTasks: {
				incompleteCount: 2,
				groups: [],
			},
			needsReviewActivationTotal: 3,
			unassignedReviewsTotal: 1,
			pendingCoSpeakers: [
				{
					speakerId: "s1",
					name: "A",
					email: "a@test.invalid",
					submissionId: "sub",
					submissionTitle: "Talk",
					submissionStatus: "accepted",
					addedAfterAcceptance: false,
					invitedAt: null,
				},
			],
			unassignedReviews: [
				{ submissionId: "u1", title: "U", status: "submitted", submitter: "x" },
			],
			failedDeliveries: [
				{
					deliveryKey: "d1",
					templateKey: "task_reminder",
					toEmail: "a@test.invalid",
					error: "boom",
					attemptCount: 1,
					updatedAt: 1,
					replayable: true,
				},
			],
			failedDeliveriesTotal: 1,
		});
		expect(cockpitBlockerCounts(snapshot)).toMatchObject({
			outstandingTasks: 2,
			needsReviewActivation: 3,
			pendingCoSpeakers: 1,
			unassignedReviews: 1,
			failedDeliveries: 1,
		});
		expect(cockpitTotalBlockers(snapshot)).toBe(8);
	});
});

describe("cockpitSectionCaption", () => {
	it("returns null when the full list is shown", () => {
		expect(cockpitSectionCaption(5, 5)).toBeNull();
	});

	it("describes truncated lists", () => {
		expect(cockpitSectionCaption(50, 120)).toBe("Showing 50 of 120");
	});
});

describe("shouldRefetchOnInvalidate", () => {
	it("refetches review and email prefixes for the cockpit", () => {
		expect(shouldRefetchOnInvalidate("review.assignments")).toBe(true);
		expect(shouldRefetchOnInvalidate("review.score")).toBe(true);
		expect(shouldRefetchOnInvalidate("email.retry")).toBe(true);
		expect(shouldRefetchOnInvalidate("email.reminders")).toBe(true);
		expect(shouldRefetchOnInvalidate("tasks.decide")).toBe(true);
		expect(shouldRefetchOnInvalidate("schedule.publish")).toBe(true);
		expect(shouldRefetchOnInvalidate("sessions.create")).toBe(false);
		expect(shouldRefetchOnInvalidate("configuration.room")).toBe(false);
	});
});
