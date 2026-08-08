import { describe, expect, it } from "vitest";
import { hasPortalEligibility } from "./portal-session";
import type { SubmissionRow } from "@/lib/db/types";

const submitted = { id: "sub", status: "submitted" } as SubmissionRow;

describe("portal eligibility", () => {
	it("allows any owned proposal, including one that is not accepted", () => {
		expect(hasPortalEligibility([submitted])).toBe(true);
		expect(hasPortalEligibility([])).toBe(false);
	});
});
