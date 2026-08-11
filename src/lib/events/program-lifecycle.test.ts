import { describe, expect, it } from "vitest";
import {
	programLifecycle,
	programLifecycleCurrent,
	type ProgramLifecycleInput,
} from "./program-lifecycle";

function input(overrides: Partial<ProgramLifecycleInput> = {}): ProgramLifecycleInput {
	return {
		eventSlug: "sample",
		roomsCount: 0,
		tracksCount: 0,
		formsReady: false,
		cfpOpen: false,
		submittedCount: 0,
		reviewPlanReady: false,
		needsReviewActivation: 0,
		unassignedReviews: 0,
		incompleteReviews: 0,
		reviewedUndecided: 0,
		toNotifyRemaining: 0,
		pendingReviewCount: 0,
		acceptedCount: 0,
		outstandingSpeakerTasks: 0,
		acceptedUnscheduled: 0,
		scheduledUnpublished: 0,
		publishedCount: 0,
		...overrides,
	};
}

function statuses(snapshot: ProgramLifecycleInput) {
	return programLifecycle(snapshot).map((step) => [step.key, step.status] as const);
}

describe("programLifecycle", () => {
	it("marks the first incomplete step current and later steps blocked", () => {
		const steps = programLifecycle(input());
		expect(statuses(input())).toEqual([
			["library", "current"],
			["open_cfp", "blocked"],
			["evaluation", "blocked"],
			["finalize_notify", "blocked"],
			["speaker_onboarding", "blocked"],
			["prepare_agenda", "blocked"],
			["publish", "blocked"],
		]);
		expect(programLifecycleCurrent(steps)?.key).toBe("library");
		expect(steps[0]?.cta).toBe("Configure library");
		expect(steps[0]?.href).toBe("/admin/events/sample/setup");
	});

	it("advances strictly: completed before current, blocked after", () => {
		expect(
			statuses(
				input({
					roomsCount: 2,
					tracksCount: 1,
					formsReady: true,
					cfpOpen: true,
				}),
			),
		).toEqual([
			["library", "completed"],
			["open_cfp", "completed"],
			["evaluation", "current"],
			["finalize_notify", "blocked"],
			["speaker_onboarding", "blocked"],
			["prepare_agenda", "blocked"],
			["publish", "blocked"],
		]);
	});

	it("keeps open_cfp complete after collection even when the form closes", () => {
		expect(
			statuses(
				input({
					roomsCount: 1,
					tracksCount: 1,
					formsReady: true,
					cfpOpen: false,
					submittedCount: 3,
					reviewPlanReady: true,
				}),
			)[1],
		).toEqual(["open_cfp", "completed"]);
	});

	it("requires submissions and a clear review pipeline before evaluation completes", () => {
		const withPlanOnly = input({
			roomsCount: 1,
			tracksCount: 1,
			formsReady: true,
			cfpOpen: true,
			reviewPlanReady: true,
			submittedCount: 0,
		});
		expect(programLifecycleCurrent(programLifecycle(withPlanOnly))?.key).toBe("evaluation");

		const blockedByAssignments = input({
			roomsCount: 1,
			tracksCount: 1,
			formsReady: true,
			cfpOpen: true,
			submittedCount: 4,
			reviewPlanReady: true,
			unassignedReviews: 2,
			incompleteReviews: 1,
		});
		expect(programLifecycleCurrent(programLifecycle(blockedByAssignments))?.key).toBe(
			"evaluation",
		);
	});

	it("makes finalize current when reviews are done but notify remains", () => {
		const steps = programLifecycle(
			input({
				roomsCount: 1,
				tracksCount: 1,
				formsReady: true,
				cfpOpen: false,
				submittedCount: 5,
				reviewPlanReady: true,
				pendingReviewCount: 0,
				reviewedUndecided: 1,
				toNotifyRemaining: 2,
				acceptedCount: 2,
			}),
		);
		expect(programLifecycleCurrent(steps)?.key).toBe("finalize_notify");
		expect(steps.find((step) => step.key === "finalize_notify")).toMatchObject({
			status: "current",
			cta: "Review and notify",
			href: "/admin/events/sample/submissions?queue=to_notify",
		});
		expect(steps.find((step) => step.key === "speaker_onboarding")?.status).toBe("blocked");
	});

	it("sequences onboarding → agenda → publish from remaining counts", () => {
		const baseDone = {
			roomsCount: 1,
			tracksCount: 1,
			formsReady: true,
			cfpOpen: false,
			submittedCount: 5,
			reviewPlanReady: true,
			pendingReviewCount: 0,
			reviewedUndecided: 0,
			toNotifyRemaining: 0,
			acceptedCount: 3,
		} as const;

		expect(
			programLifecycleCurrent(
				programLifecycle(
					input({
						...baseDone,
						outstandingSpeakerTasks: 4,
						acceptedUnscheduled: 2,
						scheduledUnpublished: 1,
					}),
				),
			)?.key,
		).toBe("speaker_onboarding");

		expect(
			programLifecycleCurrent(
				programLifecycle(
					input({
						...baseDone,
						outstandingSpeakerTasks: 0,
						acceptedUnscheduled: 2,
						scheduledUnpublished: 1,
					}),
				),
			)?.key,
		).toBe("prepare_agenda");

		expect(
			programLifecycleCurrent(
				programLifecycle(
					input({
						...baseDone,
						outstandingSpeakerTasks: 0,
						acceptedUnscheduled: 0,
						scheduledUnpublished: 2,
						publishedCount: 1,
					}),
				),
			)?.key,
		).toBe("publish");
	});

	it("marks every step completed when the program is live", () => {
		const steps = programLifecycle(
			input({
				roomsCount: 2,
				tracksCount: 3,
				formsReady: true,
				cfpOpen: false,
				submittedCount: 10,
				reviewPlanReady: true,
				pendingReviewCount: 0,
				reviewedUndecided: 0,
				toNotifyRemaining: 0,
				acceptedCount: 6,
				outstandingSpeakerTasks: 0,
				acceptedUnscheduled: 0,
				scheduledUnpublished: 0,
				publishedCount: 6,
			}),
		);
		expect(steps.every((step) => step.status === "completed")).toBe(true);
		expect(programLifecycleCurrent(steps)).toBeNull();
	});

	it("describes remaining publish work as unpublished, not agenda-private", () => {
		const steps = programLifecycle(
			input({
				roomsCount: 1,
				tracksCount: 1,
				formsReady: true,
				cfpOpen: true,
				submittedCount: 2,
				reviewPlanReady: true,
				pendingReviewCount: 0,
				reviewedUndecided: 0,
				toNotifyRemaining: 0,
				acceptedCount: 2,
				outstandingSpeakerTasks: 0,
				acceptedUnscheduled: 0,
				scheduledUnpublished: 2,
				publishedCount: 0,
			}),
		);
		const publish = steps.find((step) => step.key === "publish");
		expect(publish?.status).toBe("current");
		expect(publish?.detail).toBe("2 scheduled sessions still unpublished — publish when ready.");
		expect(publish?.detail).not.toMatch(/private/);
	});

	it("does not peek: later steps stay blocked even when their predicates are already true", () => {
		const steps = programLifecycle(
			input({
				roomsCount: 0,
				tracksCount: 0,
				formsReady: false,
				acceptedCount: 0,
				outstandingSpeakerTasks: 0,
				acceptedUnscheduled: 0,
				scheduledUnpublished: 0,
			}),
		);
		expect(steps.slice(1).every((step) => step.status === "blocked")).toBe(true);
	});
});
