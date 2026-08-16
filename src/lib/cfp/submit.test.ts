import { describe, expect, it } from "vitest";
import { validateCfpPayloadBounds, validateSubmissionAnswers } from "./submit";
import { validateFieldWrite } from "./form-admin";
import { validateFieldAnswer, type FormFieldDef } from "@/lib/domain/form-fields";

describe("CFP payload bounds", () => {
	it("enforces configured field maxLength", () => {
		const field: FormFieldDef = {
			key: "abstract",
			label: "Abstract",
			fieldType: "textarea",
			required: true,
			position: 0,
			visibilityRule: { op: "always" },
			config: { kind: "textarea", maxLength: 5 },
		};
		expect(validateFieldAnswer(field, "123456")).toBe("Abstract must be at most 5 characters");
		expect(validateFieldAnswer(field, "12345")).toBeNull();
	});

	it("rejects oversized and excessively wide answer maps", () => {
		expect(validateCfpPayloadBounds({ abstract: "x".repeat(200 * 1024) })).toBe("answers payload is too large");
		const wideAnswers = Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`field_${index}`, "x"]));
		expect(validateCfpPayloadBounds(wideAnswers)).toBe("answers has too many fields");
	});

	it("rejects duplicate speaker emails case-insensitively", () => {
		const field: FormFieldDef = {
			key: "speakers",
			label: "Speakers",
			fieldType: "speaker_block",
			required: true,
			position: 0,
			visibilityRule: { op: "always" },
			config: { kind: "speaker_block", minSpeakers: 1, maxSpeakers: 4 },
		};
		const dup = [
			{ name: "Ada", email: "ada@example.test" },
			{ name: "Ada Again", email: "ADA@example.test " },
		];
		expect(validateFieldAnswer(field, dup)).toBe("Each speaker needs a distinct email");
		const distinct = [
			{ name: "Ada", email: "ada@example.test" },
			{ name: "Grace", email: "grace@example.test" },
		];
		expect(validateFieldAnswer(field, distinct)).toBeNull();
	});

	it("accepts a hosted video URL and rejects a non-web video URL", () => {
		const field: FormFieldDef = {
			key: "proposal_video",
			label: "Proposal video",
			fieldType: "video",
			required: true,
			position: 0,
			visibilityRule: { op: "always" },
			config: { kind: "video" },
		};
		expect(validateFieldAnswer(field, "https://video.example.test/watch/123")).toBeNull();
		expect(validateFieldAnswer(field, "file:///private/video.mp4")).toMatch(/http\(s\)/);
	});

	it("requires at least one choice for a required multiselect", () => {
		const field: FormFieldDef = {
			key: "topics", label: "Topics", fieldType: "multiselect", required: true, position: 0,
			visibilityRule: { op: "always" }, config: { kind: "multiselect", options: [{ value: "agents", label: "Agents" }] },
		};
		expect(validateFieldAnswer(field, [])).toBe("Topics is required");
	});

	it("keeps complete valid field config and rejects malformed select options", () => {
		const valid = validateFieldWrite({
			key: "abstract", label: "Abstract", fieldType: "textarea", required: true, position: 2,
			visibilityRule: { op: "always" }, config: { kind: "textarea", maxLength: 1200, rows: 8, placeholder: "What will people learn?" },
		});
		expect(valid).not.toBeTypeOf("string");
		expect(typeof valid === "string" ? null : valid.config).toEqual({ kind: "textarea", maxLength: 1200, rows: 8, placeholder: "What will people learn?" });
		expect(validateFieldWrite({ key: "format", label: "Format", fieldType: "select", required: true, position: 0, config: { kind: "select", options: [{ value: "same", label: "One" }, { value: "same", label: "Two" }] } })).toBe("config is invalid for this field type");
	});

	it("accepts neq and never visibility rules on field write", () => {
		const neq = validateFieldWrite({
			key: "workshop_details",
			label: "Workshop details",
			fieldType: "textarea",
			required: false,
			position: 1,
			visibilityRule: { op: "neq", fieldKey: "format", value: "talk" },
			config: { kind: "textarea", rows: 4 },
		});
		expect(neq).not.toBeTypeOf("string");
		expect(typeof neq === "string" ? null : neq.visibilityRule).toEqual({
			op: "neq",
			fieldKey: "format",
			value: "talk",
		});

		const never = validateFieldWrite({
			key: "legacy_note",
			label: "Legacy note",
			fieldType: "text",
			required: false,
			position: 2,
			visibilityRule: { op: "never" },
			config: { kind: "text", placeholder: "hidden", maxLength: 40 },
		});
		expect(never).not.toBeTypeOf("string");
		expect(typeof never === "string" ? null : never.visibilityRule).toEqual({ op: "never" });
		expect(typeof never === "string" ? null : never.config).toEqual({
			kind: "text",
			placeholder: "hidden",
			maxLength: 40,
		});
	});

	it("accepts a bounded number default and rejects an out-of-range default", () => {
		const valid = validateFieldWrite({
			key: "duration_minutes",
			label: "Duration",
			fieldType: "number",
			required: true,
			position: 0,
			visibilityRule: { op: "always" },
			config: { kind: "number", min: 5, max: 90, step: 5, defaultValue: 30 },
		});
		expect(valid).not.toBeTypeOf("string");
		expect(typeof valid === "string" ? null : valid.config).toEqual({
			kind: "number",
			min: 5,
			max: 90,
			step: 5,
			defaultValue: 30,
		});
		expect(validateFieldWrite({
			key: "duration_minutes",
			label: "Duration",
			fieldType: "number",
			required: true,
			position: 0,
			visibilityRule: { op: "always" },
			config: { kind: "number", min: 15, max: 120, step: 5, defaultValue: 10 },
		})).toBe("config is invalid for this field type");
	});

	it("omits a duration default when the selected format hides duration", () => {
		const fields: FormFieldDef[] = [
			{
				key: "format",
				label: "Format",
				fieldType: "select",
				required: true,
				position: 0,
				visibilityRule: { op: "always" },
				config: { kind: "select", options: [{ value: "lightning", label: "Lightning" }] },
			},
			{
				key: "duration_minutes",
				label: "Duration",
				fieldType: "number",
				required: true,
				position: 1,
				visibilityRule: { op: "in", fieldKey: "format", values: ["stage", "workshop", "online"] },
				config: { kind: "number", min: 15, max: 240, step: 5, defaultValue: 30 },
			},
			{
				key: "speakers",
				label: "Speakers",
				fieldType: "speaker_block",
				required: true,
				position: 2,
				visibilityRule: { op: "always" },
				config: { kind: "speaker_block", minSpeakers: 1, maxSpeakers: 4 },
			},
		];

		const result = validateSubmissionAnswers(fields, {
			format: "lightning",
			duration_minutes: 30,
			speakers: [{ name: "Ada", email: "ada@example.test" }],
		});

		expect(result).toMatchObject({
			ok: true,
			visibleAnswers: { format: "lightning" },
		});
		expect(result.ok && result.visibleAnswers).not.toHaveProperty("duration_minutes");
	});

	it("accepts file_upload config on field write", () => {
		const valid = validateFieldWrite({
			key: "slides",
			label: "Slides",
			fieldType: "file_upload",
			required: false,
			position: 1,
			visibilityRule: { op: "always" },
			config: { kind: "file_upload", accept: ["application/pdf"], maxBytes: 1048576 },
		});
		expect(valid).not.toBeTypeOf("string");
		expect(typeof valid === "string" ? null : valid.config).toEqual({
			kind: "file_upload",
			accept: ["application/pdf"],
			maxBytes: 1048576,
		});
	});
});
