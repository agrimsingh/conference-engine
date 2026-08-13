import { describe, expect, it, vi } from "vitest";
import { fetchEventRoomMutation } from "@/lib/realtime/event-room-fetch";

function request(): Request {
	return new Request("https://event-room/schedule", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ submissionId: "submission-1" }),
	});
}

describe("fetchEventRoomMutation", () => {
	it.each([
		["Cloudflare dispatch reference", new Error("internal error; reference = f8r1")],
		["D1 storage reset", new Error("D1 storage reset in progress")],
		["transient network disconnect", new Error("Network connection lost")],
	] as const)("retries once after a recognized %s error", async (_name, firstError) => {
		// Given: a readiness probe fails once before EventRoom can answer.
		const fetch = vi
			.fn<(input: Request) => Promise<Response>>()
			.mockRejectedValueOnce(firstError)
			.mockResolvedValueOnce(new Response("Expected WebSocket upgrade", { status: 426 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
		const namespace = { getByName: vi.fn(() => ({ fetch })) };

		// When: the caller dispatches a single mutation request.
		const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const delay = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);
		const response = await fetchEventRoomMutation(namespace, "event-1", request(), {
			delay,
			random: () => 0,
		});

		// Then: the probe is retried and the mutation body is dispatched exactly once.
		expect(response.status).toBe(200);
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(namespace.getByName).toHaveBeenCalledTimes(3);
		expect(delay).toHaveBeenCalledWith(25);
		expect(fetch.mock.calls.slice(0, 2).map(([input]) => input.url)).toEqual([
			"https://event-room/health",
			"https://event-room/health",
		]);
		expect(await fetch.mock.calls[2][0].text()).toBe(JSON.stringify({ submissionId: "submission-1" }));
		expect(warning).toHaveBeenCalledWith("EventRoom readiness probe retry", {
			eventId: "event-1",
			retryable: true,
			overloaded: false,
			reference: firstError.message.match(/reference = ([a-z0-9]+)/i)?.[1] ?? null,
		});
		warning.mockRestore();
	});

	it("retries a structured Cloudflare retryable probe error", async () => {
		// Given: Cloudflare marks the failed probe retryable without overloading the object.
		const firstProbe = vi.fn<(input: Request) => Promise<Response>>()
			.mockRejectedValueOnce({ retryable: true, overloaded: false, reference: "dispatch-1" });
		const secondProbe = vi.fn<(input: Request) => Promise<Response>>()
			.mockResolvedValueOnce(new Response("Expected WebSocket upgrade", { status: 426 }));
		const mutation = vi.fn<(input: Request) => Promise<Response>>()
			.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
		const namespace = {
			getByName: vi.fn()
				.mockReturnValueOnce({ fetch: firstProbe })
				.mockReturnValueOnce({ fetch: secondProbe })
				.mockReturnValueOnce({ fetch: mutation }),
		};

		// When: a mutation probes its EventRoom.
		const response = await fetchEventRoomMutation(namespace, "event-1", request());

		// Then: the probe retries and the mutation still runs once.
		expect(response.status).toBe(200);
		expect(namespace.getByName).toHaveBeenCalledTimes(3);
		expect(firstProbe).toHaveBeenCalledOnce();
		expect(secondProbe).toHaveBeenCalledOnce();
		expect(mutation).toHaveBeenCalledOnce();
	});

	it("returns a structured 503 without retrying an overloaded structured probe error", async () => {
		// Given: Cloudflare reports the probe error as overloaded.
		const error = { retryable: true, overloaded: true, reference: "overloaded-1" };
		const fetch = vi.fn<(input: Request) => Promise<Response>>().mockRejectedValueOnce(error);
		const namespace = { getByName: vi.fn(() => ({ fetch })) };

		// When: a mutation probes its EventRoom.
		const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const response = await fetchEventRoomMutation(namespace, "event-1", request());

		// Then: no retry or mutation happens while the object is overloaded.
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ ok: false, error: "EventRoom temporarily unavailable" });
		expect(fetch).toHaveBeenCalledOnce();
		expect(warning).toHaveBeenCalledOnce();
		warning.mockRestore();
	});

	it("returns a structured 503 without retrying an overloaded probe error message", async () => {
		// Given: Cloudflare reports the EventRoom as overloaded.
		const error = new Error("Durable Object overloaded");
		const fetch = vi.fn<(input: Request) => Promise<Response>>().mockRejectedValueOnce(error);
		const namespace = { getByName: vi.fn(() => ({ fetch })) };

		// When: a mutation probes its EventRoom.
		const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const response = await fetchEventRoomMutation(namespace, "event-1", request());

		// Then: it preserves the overload signal without a probe or mutation replay.
		expect(response.status).toBe(503);
		expect(fetch).toHaveBeenCalledOnce();
		expect(warning).toHaveBeenCalledOnce();
		warning.mockRestore();
	});

	it("returns a structured 503 for a non-transient probe error before dispatching a mutation", async () => {
		// Given: the readiness probe rejects for an application-level reason.
		const error = new Error("EventRoom namespace misconfigured");
		const fetch = vi.fn<(input: Request) => Promise<Response>>().mockRejectedValueOnce(error);
		const namespace = { getByName: vi.fn(() => ({ fetch })) };

		// When: the mutation dispatch runs.
		const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const response = await fetchEventRoomMutation(namespace, "event-1", request());

		// Then: the route can return a useful service-unavailable response and no write is attempted.
		expect(response.status).toBe(503);
		expect(fetch).toHaveBeenCalledOnce();
		expect(warning).toHaveBeenCalledOnce();
		warning.mockRestore();
	});

	it("returns a structured 503 when the retried readiness probe is exhausted", async () => {
		// Given: both safe readiness probes encounter a transient dispatch failure.
		const fetch = vi.fn<(input: Request) => Promise<Response>>()
			.mockRejectedValueOnce(new Error("internal error; reference = first"))
			.mockRejectedValueOnce(new Error("internal error; reference = second"));
		const namespace = { getByName: vi.fn(() => ({ fetch })) };
		const delay = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);
		const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		// When: the mutation waits and retries only its readiness probe.
		const response = await fetchEventRoomMutation(namespace, "event-1", request(), { delay, random: () => 0 });

		// Then: no mutation dispatch follows the exhausted probe and the caller gets a real 503 body.
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ ok: false, error: "EventRoom temporarily unavailable" });
		expect(delay).toHaveBeenCalledWith(25);
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(warning).toHaveBeenCalledTimes(2);
		warning.mockRestore();
	});

	it("retries an empty readiness 500 but never dispatches a mutation when it persists", async () => {
		// Given: the side-effect-free health boundary returns the production symptom twice.
		const firstProbe = vi.fn<(input: Request) => Promise<Response>>()
			.mockResolvedValueOnce(new Response(null, { status: 500 }));
		const secondProbe = vi.fn<(input: Request) => Promise<Response>>()
			.mockResolvedValueOnce(new Response(null, { status: 500 }));
		const mutation = vi.fn<(input: Request) => Promise<Response>>();
		const namespace = {
			getByName: vi.fn()
				.mockReturnValueOnce({ fetch: firstProbe })
				.mockReturnValueOnce({ fetch: secondProbe })
				.mockReturnValueOnce({ fetch: mutation }),
		};
		const delay = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);
		const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		// When: a mutation checks readiness.
		const response = await fetchEventRoomMutation(namespace, "event-1", request(), { delay, random: () => 0 });

		// Then: only fresh, safe probes are retried and the caller receives useful JSON.
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ ok: false, error: "EventRoom temporarily unavailable" });
		expect(firstProbe).toHaveBeenCalledOnce();
		expect(secondProbe).toHaveBeenCalledOnce();
		expect(mutation).not.toHaveBeenCalled();
		expect(namespace.getByName).toHaveBeenCalledTimes(2);
		expect(delay).toHaveBeenCalledWith(25);
		expect(warning).toHaveBeenCalledTimes(2);
		warning.mockRestore();
	});

	it("returns an EventRoom mutation HTTP 500 response without retrying", async () => {
		// Given: readiness succeeds and EventRoom returns its own mutation failure response.
		const fetch = vi.fn<(input: Request) => Promise<Response>>()
			.mockResolvedValueOnce(new Response("Expected WebSocket upgrade", { status: 426 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "conflict" }), { status: 500 }));
		const namespace = { getByName: vi.fn(() => ({ fetch })) };

		// When: the mutation dispatch runs.
		const response = await fetchEventRoomMutation(namespace, "event-1", request());

		// Then: the application response is preserved rather than replaying a write.
		expect(response.status).toBe(500);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("does not retry a thrown mutation after a successful readiness probe", async () => {
		// Given: EventRoom answers its probe but the actual mutation throws.
		const error = new Error("internal error; reference = f8r1");
		const fetch = vi.fn<(input: Request) => Promise<Response>>()
			.mockResolvedValueOnce(new Response("Expected WebSocket upgrade", { status: 426 }))
			.mockRejectedValueOnce(error);
		const namespace = { getByName: vi.fn(() => ({ fetch })) };

		// When: the mutation runs after the successful readiness probe.
		const dispatch = fetchEventRoomMutation(namespace, "event-1", request());

		// Then: it reaches the caller without replaying the mutation.
		await expect(dispatch).rejects.toBe(error);
		expect(fetch).toHaveBeenCalledTimes(2);
	});
});
