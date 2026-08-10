import { describe, expect, it } from "vitest";
import {
	formatCfpDeadline,
	isCfpBeforeOpensAt,
	isCfpOpenNow,
	isCfpPastClosesAt,
} from "./closes-at";

describe("CFP lifecycle window", () => {
	const now = 1_800_000_000_000;

	it("enforces both an opening and closing timestamp at their boundaries", () => {
		expect(isCfpBeforeOpensAt({ opens_at: now + 1 }, now)).toBe(true);
		expect(isCfpOpenNow({ opens_at: now + 1, closes_at: null }, now)).toBe(false);
		expect(isCfpOpenNow({ opens_at: now, closes_at: now + 1 }, now)).toBe(true);
		expect(isCfpPastClosesAt({ closes_at: now }, now)).toBe(true);
		expect(isCfpOpenNow({ opens_at: null, closes_at: now }, now)).toBe(false);
	});

	it("formats a public deadline in the event timezone", () => {
		const label = formatCfpDeadline(Date.UTC(2026, 8, 15, 6, 59), "America/Los_Angeles");
		expect(label).toMatch(/Sep/);
		expect(label).toMatch(/2026/);
		expect(label.length).toBeGreaterThan(8);
	});
});
