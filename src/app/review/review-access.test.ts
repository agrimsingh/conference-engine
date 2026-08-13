import { describe, expect, it } from "vitest";
import { canUseReviewDecisionControls } from "./review-access";

describe("canUseReviewDecisionControls", () => {
	it("denies decision controls when a reviewer token is accompanied by an organizer bypass", () => {
		// Given
		const identity = { mode: "reviewer" as const };

		// When
		const canDecide = canUseReviewDecisionControls(identity, true);

		// Then
		expect(canDecide).toBe(false);
	});

	it("permits decision controls only for an organizer using a committee identity", () => {
		// Given
		const identity = { mode: "committee" as const };

		// When
		const canDecide = canUseReviewDecisionControls(identity, true);

		// Then
		expect(canDecide).toBe(true);
	});
});
