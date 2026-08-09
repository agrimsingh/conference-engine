import { describe, expect, it } from "vitest";
import { parseFormSections } from "./form-sections";

describe("parseFormSections", () => {
	it("returns an empty list for missing or invalid JSON", () => {
		expect(parseFormSections(null)).toEqual([]);
		expect(parseFormSections("not-json")).toEqual([]);
		expect(parseFormSections("{}")).toEqual([]);
	});

	it("parses valid section metadata and deduplicates keys", () => {
		expect(parseFormSections(JSON.stringify([
			{ key: "basics", title: "Basics", description: "Start here" },
			{ key: "basics", title: "Duplicate" },
			{ key: "details", title: "Details" },
		]))).toEqual([
			{ key: "basics", title: "Basics", description: "Start here" },
			{ key: "details", title: "Details" },
		]);
	});
});
