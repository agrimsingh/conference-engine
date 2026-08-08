import { describe, expect, it } from "vitest";
import { shouldFailOneTimeLinkChallenge } from "./email-delivery";

describe("one-time email challenge delivery", () => {
	it("keeps organizer and portal links active when delivery is ambiguous", () => {
		expect(shouldFailOneTimeLinkChallenge({ ok: false, failureKind: "ambiguous" })).toBe(false);
	});

	it("fails organizer, portal, and event-invite links only after a confirmed rejection", () => {
		expect(shouldFailOneTimeLinkChallenge({ ok: false, failureKind: "confirmed" })).toBe(true);
		expect(shouldFailOneTimeLinkChallenge({ ok: true })).toBe(false);
	});
});
