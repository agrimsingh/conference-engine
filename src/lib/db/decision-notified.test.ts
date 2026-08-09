import { describe, expect, it } from "vitest";
import { decisionNotifiedLabel } from "./queries";
import {
	decisionNotifiedSqlExists,
	submissionMatchesQueue,
} from "@/lib/domain";

describe("decision notified derivation", () => {
	it("labels only decision outcomes and schedule past-notify states", () => {
		expect(decisionNotifiedLabel("accepted", false)).toBe("Unnotified");
		expect(decisionNotifiedLabel("accepted", true)).toBe("Notified");
		expect(decisionNotifiedLabel("rejected", true)).toBe("Notified");
		expect(decisionNotifiedLabel("waitlisted", false)).toBe("Unnotified");
		expect(decisionNotifiedLabel("scheduled", false)).toBe("Notified");
		expect(decisionNotifiedLabel("published", true)).toBe("Notified");
		expect(decisionNotifiedLabel("submitted", false)).toBeNull();
		expect(decisionNotifiedLabel("draft", true)).toBeNull();
	});

	it("keeps SQL derivation keyed on status-matched templates", () => {
		const sql = decisionNotifiedSqlExists();
		expect(sql).toContain("email_deliveries");
		expect(sql).toContain("acceptance");
		expect(sql).toContain("rejection");
		expect(sql).toContain("waitlist");
		expect(sql).toContain("provider_accepted");
		expect(submissionMatchesQueue("accepted", false, "to_notify")).toBe(true);
		expect(submissionMatchesQueue("accepted", true, "notified")).toBe(true);
	});
});
