import { describe, expect, it } from "vitest";
import {
	buildCfpUploadR2Key,
	contentTypeAllowed,
	effectiveUploadMaxBytes,
	sanitizeFilename,
} from "./file-upload";

describe("CFP file upload helpers", () => {
	it("caps configured max bytes at the hard limit", () => {
		expect(effectiveUploadMaxBytes({ kind: "file_upload", maxBytes: 999 * 1024 * 1024 })).toBe(25 * 1024 * 1024);
	});

	it("matches mime groups and exact content types", () => {
		const config = { kind: "file_upload" as const, accept: ["application/pdf", "image/*"] };
		expect(contentTypeAllowed("application/pdf", config)).toBe(true);
		expect(contentTypeAllowed("image/png", config)).toBe(true);
		expect(contentTypeAllowed("text/plain", config)).toBe(false);
	});

	it("builds stable R2 keys and sanitizes filenames", () => {
		expect(sanitizeFilename("../../slides/My Deck!.pdf")).toBe("My_Deck_.pdf");
		expect(buildCfpUploadR2Key({
			eventId: "event-a",
			formId: "form-a",
			fieldKey: "slides",
			assetId: "asset-a",
			filename: "My Deck!.pdf",
		})).toBe("events/event-a/cfp/form-a/slides/asset-a-My_Deck_.pdf");
	});
});
