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

	it("links speakers by updating the session with the HAR-observed speaker projections", async () => {
		const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
			async (input, init) => init?.method === "GET" && String(input).includes("/session/")
				? new Response(JSON.stringify({
					sessionId: 437249,
					capacity: 250,
					tracks: [],
					speakerList: [{ speakerId: 9182, imageUrl: "https://images.accelevents.test/existing.jpg" }],
					speakersAsTag: [{ speakerId: 9182, imageUrl: "https://images.accelevents.test/existing.jpg" }],
				}), { status: 200 })
				: new Response("ok", { status: 200 }),
		);
		vi.stubGlobal("fetch", fetchMock);
		const api = createAcceleventsApi({ eventUrl: "demo-event", apiKey: "private-key" });

		await api.assignSpeakersToSession("437249", {
			title: "HAR Assignment Test Session",
			description: "Assignment contract test",
			format: "OTHER",
			sessionTypeFormat: "IN_PERSON",
			hideSessionFromAttendees: true,
		}, [{
			externalId: "9182",
			firstName: "HAR",
			lastName: "Test Speaker",
			email: "speaker@example.test",
			bio: "",
			company: "",
			title: "",
		}]);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "GET" });
		const [, init] = fetchMock.mock.calls[1] ?? [];
		expect(init).toMatchObject({ method: "PUT" });
		expect(JSON.parse(String(init?.body))).toMatchObject({
			sessionId: 437249,
			capacity: 250,
			title: "HAR Assignment Test Session",
			speakerList: [{
				speakerId: 9182,
				firstName: "HAR",
				lastName: "Test Speaker",
				email: "speaker@example.test",
				imageUrl: "https://images.accelevents.test/existing.jpg",
			}],
			speakersAsTag: [{
				speakerId: 9182,
				name: "HAR Test Speaker",
				email: "speaker@example.test",
				imageUrl: "https://images.accelevents.test/existing.jpg",
			}],
		});
		expect(fetchMock.mock.calls[1]?.[0]).toBe(
			"https://api.accelevents.com/rest/host/event/demo-event/session/437249",
		);
	});
});
