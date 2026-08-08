import { describe, expect, it } from "vitest";
import { getOrganizerAssetDownload } from "./organizer-download";
import type { AssetRow, SpeakerTaskRow } from "@/lib/db/types";

const task: SpeakerTaskRow = { id: "task", event_id: "event-a", asset_id: "asset", submission_id: "submission", person_id: "person", template_key: "headshot", status: "completed", text_value: null, completed_at: 1, created_at: 1, updated_at: 1 };
const asset: AssetRow = { id: "asset", event_id: "event-a", r2_key: "events/event-a/asset", content_type: "image/jpeg", filename: "portrait.jpg", uploaded_by_person_id: "person", created_at: 1 };
const object = { body: new ReadableStream(), httpMetadata: { contentType: "image/jpeg" } } as unknown as R2ObjectBody;

describe("organizer asset downloads", () => {
	it("rejects a task outside the authorized event before touching R2", async () => {
		let readObject = false;
		const result = await getOrganizerAssetDownload({ getTask: async () => task, getAsset: async () => asset, getObject: async () => { readObject = true; return object; } }, { eventId: "event-b", taskId: "task" });
		expect(result).toEqual({ ok: false, status: 404 });
		expect(readObject).toBe(false);
	});

	it("streams a matching asset with private download headers", async () => {
		const result = await getOrganizerAssetDownload({ getTask: async () => task, getAsset: async () => asset, getObject: async () => object }, { eventId: "event-a", taskId: "task" });
		if (!result.ok) throw new Error("expected download");
		expect(result.response.headers.get("Content-Type")).toBe("image/jpeg");
		expect(result.response.headers.get("Content-Disposition")).toBe('attachment; filename="portrait.jpg"');
		expect(result.response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(result.response.headers.get("Cache-Control")).toBe("private, no-store");
	});
});
