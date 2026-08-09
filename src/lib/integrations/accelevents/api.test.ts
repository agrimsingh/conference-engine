import { afterEach, describe, expect, it, vi } from "vitest";
import { createAcceleventsApi } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("Accelevents API client", () => {
	it("uses the documented host endpoint and returns its created speaker ID", async () => {
		const fetchMock = vi.fn(async () => new Response("101", { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const api = createAcceleventsApi({ eventUrl: "demo-event", apiKey: "private-key" });

		await expect(api.createSpeaker({
			firstName: "Ada",
			lastName: "Lovelace",
			email: "ada@example.test",
			bio: "Computing pioneer",
			company: "Analytical Engines",
			title: "Engineer",
		})).resolves.toBe("101");
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.accelevents.com/rest/host/event/demo-event/speaker",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({ Key: "private-key", Authorization: "private-key" }),
			}),
		);
	});

	it("reconciles a speaker by exact normalized email through the documented bounded host list", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({
			data: [
				{ speakerId: 101, email: "ADA@example.test" },
				{ speakerId: 102, email: "other@example.test" },
			],
		}), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const api = createAcceleventsApi({ eventUrl: "demo-event", apiKey: "private-key" });

		await expect(api.findSpeakerByEmail(99, "ada@example.test")).resolves.toBe("101");
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.accelevents.com/rest/host/event/demo-event/speaker?eventId=99&searchString=ada%40example.test&page=0&size=5",
			expect.objectContaining({ method: "GET" }),
		);
	});

	it("does not retry a create when its response is lost", async () => {
		const fetchMock = vi.fn(async () => { throw new Error("connection closed after provider accepted"); });
		vi.stubGlobal("fetch", fetchMock);
		const api = createAcceleventsApi({ eventUrl: "demo-event", apiKey: "private-key" });

		await expect(api.createSpeaker({
			firstName: "Ada",
			lastName: "Lovelace",
			email: "ada@example.test",
			bio: "Computing pioneer",
			company: "Analytical Engines",
			title: "Engineer",
		})).rejects.toThrow("connection closed after provider accepted");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
