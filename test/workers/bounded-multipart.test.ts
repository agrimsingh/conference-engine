import { describe, expect, it } from "vitest";
import { MultipartBodyTooLargeError, readBoundedMultipartFormData } from "@/lib/security/bounded-multipart";

describe("bounded multipart parsing", () => {
	it("parses a real multipart PNG request in the Worker runtime", async () => {
		const form = new FormData();
		form.set("file", new File([new Uint8Array([137, 80, 78, 71])], "headshot.png", { type: "image/png" }));
		const request = new Request("https://conference.example.test/upload", { method: "POST", body: form });
		const parsed = await readBoundedMultipartFormData(request, 1024);
		const file = parsed.get("file");
		expect(file).toBeInstanceOf(File);
		expect((file as File).name).toBe("headshot.png");
		expect((file as File).type).toBe("image/png");
	});

	it("cancels an oversized chunked body before it can be fully buffered", async () => {
		const encoder = new TextEncoder();
		let pulls = 0;
		const request = new Request("https://conference.example.test/upload", {
			method: "POST",
			headers: { "content-type": "multipart/form-data; boundary=test" },
			body: new ReadableStream<Uint8Array>({
				pull(controller) {
					pulls += 1;
					controller.enqueue(encoder.encode("x".repeat(128)));
				},
			}),
		});
		await expect(readBoundedMultipartFormData(request, 64)).rejects.toBeInstanceOf(MultipartBodyTooLargeError);
		expect(pulls).toBe(1);
	});
});
