import { describe, expect, it } from "vitest";
import { canTransitionSubmission, transitionSubmission } from "@/lib/domain";

describe("withdraw transition", () => {
	it("allows speaker-initiated withdraw from live pre-schedule statuses", () => {
		for (const from of ["draft", "submitted", "under_review", "accepted"] as const) {
			expect(canTransitionSubmission(from, "withdrawn")).toBe(true);
			expect(transitionSubmission(from, "withdrawn")).toBe("withdrawn");
		}
	});

	it("blocks withdraw from terminal or post-schedule statuses", () => {
		for (const from of [
			"rejected",
			"waitlisted",
			"scheduled",
			"published",
			"withdrawn",
		] as const) {
			expect(canTransitionSubmission(from, "withdrawn")).toBe(false);
		}
	});
});
