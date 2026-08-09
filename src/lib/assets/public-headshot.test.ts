import { describe, expect, it } from "vitest";
import { getPublicHeadshot } from "./public-headshot";
import type { AssetRow } from "@/lib/db/types";

const asset: AssetRow = {
	id: "asset",
	event_id: "event-a",
	r2_key: "events/event-a/people/person/headshot.png",
	content_type: "image/png",
	filename: "headshot.png",
	uploaded_by_person_id: "person",
	created_at: 1,
};

function fakeObject(body = "png"): R2ObjectBody {
	return {
		body: new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode(body));
				controller.close();
			},
		}),
		httpMetadata: { contentType: "image/png" },
	} as R2ObjectBody;
}

describe("getPublicHeadshot", () => {
	it("404s before touching R2 when the speaker is not publicly eligible", async () => {
		let readObject = false;
		const result = await getPublicHeadshot(
			{
				resolvePublicHeadshotAsset: async () => null,
				getObject: async () => {
					readObject = true;
					return fakeObject();
				},
			},
			{ eventId: "event-a", personId: "person" },
		);
		expect(result).toEqual({ ok: false, status: 404 });
		expect(readObject).toBe(false);
	});

	it("streams an eligible headshot with public cache headers", async () => {
		const result = await getPublicHeadshot(
			{
				resolvePublicHeadshotAsset: async () => asset,
				getObject: async () => fakeObject(),
			},
			{ eventId: "event-a", personId: "person" },
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.response.headers.get("Cache-Control")).toBe(
			"public, max-age=3600, stale-while-revalidate=86400",
		);
		expect(result.response.headers.get("Content-Type")).toBe("image/png");
		expect(result.response.headers.get("Content-Disposition")).toContain("inline");
	});

	it("rejects assets that belong to another event", async () => {
		const result = await getPublicHeadshot(
			{
				resolvePublicHeadshotAsset: async () => ({ ...asset, event_id: "event-b" }),
				getObject: async () => fakeObject(),
			},
			{ eventId: "event-a", personId: "person" },
		);
		expect(result).toEqual({ ok: false, status: 404 });
	});
});
