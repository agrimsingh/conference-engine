import { describe, expect, it } from "vitest";
import { detectBrowserTimeZone, listIanaTimeZones, timeZoneOptions } from "./timezones";

describe("timezones", () => {
	it("lists IANA zones including common conference cities", () => {
		const zones = listIanaTimeZones();
		expect(zones).toContain("UTC");
		expect(zones).toContain("Asia/Singapore");
		expect(zones.length).toBeGreaterThan(10);
	});

	it("keeps an existing custom value in the option list", () => {
		expect(timeZoneOptions("Pacific/Honolulu")).toContain("Pacific/Honolulu");
	});

	it("detects a usable browser timezone", () => {
		expect(detectBrowserTimeZone("UTC")).toMatch(/\w+\/\w+|UTC/);
	});
});
