import { describe, expect, it } from "vitest";
import { validateEventScheduleBounds } from "./date-bounds";

describe("event schedule day bounds", () => {
	const event = { timezone: "Asia/Singapore", start_day: "2026-08-10", end_day: "2026-08-11" };
	it("accepts an interval contained by the event's local dates", () => {
		expect(validateEventScheduleBounds(event, Date.parse("2026-08-10T01:00:00Z"), Date.parse("2026-08-10T08:00:00Z"))).toBeNull();
	});
	it("rejects intervals outside either local boundary", () => {
		expect(validateEventScheduleBounds(event, Date.parse("2026-08-09T15:00:00Z"), Date.parse("2026-08-10T01:00:00Z"))).toMatch(/starts before/i);
		expect(validateEventScheduleBounds(event, Date.parse("2026-08-11T16:00:00Z"), Date.parse("2026-08-11T17:00:00Z"))).toMatch(/ends after/i);
	});
	it("honors configured daily hours and slot boundaries", () => {
		const configured = { ...event, day_start_minutes: 10 * 60, day_end_minutes: 16 * 60, slot_duration_minutes: 45 };
		expect(validateEventScheduleBounds(configured, Date.parse("2026-08-10T02:00:00Z"), Date.parse("2026-08-10T03:00:00Z"))).toBeNull();
		expect(validateEventScheduleBounds(configured, Date.parse("2026-08-10T02:15:00Z"), Date.parse("2026-08-10T03:00:00Z"))).toMatch(/slot boundary/i);
		expect(validateEventScheduleBounds(configured, Date.parse("2026-08-10T07:30:00Z"), Date.parse("2026-08-10T08:30:00Z"))).toMatch(/daily schedule/i);
	});
	it("rejects seconds and milliseconds even when the wall minute is a configured boundary", () => {
		const configured = { ...event, day_start_minutes: 10 * 60, day_end_minutes: 16 * 60, slot_duration_minutes: 30 };
		expect(validateEventScheduleBounds(configured, Date.parse("2026-08-10T02:00:30Z"), Date.parse("2026-08-10T03:00:00Z"))).toMatch(/whole-minute slot boundaries/i);
		expect(validateEventScheduleBounds(configured, Date.parse("2026-08-10T02:00:00.001Z"), Date.parse("2026-08-10T03:00:00Z"))).toMatch(/whole-minute slot boundaries/i);
		expect(validateEventScheduleBounds(configured, Date.parse("2026-08-10T02:00:00Z"), Date.parse("2026-08-10T03:00:00.001Z"))).toMatch(/whole-minute slot boundaries/i);
	});
	it("uses civil wall-time boundaries across DST transitions", () => {
		const newYork = { timezone: "America/New_York", start_day: "2026-03-08", end_day: "2026-11-01", day_start_minutes: 60, day_end_minutes: 240, slot_duration_minutes: 30 };
		// 01:30 to 03:30 on spring-forward Sunday is one elapsed hour but two wall-clock slots.
		expect(validateEventScheduleBounds(newYork, Date.parse("2026-03-08T06:30:00Z"), Date.parse("2026-03-08T07:30:00Z"))).toBeNull();
		// The fall-back hour repeats, but both instants still stay in the same civil event day.
		expect(validateEventScheduleBounds(newYork, Date.parse("2026-11-01T05:30:00Z"), Date.parse("2026-11-01T06:30:00Z"))).toBeNull();
	});
});
