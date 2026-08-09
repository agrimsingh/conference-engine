import { describe, expect, it } from "vitest";
import type { FormFieldDef, FormSectionDef } from "@/lib/domain";
import { groupVisibleFieldsBySection } from "./form-sections";

const sections: FormSectionDef[] = [
	{ key: "basics", title: "Basics" },
	{ key: "details", title: "Details", description: "Extra context" },
];

const basicsField: FormFieldDef = {
	key: "title",
	label: "Title",
	fieldType: "text",
	required: true,
	position: 0,
	visibilityRule: { op: "always" },
	config: { kind: "text" },
	sectionKey: "basics",
};

const detailsField: FormFieldDef = {
	key: "abstract",
	label: "Abstract",
	fieldType: "textarea",
	required: true,
	position: 1,
	visibilityRule: { op: "always" },
	config: { kind: "textarea" },
	sectionKey: "details",
};

describe("groupVisibleFieldsBySection", () => {
	it("returns a single group when no sections are configured", () => {
		expect(groupVisibleFieldsBySection([], [basicsField, detailsField])).toEqual([
			{ section: null, fields: [basicsField, detailsField] },
		]);
	});

	it("groups fields under configured sections and keeps unmapped fields last", () => {
		const unmapped: FormFieldDef = { ...basicsField, key: "format", sectionKey: undefined };
		expect(groupVisibleFieldsBySection(sections, [basicsField, detailsField, unmapped])).toEqual([
			{ section: sections[0], fields: [basicsField] },
			{ section: sections[1], fields: [detailsField] },
			{ section: null, fields: [unmapped] },
		]);
	});
});
