import { describe, expect, it } from "vitest";
import { buildSubmissionAnswerDisplays } from "./submission-answers";

describe("buildSubmissionAnswerDisplays", () => {
	const baseArgs = {
		submissionId: "submission-a",
		downloadHref: (fieldKey: string) => `/download/${fieldKey}`,
	};

	it("renders file uploads as download links instead of JSON", () => {
		const displays = buildSubmissionAnswerDisplays(
			{
				abstract: "A great talk",
				supporting_doc: { assetId: "asset-a", filename: "brief.pdf" },
			},
			baseArgs,
		);
		expect(displays).toEqual([
			{ kind: "text", key: "abstract", label: "abstract", value: "A great talk" },
			{
				kind: "file",
				key: "supporting_doc",
				label: "supporting doc",
				filename: "brief.pdf",
				downloadHref: "/download/supporting_doc",
			},
		]);
	});

	it("uses authored field labels when provided", () => {
		const fieldLabels = new Map([["duration_minutes", "Duration (minutes)"]]);
		const displays = buildSubmissionAnswerDisplays(
			{ duration_minutes: "45" },
			{ ...baseArgs, fieldLabels },
		);
		expect(displays).toEqual([
			{
				kind: "text",
				key: "duration_minutes",
				label: "Duration (minutes)",
				value: "45",
			},
		]);
	});

	it("falls back to humanized keys for unknown answer keys", () => {
		const fieldLabels = new Map([["abstract", "Abstract"]]);
		const displays = buildSubmissionAnswerDisplays(
			{
				abstract: "Talk summary",
				legacy_field: "old value",
			},
			{ ...baseArgs, fieldLabels },
		);
		expect(displays).toEqual([
			{ kind: "text", key: "abstract", label: "Abstract", value: "Talk summary" },
			{ kind: "text", key: "legacy_field", label: "legacy field", value: "old value" },
		]);
	});

	it("orders by fieldLabels insertion order with leftovers appended", () => {
		const fieldLabels = new Map([
			["abstract", "Abstract"],
			["format", "Format"],
		]);
		const displays = buildSubmissionAnswerDisplays(
			{
				legacy_field: "old value",
				format: "Talk",
				abstract: "Summary",
			},
			{ ...baseArgs, fieldLabels },
		);
		expect(displays.map((display) => display.key)).toEqual([
			"abstract",
			"format",
			"legacy_field",
		]);
	});

	it("behaves identically when fieldLabels is omitted", () => {
		const answers = {
			abstract: "A great talk",
			supporting_doc: { assetId: "asset-a", filename: "brief.pdf" },
		};
		expect(buildSubmissionAnswerDisplays(answers, baseArgs)).toEqual(
			buildSubmissionAnswerDisplays(answers, { ...baseArgs, fieldLabels: undefined }),
		);
	});
});
