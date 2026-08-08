import { describe, expect, it } from "vitest";
import { hasPendingInvitationAcceptance } from "./invite-member";

describe("invitation acceptance status", () => {
	it("does not advertise a terminal delivery failure as pending", () => {
		expect(hasPendingInvitationAcceptance("sent")).toBe(true);
		expect(hasPendingInvitationAcceptance("uncertain")).toBe(true);
		expect(hasPendingInvitationAcceptance("failed")).toBe(false);
	});
});
