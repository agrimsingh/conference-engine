import { describe, expect, it } from "vitest";
import type { FormFieldDef } from "./form-fields";
import {
	groupFieldsBySection,
	parseFormSections,
	serializeFormSections,
	validateFormSectionsInput,
} from "./form-sections";

const textField = (key: string, sectionKey?: string | null): FormFieldDef => ({
	key,
	label: key,
	fieldType: "text",
	required: false,
	position: 0,
	visibilityRule: { op: "always" },
	config: { kind: "text" },
	sectionKey,
});

describe("form sections", () => {
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

	it("round-trips sections json", () => {
		const sections = [
			{ key: "basics", title: "Basics", description: "Core details" },
			{ key: "extras", title: "Extras" },
		];
		const raw = serializeFormSections(sections);
		expect(parseFormSections(raw)).toEqual(sections);
	});

	it("groups fields in section order and drops unknown section keys to unsectioned", () => {
		const sections = [
			{ key: "basics", title: "Basics" },
			{ key: "extras", title: "Extras" },
		];
		const grouped = groupFieldsBySection(
			[textField("title", "basics"), textField("notes", "missing"), textField("bio", "extras")],
			sections,
		);
		expect(grouped.map((group) => group.section?.key ?? null)).toEqual(["basics", "extras", null]);
		expect(grouped[2]?.fields.map((field) => field.key)).toEqual(["notes"]);
	});

	it("rejects duplicate section keys on write validation", () => {
		expect(
			validateFormSectionsInput([
				{ key: "a", title: "A" },
				{ key: "a", title: "Again" },
			]),
		).toBe("section keys must be unique");
	});
});
