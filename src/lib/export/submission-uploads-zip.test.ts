import { describe, expect, it } from "vitest";
import { buildStoredZip } from "@/lib/content/zip";
import {
	collectSubmissionUploadRefs,
	submissionUploadEntryPath,
	type SubmissionUploadRef,
} from "./submission-uploads-zip";

describe("submission uploads zip membership", () => {
	it("collects only file_upload answers from submissions", () => {
		const refs = collectSubmissionUploadRefs([
			{
				id: "sub-a",
				form_id: "form-1",
				answers_json: JSON.stringify({
					title: "Deep learning",
					supporting_doc: {
						assetId: "asset-a",
						filename: "brief.pdf",
						contentType: "application/pdf",
					},
					abstract: "words",
				}),
			},
			{
				id: "sub-b",
				form_id: "form-1",
				answers_json: JSON.stringify({
					title: "No files",
					deck: { filename: "missing-asset-id.pdf" },
				}),
			},
		]);

		expect(refs).toEqual([
			{
				submissionId: "sub-a",
				formId: "form-1",
				fieldKey: "supporting_doc",
				assetId: "asset-a",
				answerFilename: "brief.pdf",
				title: "Deep learning",
			},
		]);
	});

	it("builds zip paths that include the upload filename", () => {
		const ref: SubmissionUploadRef = {
			submissionId: "abcdef12-3456",
			formId: "form-1",
			fieldKey: "supporting_doc",
			assetId: "asset-a",
			answerFilename: "brief.pdf",
			title: "Deep learning",
		};
		const path = submissionUploadEntryPath(ref, "brief.pdf");
		expect(path).toBe("Deep learning-abcdef12/supporting_doc/brief.pdf");

		const zip = buildStoredZip([
			{
				path,
				bytes: new TextEncoder().encode("%PDF-cfp"),
				modifiedAt: Date.UTC(2027, 0, 1),
			},
		]);
		const text = new TextDecoder().decode(zip);
		expect(text.match(/Deep learning-abcdef12\/supporting_doc\/brief\.pdf/g)).toHaveLength(2);
		expect(text).toContain("%PDF-cfp");
	});
});
