import { describe, expect, it, vi } from "vitest";
import { bootstrapRoomTicket } from "./room-client";

describe("room ticket bootstrap", () => {
	it("uses a credentialed GET with no bearer token in the room URL", async () => {
		const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
		await expect(bootstrapRoomTicket("event one", fetchImpl)).resolves.toEqual({ ok: true });
		expect(fetchImpl).toHaveBeenCalledWith("/api/admin/events/event%20one/room", {
			method: "GET", credentials: "include", cache: "no-store",
		});
	});

	it("keeps polling available when bootstrap fails", async () => {
		await expect(bootstrapRoomTicket("event", async () => new Response(null, { status: 401 }))).resolves.toEqual({ ok: false, error: "Room bootstrap failed (HTTP 401)" });
	});
});
