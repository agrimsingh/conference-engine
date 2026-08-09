import { describe, expect, it } from "vitest";
import { activationReviewPath } from "./activation-result";

describe("activationReviewPath", () => {
	it("preserves the one-time committee path only from a successful activation payload", () => {
		expect(activationReviewPath({ ok: true, plan: { reviewPath: "/review?token=one-time-token" } })).toEqual({
			reviewPath: "/review?token=one-time-token",
			message: "Copy this committee review link now. It is shown only after activation and cannot be recovered from this workspace.",
		});
	});

	it("does not invent a recoverable link for later existing-plan responses", () => {
		expect(activationReviewPath({ ok: true, plan: { id: "active-plan", status: "active" } })).toBeNull();
	});
});
