import { describe, expect, it } from "vitest";
import { validateEventScheduleBounds } from "./date-bounds";

describe("event schedule day bounds", () => {
	const event = { timezone: "Asia/Singapore", start_day: "2026-08-10", end_day: "2026-08-11" };
	it("accepts an interval contained by the event's local dates", () => {
		expect(validateEventScheduleBounds(event, Date.parse("2026-08-10T01:00:00Z"), Date.parse("2026-08-11T08:00:00Z"))).toBeNull();
	});
	it("rejects intervals outside either local boundary", () => {
		expect(validateEventScheduleBounds(event, Date.parse("2026-08-09T15:00:00Z"), Date.parse("2026-08-10T01:00:00Z"))).toMatch(/starts before/i);
		expect(validateEventScheduleBounds(event, Date.parse("2026-08-11T16:00:00Z"), Date.parse("2026-08-11T17:00:00Z"))).toMatch(/ends after/i);
	});
});
