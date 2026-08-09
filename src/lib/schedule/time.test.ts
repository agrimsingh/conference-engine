import { describe, expect, it } from "vitest";
import { defaultScheduleDayKey, deriveScheduleDays } from "./time";

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

describe("defaultScheduleDayKey", () => {
	const days = ["2026-10-01", "2026-10-02", "2026-10-03"];

	it("returns today when today has scheduled sessions", () => {
		expect(
			defaultScheduleDayKey(days, new Set(["2026-10-02"]), "2026-10-02"),
		).toBe("2026-10-02");
	});

	it("returns the first upcoming day with sessions when today is before the event", () => {
		expect(
			defaultScheduleDayKey(days, new Set(["2026-10-03"]), "2026-09-28"),
		).toBe("2026-10-03");
	});

	it("returns the first event day when today is after the event", () => {
		expect(
			defaultScheduleDayKey(days, new Set(["2026-10-01", "2026-10-03"]), "2026-10-10"),
		).toBe("2026-10-01");
	});

	it("returns a later day with sessions when today has none but a future day does", () => {
		expect(
			defaultScheduleDayKey(days, new Set(["2026-10-03"]), "2026-10-02"),
		).toBe("2026-10-03");
	});

	it("returns the first event day when no day has sessions", () => {
		expect(defaultScheduleDayKey(days, new Set(), "2026-10-02")).toBe("2026-10-01");
	});

	it("returns todayKey when days is empty", () => {
		expect(defaultScheduleDayKey([], new Set(["2026-10-02"]), "2026-10-02")).toBe(
			"2026-10-02",
		);
	});
});
