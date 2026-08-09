import { describe, expect, it } from "vitest";
import { normalizeSubmissionLabel } from "./labels";

describe("normalizeSubmissionLabel", () => {
	it("trims and collapses whitespace within the length bound", () => {
		expect(normalizeSubmissionLabel("  short  list  ")).toBe("short list");
		expect(normalizeSubmissionLabel("")).toBeNull();
		expect(normalizeSubmissionLabel("x".repeat(41))).toBeNull();
		expect(normalizeSubmissionLabel(12)).toBeNull();
	});
});
