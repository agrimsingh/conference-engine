import { describe, expect, it } from "vitest";
import {
	canTransitionSubmission,
	transitionSubmission,
	WITHDRAWN_RESTORE_STATUS,
} from "@/lib/domain";

describe("withdraw transition", () => {
	it("allows speaker-initiated withdraw from live and placed statuses", () => {
		for (const from of [
			"draft",
			"submitted",
			"under_review",
			"accepted",
			"scheduled",
			"published",
		] as const) {
			expect(canTransitionSubmission(from, "withdrawn")).toBe(true);
			expect(transitionSubmission(from, "withdrawn")).toBe("withdrawn");
		}
	});

	it("blocks withdraw from terminal non-withdrawable statuses", () => {
		for (const from of ["rejected", "waitlisted", "withdrawn"] as const) {
			expect(canTransitionSubmission(from, "withdrawn")).toBe(false);
		}
	});

	it("allows organizer restore from withdrawn to under_review only", () => {
		expect(WITHDRAWN_RESTORE_STATUS).toBe("under_review");
		expect(canTransitionSubmission("withdrawn", WITHDRAWN_RESTORE_STATUS)).toBe(true);
		expect(transitionSubmission("withdrawn", WITHDRAWN_RESTORE_STATUS)).toBe(
			"under_review",
		);
		expect(canTransitionSubmission("withdrawn", "submitted")).toBe(false);
		expect(canTransitionSubmission("withdrawn", "accepted")).toBe(false);
	});
});
