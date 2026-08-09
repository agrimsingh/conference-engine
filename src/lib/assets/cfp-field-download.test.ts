import { describe, expect, it } from "vitest";
import type { AssetRow, SubmissionRow } from "@/lib/db/types";
import { getCfpFieldAssetDownload } from "./cfp-field-download";

const submission: SubmissionRow = {
	id: "submission-a",
	form_id: "form-a",
	event_id: "event-a",
	status: "submitted",
	answers_json: JSON.stringify({
		title: "Talk",
		deck: { assetId: "asset-a", filename: "deck.pdf", contentType: "application/pdf" },
	}),
	category: null,
	submitter_email: "ada@example.test",
	submitter_name: "Ada",
	submitter_person_id: null,
	origin: "cfp",
	lineage_parent_submission_id: undefined,
	lineage_root_submission_id: undefined,
	lineage_source_event_id: undefined,
	import_key: undefined,
	video_url: null,
	google_doc_url: null,
	supporting_url: null,
	created_at: 1,
	updated_at: 1,
	submitted_at: 1,
};

const asset: AssetRow = {
	id: "asset-a",
	event_id: "event-a",
	r2_key: "events/event-a/cfp/form-a/deck/asset-a-deck.pdf",
	content_type: "application/pdf",
	filename: "deck.pdf",
	uploaded_by_person_id: null,
	form_id: "form-a",
	field_key: "deck",
	created_at: 1,
};

const object = { body: new ReadableStream(), httpMetadata: { contentType: "application/pdf" } } as unknown as R2ObjectBody;

describe("CFP field asset downloads", () => {
	it("rejects a submission outside the authorized event before touching R2", async () => {
		let readObject = false;
		const result = await getCfpFieldAssetDownload({
			getSubmission: async () => submission,
			getAsset: async () => asset,
			getObject: async () => {
				readObject = true;
				return object;
			},
		}, { eventId: "event-b", submissionId: "submission-a", fieldKey: "deck" });
		expect(result).toEqual({ ok: false, status: 404 });
		expect(readObject).toBe(false);
	});

	it("rejects a field key whose answer is not a file upload", async () => {
		const result = await getCfpFieldAssetDownload({
			getSubmission: async () => ({
				...submission,
				answers_json: JSON.stringify({ title: "Talk only" }),
			}),
			getAsset: async () => asset,
			getObject: async () => object,
		}, { eventId: "event-a", submissionId: "submission-a", fieldKey: "deck" });
		expect(result).toEqual({ ok: false, status: 404 });
	});

	it("streams a matching asset with private download headers", async () => {
		const result = await getCfpFieldAssetDownload({
			getSubmission: async () => submission,
			getAsset: async () => asset,
			getObject: async () => object,
		}, { eventId: "event-a", submissionId: "submission-a", fieldKey: "deck" });
		if (!result.ok) throw new Error("expected download");
		expect(result.response.headers.get("Content-Type")).toBe("application/pdf");
		expect(result.response.headers.get("Content-Disposition")).toBe('attachment; filename="deck.pdf"');
	});
});
