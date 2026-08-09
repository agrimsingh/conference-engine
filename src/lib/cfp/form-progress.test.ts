import { describe, expect, it } from "vitest";
import type { FormFieldDef } from "@/lib/domain";
import { computeCfpProgress } from "./form-progress";

const title: FormFieldDef = {
	key: "title",
	label: "Title",
	fieldType: "text",
	required: true,
	position: 0,
	visibilityRule: { op: "always" },
	config: { kind: "text", maxLength: 160 },
};

const optionalNotes: FormFieldDef = {
	key: "notes",
	label: "Notes",
	fieldType: "textarea",
	required: false,
	position: 1,
	visibilityRule: { op: "always" },
	config: { kind: "textarea" },
};

const supportingDoc: FormFieldDef = {
	key: "supporting_doc",
	label: "Supporting document",
	fieldType: "file_upload",
	required: true,
	position: 2,
	visibilityRule: { op: "always" },
	config: { kind: "file_upload", accept: ["application/pdf"] },
};

describe("computeCfpProgress", () => {
	it("counts identity and visible required fields only", () => {
		expect(computeCfpProgress([title, optionalNotes], { title: "", notes: "ignored" }, { name: "", email: "" }))
			.toEqual({ completed: 0, total: 3 });
		expect(computeCfpProgress([title, optionalNotes], { title: "Talk", notes: "ignored" }, { name: "Ari", email: "ari@example.test" }))
			.toEqual({ completed: 3, total: 3 });
	});

	it("counts required file_upload answers when a valid FileUploadAnswer is present", () => {
		expect(computeCfpProgress(
			[title, supportingDoc],
			{
				title: "Talk",
				supporting_doc: { assetId: "asset-a", filename: "brief.pdf", contentType: "application/pdf" },
			},
			{ name: "Ari", email: "ari@example.test" },
		)).toEqual({ completed: 4, total: 4 });
		expect(computeCfpProgress(
			[title, supportingDoc],
			{ title: "Talk", supporting_doc: null },
			{ name: "Ari", email: "ari@example.test" },
		)).toEqual({ completed: 3, total: 4 });
	});
});
