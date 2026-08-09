import { describe, expect, it } from "vitest";
import {
	decisionTemplateForStatus,
	isDecisionOutcomeStatus,
	isSubmissionQueueTab,
	submissionMatchesQueue,
} from "./submission-queues";

describe("submission queue membership", () => {
	it("keeps pending to undecided live statuses", () => {
		expect(submissionMatchesQueue("submitted", false, "pending")).toBe(true);
		expect(submissionMatchesQueue("under_review", true, "pending")).toBe(true);
		expect(submissionMatchesQueue("accepted", false, "pending")).toBe(false);
	});

	it("splits decide from notify", () => {
		expect(submissionMatchesQueue("accepted", false, "to_notify")).toBe(true);
		expect(submissionMatchesQueue("rejected", false, "to_notify")).toBe(true);
		expect(submissionMatchesQueue("accepted", true, "to_notify")).toBe(false);
		expect(submissionMatchesQueue("accepted", true, "notified")).toBe(true);
		expect(submissionMatchesQueue("scheduled", false, "notified")).toBe(true);
		expect(submissionMatchesQueue("published", false, "notified")).toBe(true);
	});

	it("isolates withdrawn and drafts", () => {
		expect(submissionMatchesQueue("withdrawn", false, "withdrawn")).toBe(true);
		expect(submissionMatchesQueue("draft", false, "drafts")).toBe(true);
		expect(submissionMatchesQueue("submitted", false, "withdrawn")).toBe(false);
	});
});

describe("decision notified derivation helpers", () => {
	it("maps outcome statuses to lifecycle templates", () => {
		expect(isDecisionOutcomeStatus("accepted")).toBe(true);
		expect(isDecisionOutcomeStatus("submitted")).toBe(false);
		expect(decisionTemplateForStatus("accepted")).toBe("acceptance");
		expect(decisionTemplateForStatus("rejected")).toBe("rejection");
		expect(decisionTemplateForStatus("waitlisted")).toBe("waitlist");
		expect(decisionTemplateForStatus("submitted")).toBeNull();
		expect(isSubmissionQueueTab("to_notify")).toBe(true);
		expect(isSubmissionQueueTab("bogus")).toBe(false);
	});
});
