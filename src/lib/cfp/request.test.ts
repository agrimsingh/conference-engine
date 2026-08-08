import { describe, expect, it } from "vitest";
import { MAX_CFP_REQUEST_BYTES } from "./submit";
import { isJsonObject, readBoundedCfpJson } from "./request";

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

	it("treats scalar, null, and array JSON as non-object CFP payloads", () => {
		expect(isJsonObject(null)).toBe(false);
		expect(isJsonObject("not an object")).toBe(false);
		expect(isJsonObject(["answer"])).toBe(false);
		expect(isJsonObject({ answers: {} })).toBe(true);
	});

	it("cancels an oversized chunked JSON body before reading subsequent chunks", async () => {
		let pulls = 0;
		const requestInit = {
			method: "POST",
			duplex: "half",
			body: new ReadableStream<Uint8Array>({
				pull(controller) {
					pulls += 1;
					controller.enqueue(new TextEncoder().encode("x".repeat(MAX_CFP_REQUEST_BYTES + 1)));
				},
			}),
		} as RequestInit & { duplex: "half" };
		const request = new Request("https://example.test/cfp", requestInit);
		await expect(readBoundedCfpJson(request)).resolves.toEqual({ ok: false, status: 413, error: "Request payload is too large" });
		expect(pulls).toBe(1);
	});
});
