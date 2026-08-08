import { describe, expect, it } from "vitest";
import { MAX_SCHEDULE_REQUEST_BYTES, readScheduleJson } from "./request";

describe("schedule request parsing", () => {
	it("rejects scalar JSON as a client error", async () => {
		await expect(readScheduleJson(new Request("https://example.test", { method: "POST", body: "null" }))).resolves.toEqual({ ok: false, status: 400, error: "Expected JSON object" });
	});

	it("cancels an oversized chunked body without pulling subsequent chunks", async () => {
		let pulls = 0;
		const requestInit = {
			method: "PATCH",
			duplex: "half",
			body: new ReadableStream<Uint8Array>({
				pull(controller) {
					pulls += 1;
					controller.enqueue(new TextEncoder().encode("x".repeat(MAX_SCHEDULE_REQUEST_BYTES + 1)));
				},
			}),
		} as RequestInit & { duplex: "half" };
		await expect(readScheduleJson(new Request("https://example.test", requestInit))).resolves.toEqual({ ok: false, status: 413, error: "Request payload is too large" });
		expect(pulls).toBe(1);
	});
});
