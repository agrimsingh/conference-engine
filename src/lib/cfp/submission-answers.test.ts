import { describe, expect, it } from "vitest";
import { buildSubmissionAnswerDisplays } from "./submission-answers";

describe("buildSubmissionAnswerDisplays", () => {
	it("renders file uploads as download links instead of JSON", () => {
		const displays = buildSubmissionAnswerDisplays(
			{
				abstract: "A great talk",
				supporting_doc: { assetId: "asset-a", filename: "brief.pdf" },
			},
			{
				submissionId: "submission-a",
				downloadHref: (fieldKey) => `/download/${fieldKey}`,
			},
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
});
