import { describe, expect, it } from "vitest";
import { renderSpeakerAnnouncementPreview, uniqueRecipientIds } from "./operations";

describe("speaker operation targeting", () => {
	it("deduplicates explicit visible recipients and rejects empty or malformed selection", () => {
		expect(uniqueRecipientIds(["priya", "marcus", "priya"])).toEqual(["priya", "marcus"]);
		expect(uniqueRecipientIds([])).toBeNull();
		expect(uniqueRecipientIds(["priya", ""])).toBeNull();
	});

	it("resolves a communication preview for the actual recipient", () => {
		expect(renderSpeakerAnnouncementPreview("Welcome to {{event_name}}", "Hi {{submitter_name}}, open {{portal_url}}", { name: "Priya Raman" }, "DevFlow Conf 2027", "https://example.test/portal")).toEqual({ subject: "Welcome to DevFlow Conf 2027", text: "Hi Priya Raman, open https://example.test/portal" });
	});
});
