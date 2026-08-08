import { describe, expect, it } from "vitest";
import { MAX_CFP_REQUEST_BYTES } from "./submit";
import { readBoundedCfpJson } from "./request";

describe("bounded CFP JSON", () => {
	it("rejects oversized bodies before parsing, including unknown top-level data", async () => {
		const request = new Request("https://example.test/cfp", {
			method: "POST",
			body: JSON.stringify({ unknown: "x".repeat(MAX_CFP_REQUEST_BYTES) }),
		});
		await expect(readBoundedCfpJson(request)).resolves.toEqual({ ok: false, status: 413, error: "Request payload is too large" });
	});

	it("rejects an oversized declared content length without reading JSON", async () => {
		const request = new Request("https://example.test/cfp", {
			method: "POST",
			headers: { "content-length": String(MAX_CFP_REQUEST_BYTES + 1) },
			body: "{}",
		});
		await expect(readBoundedCfpJson(request)).resolves.toEqual({ ok: false, status: 413, error: "Request payload is too large" });
	});
});
