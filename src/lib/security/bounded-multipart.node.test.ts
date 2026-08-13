import { describe, expect, it } from "vitest";
import { readBoundedMultipartFormData } from "@/lib/security/bounded-multipart";

describe("bounded multipart parsing in Node", () => {
	it("parses a real multipart FormData request after rebuilding its stream", async () => {
		// Given a real multipart request produced by Node's FormData implementation.
		const form = new FormData();
		form.set("file", new File([new Uint8Array([137, 80, 78, 71])], "headshot.png", { type: "image/png" }));
		const request = new Request("https://conference.example.test/upload", { method: "POST", body: form });

		// When the bounded helper rebuilds the request body for multipart parsing.
		const parsed = await readBoundedMultipartFormData(request, 1024);

		// Then the multipart file remains parseable in Node's Request implementation.
		const file = parsed.get("file");
		expect(file).toBeInstanceOf(File);
		if (!(file instanceof File)) throw new TypeError("Expected parsed file");
		expect(file.name).toBe("headshot.png");
		expect(file.type).toBe("image/png");
	});
});
