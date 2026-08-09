import { describe, expect, it } from "vitest";
import { MAX_EVENT_DURATION_DAYS, validateEventSettings } from "./settings";

describe("event settings validation", () => {
	it("rejects impossible dates, reversed dates, excessive ranges, and invalid timezones", () => {
		expect(validateEventSettings({ startDay: "2026-02-30", endDay: "2026-03-01" }).ok).toBe(false);
		expect(validateEventSettings({ startDay: "2026-03-02", endDay: "2026-03-01" }).ok).toBe(false);
		expect(validateEventSettings({ startDay: "2026-01-01", endDay: "2026-02-01" }).ok).toBe(false);
		expect(validateEventSettings({ startDay: "2026-03-01", endDay: "2026-03-01", timezone: "Mars/Olympus" }).ok).toBe(false);
	});

	it("accepts a valid bounded event", () => {
		expect(MAX_EVENT_DURATION_DAYS).toBeGreaterThan(1);
		expect(validateEventSettings({ startDay: "2026-03-01", endDay: "2026-03-03", timezone: "Asia/Singapore" })).toEqual({ ok: true });
	});

	it("requires valid schedule minute bounds and supported slot durations", () => {
		expect(validateEventSettings({ startDay: "2026-03-01", endDay: "2026-03-01", dayStartMinutes: 1080, dayEndMinutes: 540 }).ok).toBe(false);
		expect(validateEventSettings({ startDay: "2026-03-01", endDay: "2026-03-01", dayStartMinutes: 540, dayEndMinutes: 1080, slotDurationMinutes: 17 }).ok).toBe(false);
		expect(validateEventSettings({ startDay: "2026-03-01", endDay: "2026-03-01", dayStartMinutes: 540, dayEndMinutes: 1080, slotDurationMinutes: 30 })).toEqual({ ok: true });
	});
});
