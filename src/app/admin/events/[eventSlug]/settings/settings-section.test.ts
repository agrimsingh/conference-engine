import { describe, expect, it } from "vitest";
import { parseSection } from "./settings-section";

describe("parseSection", () => {
	it("accepts known settings sections", () => {
		expect(parseSection("details")).toBe("details");
		expect(parseSection("team")).toBe("team");
		expect(parseSection("api-tokens")).toBe("api-tokens");
		expect(parseSection("rooms")).toBe("rooms");
		expect(parseSection("tracks")).toBe("tracks");
		expect(parseSection("tasks")).toBe("tasks");
	});

	it("defaults unknown or missing values to details", () => {
		expect(parseSection(null)).toBe("details");
		expect(parseSection(undefined)).toBe("details");
		expect(parseSection("")).toBe("details");
		expect(parseSection("nope")).toBe("details");
	});
});
