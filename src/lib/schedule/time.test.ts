import { describe, expect, it } from "vitest";
import { deriveScheduleDays } from "./time";

describe("deriveScheduleDays", () => {
	it("uses every configured event date before scheduled content", () => {
		expect(
			deriveScheduleDays({
				startDay: "2026-10-01",
				endDay: "2026-10-03",
				scheduledDays: ["2026-10-09"],
				timeZone: "Asia/Singapore",
			}),
		).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
	});

	it("falls back to scheduled days, then a timezone-local current day", () => {
		expect(
			deriveScheduleDays({
				scheduledDays: ["2026-10-03", "2026-10-01", "2026-10-03"],
				timeZone: "UTC",
			}),
		).toEqual(["2026-10-01", "2026-10-03"]);
		expect(
			deriveScheduleDays({
				timeZone: "UTC",
				now: Date.UTC(2026, 9, 5, 12),
			}),
		).toEqual(["2026-10-05"]);
	});
});
