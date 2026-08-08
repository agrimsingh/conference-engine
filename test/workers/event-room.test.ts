import { runInDurableObject, SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { mintRoomTicket } from "@/lib/security/room-ticket";

const now = 1_780_000_000_000;

async function seedScheduleEvent(): Promise<void> {
	await env.DB.batch([
		env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('room-event', 'room-event', 'Room Event', 'UTC', ?, ?)").bind(now, now),
		env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('room-form', 'room-event', 'cfp', 'CFP', 'open', ?, ?)").bind(now, now),
		env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('room-submission-a', 'room-form', 'room-event', 'accepted', '{}', ?, ?)").bind(now, now),
		env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('room-submission-b', 'room-form', 'room-event', 'accepted', '{}', ?, ?)").bind(now, now),
	]);
}

describe("EventRoom in the Workers runtime", () => {
	it("serializes concurrent conflicting schedule requests so only one can commit", async () => {
		await seedScheduleEvent();
		const room = env.EVENT_ROOM.getByName("room-event");
		const schedule = (submissionId: string) => room.fetch("https://event-room/schedule", {
			method: "POST",
			headers: { "content-type": "application/json", "x-ce-event-id": "room-event" },
			body: JSON.stringify({ submissionId, roomName: "Main", startsAtMs: now, endsAtMs: now + 3_600_000 }),
		});
		const responses = await Promise.all([schedule("room-submission-a"), schedule("room-submission-b")]);
		expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
		expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM agenda_slots WHERE event_id = 'room-event'").first<{ count: number }>())?.count).toBe(1);
	});

	it("rejects a replayed room ticket at Durable Object storage and rejects a cross-event signed ticket at the worker boundary", async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('ticket-event-a', 'ticket-event-a', 'A', 'UTC', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('ticket-event-b', 'ticket-event-b', 'B', 'UTC', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES ('ticket-account', 'ticket@example.test', 'Ticket', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO event_memberships (id, event_id, account_id, role, created_at) VALUES ('ticket-member-a', 'ticket-event-a', 'ticket-account', 'admin', ?)").bind(now),
			env.DB.prepare("INSERT INTO event_memberships (id, event_id, account_id, role, created_at) VALUES ('ticket-member-b', 'ticket-event-b', 'ticket-account', 'admin', ?)").bind(now),
		]);
		const minted = await mintRoomTicket(env.AUTH_SECRET, { eventId: "ticket-event-a", eventSlug: "ticket-event-a", accountId: "ticket-account" });
		const room = env.EVENT_ROOM.getByName("ticket-event-a");
		const upgrade = () => room.fetch("https://event-room/", {
			headers: {
				Upgrade: "websocket",
				"x-ce-room-ticket-nonce": minted.ticket.nonce,
				"x-ce-room-ticket-exp": String(minted.ticket.exp),
			},
		});
		const first = await upgrade();
		expect(first.status).toBe(101);
		expect((await upgrade()).status).toBe(401);
		expect(await runInDurableObject(room, async (_instance, state) => state.storage.get<number>(`ticket:${minted.ticket.nonce}`))).toBe(minted.ticket.exp);

		const crossEvent = await SELF.fetch("https://conference-engine.test/api/admin/events/ticket-event-b/room", {
			headers: { Upgrade: "websocket", Cookie: `ce_room_ticket=${minted.token}` },
		});
		expect(crossEvent.status).toBe(401);
	});
});
