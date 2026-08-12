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

function configuration(room: DurableObjectStub, eventId: string, body: Record<string, unknown>): Promise<Response> {
	return room.fetch("https://event-room/configuration", {
		method: "POST",
		headers: { "content-type": "application/json", "x-ce-event-id": eventId },
		body: JSON.stringify(body),
	});
}

describe("EventRoom in the Workers runtime", () => {
	it("rejects demo-event schedule writes without changing agenda state", async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES ('demo-room-event', 'demo-room-event', 'Demo room event', 'UTC', 'demo', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('demo-room-form', 'demo-room-event', 'cfp', 'CFP', 'closed', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('demo-room-submission', 'demo-room-form', 'demo-room-event', 'accepted', '{}', ?, ?)").bind(now, now),
		]);
		const room = env.EVENT_ROOM.getByName("demo-room-event");
		const place = await room.fetch("https://event-room/schedule", {
			method: "POST",
			headers: { "content-type": "application/json", "x-ce-event-id": "demo-room-event" },
			body: JSON.stringify({ submissionId: "demo-room-submission", roomName: "Main", startsAtMs: now, endsAtMs: now + 3_600_000 }),
		});
		const action = (method: "PATCH" | "DELETE", body: Record<string, unknown>) => room.fetch("https://event-room/schedule", {
			method,
			headers: { "content-type": "application/json", "x-ce-event-id": "demo-room-event" },
			body: JSON.stringify({ submissionId: "demo-room-submission", ...body }),
		});
		const responses = await Promise.all([
			Promise.resolve(place),
			configuration(room, "demo-room-event", { action: "event-settings", input: { name: "Changed demo", startDay: "2026-05-29", endDay: "2026-05-29", timezone: "UTC", dayStartMinutes: 540, dayEndMinutes: 1080, slotDurationMinutes: 30 } }),
			action("PATCH", { action: "publish" }),
			action("PATCH", { action: "unpublish" }),
			action("DELETE", {}),
			room.fetch("https://event-room/schedule", {
				method: "POST",
				headers: { "content-type": "application/json", "x-ce-event-id": "demo-room-event" },
				body: JSON.stringify({ submissionId: "demo-room-submission", roomName: "Moved", startsAtMs: now + 3_600_000, endsAtMs: now + 7_200_000 }),
			}),
		]);
		expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403, 403, 403]);
		expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM agenda_slots WHERE event_id = 'demo-room-event'").first<{ count: number }>())?.count).toBe(0);
		expect(await env.DB.prepare("SELECT name FROM events WHERE id = 'demo-room-event'").first()).toEqual({ name: "Demo room event" });
	});

	it("serializes concurrent conflicting schedule requests so only one can commit", async () => {
		await seedScheduleEvent();
		const room = env.EVENT_ROOM.getByName("room-event");
		const schedule = (submissionId: string) => room.fetch("https://event-room/schedule", {
			method: "POST",
			headers: { "content-type": "application/json", "x-ce-event-id": "room-event" },
			body: JSON.stringify({ submissionId, roomName: "Main", startsAtMs: Date.parse("2026-05-29T10:00:00Z"), endsAtMs: Date.parse("2026-05-29T11:00:00Z") }),
		});
		const responses = await Promise.all([schedule("room-submission-a"), schedule("room-submission-b")]);
		expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
		expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM agenda_slots WHERE event_id = 'room-event'").first<{ count: number }>())?.count).toBe(1);
	});

	it("keeps one calendar UID and strictly increments durable revisions through update and unplace", async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('calendar-room-event', 'calendar-room-event', 'Calendar', 'UTC', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('calendar-room-form', 'calendar-room-event', 'cfp', 'CFP', 'open', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('calendar-room-submission', 'calendar-room-form', 'calendar-room-event', 'accepted', '{}', ?, ?)").bind(now, now),
		]);
		const room = env.EVENT_ROOM.getByName("calendar-room-event");
		const start = Date.parse("2026-05-29T10:00:00Z");
		const schedule = (startsAtMs: number) => room.fetch("https://event-room/schedule", { method: "POST", headers: { "content-type": "application/json", "x-ce-event-id": "calendar-room-event" }, body: JSON.stringify({ submissionId: "calendar-room-submission", roomName: "Main", startsAtMs, endsAtMs: startsAtMs + 1_800_000 }) });
		const first = await schedule(start);
		expect(first.status).toBe(200);
		const firstBody = await first.json() as { slot: { ics_uid: string; calendar_sequence: number; rescheduled?: boolean } };
		expect(firstBody.slot.calendar_sequence).toBe(0);
		expect(firstBody.slot.rescheduled).toBe(false);
		const update = await schedule(start + 3_600_000);
		const updateBody = await update.json() as { slot: { ics_uid: string; calendar_sequence: number; rescheduled?: boolean } };
		expect(updateBody.slot).toMatchObject({ ics_uid: firstBody.slot.ics_uid, calendar_sequence: 1, rescheduled: true });
		expect(await env.DB.prepare("SELECT ack_required FROM agenda_slots WHERE submission_id = 'calendar-room-submission'").first()).toEqual({ ack_required: 1 });
		const unplace = await room.fetch("https://event-room/schedule", { method: "DELETE", headers: { "content-type": "application/json", "x-ce-event-id": "calendar-room-event" }, body: JSON.stringify({ submissionId: "calendar-room-submission" }) });
		const unplaceBody = await unplace.json() as { slot: { ics_uid: string; calendar_sequence: number } };
		expect(unplaceBody.slot).toMatchObject({ ics_uid: firstBody.slot.ics_uid, calendar_sequence: 2 });
		expect(unplaceBody.slot.ics_uid).toBe(firstBody.slot.ics_uid);
		expect(unplaceBody.slot.calendar_sequence).toBe(2);
		expect(await env.DB.prepare("SELECT sequence FROM agenda_calendar_lifecycles WHERE submission_id = 'calendar-room-submission'").first()).toEqual({ sequence: 2 });
	});

	it("persists active tracks and blocks same-track overlaps when the policy is hard", async () => {
		const start = Date.parse("2026-05-29T10:00:00Z");
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, track_conflict_policy, created_at, updated_at) VALUES ('track-room-event', 'track-room-event', 'Track room', 'UTC', 'hard', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('track-room-form', 'track-room-event', 'cfp', 'CFP', 'open', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('track-room-a', 'track-room-form', 'track-room-event', 'accepted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('track-room-b', 'track-room-form', 'track-room-event', 'accepted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO event_rooms (id, event_id, name, position, created_at, updated_at) VALUES ('track-room-main', 'track-room-event', 'Main', 0, ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO event_rooms (id, event_id, name, position, created_at, updated_at) VALUES ('track-room-side', 'track-room-event', 'Side', 1, ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO agenda_tracks (id, event_id, name, slug, position, created_at, updated_at) VALUES ('track-room-general', 'track-room-event', 'General', 'general', 0, ?, ?)").bind(now, now),
		]);
		const room = env.EVENT_ROOM.getByName("track-room-event");
		const schedule = (submissionId: string, roomName: string) => room.fetch("https://event-room/schedule", { method: "POST", headers: { "content-type": "application/json", "x-ce-event-id": "track-room-event" }, body: JSON.stringify({ submissionId, roomName, trackId: "track-room-general", startsAtMs: start, endsAtMs: start + 3_600_000 }) });
		expect((await schedule("track-room-a", "Main")).status).toBe(200);
		expect((await schedule("track-room-b", "Side")).status).toBe(409);
		expect(await env.DB.prepare("SELECT track_id FROM agenda_slots WHERE submission_id = 'track-room-a'").first()).toEqual({ track_id: "track-room-general" });
	});

	it("renames rooms atomically, preserves room identity, and keeps conflicts attached to the renamed room", async () => {
		const start = Date.parse("2026-05-29T10:00:00Z");
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('rename-room-event', 'rename-room-event', 'Rename room', 'UTC', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('rename-room-form', 'rename-room-event', 'cfp', 'CFP', 'open', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('rename-room-a', 'rename-room-form', 'rename-room-event', 'accepted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('rename-room-b', 'rename-room-form', 'rename-room-event', 'accepted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO event_rooms (id, event_id, name, position, created_at, updated_at) VALUES ('rename-room-main', 'rename-room-event', 'Main', 0, ?, ?)").bind(now, now),
		]);
		const room = env.EVENT_ROOM.getByName("rename-room-event");
		const schedule = (submissionId: string, roomName: string) => room.fetch("https://event-room/schedule", { method: "POST", headers: { "content-type": "application/json", "x-ce-event-id": "rename-room-event" }, body: JSON.stringify({ submissionId, roomName, startsAtMs: start, endsAtMs: start + 3_600_000 }) });
		expect((await schedule("rename-room-a", "Main")).status).toBe(200);
		expect((await configuration(room, "rename-room-event", { action: "room-update", id: "rename-room-main", name: "Grand Hall" })).status).toBe(200);
		expect(await env.DB.prepare("SELECT room_id, room_name FROM agenda_slots WHERE submission_id = 'rename-room-a'").first()).toEqual({ room_id: "rename-room-main", room_name: "Grand Hall" });
		expect((await schedule("rename-room-b", "Grand Hall")).status).toBe(409);
	});

	it("preserves a session track when moving it unless the request explicitly reassigns it", async () => {
		const start = Date.parse("2026-05-29T10:00:00Z");
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('move-track-event', 'move-track-event', 'Move track', 'UTC', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('move-track-form', 'move-track-event', 'cfp', 'CFP', 'open', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('move-track-submission', 'move-track-form', 'move-track-event', 'accepted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO event_rooms (id, event_id, name, position, created_at, updated_at) VALUES ('move-track-room', 'move-track-event', 'Main', 0, ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO agenda_tracks (id, event_id, name, slug, position, created_at, updated_at) VALUES ('move-track-a', 'move-track-event', 'Agents', 'agents', 0, ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO agenda_tracks (id, event_id, name, slug, position, created_at, updated_at) VALUES ('move-track-b', 'move-track-event', 'Platform', 'platform', 1, ?, ?)").bind(now, now),
		]);
		const room = env.EVENT_ROOM.getByName("move-track-event");
		const schedule = (body: Record<string, unknown>) => room.fetch("https://event-room/schedule", { method: "POST", headers: { "content-type": "application/json", "x-ce-event-id": "move-track-event" }, body: JSON.stringify({ submissionId: "move-track-submission", roomName: "Main", startsAtMs: start, endsAtMs: start + 1_800_000, ...body }) });
		expect((await schedule({ trackId: "move-track-a" })).status).toBe(200);
		expect((await schedule({ startsAtMs: start + 3_600_000, endsAtMs: start + 5_400_000 })).status).toBe(200);
		expect(await env.DB.prepare("SELECT track_id FROM agenda_slots WHERE submission_id = 'move-track-submission'").first()).toEqual({ track_id: "move-track-a" });
		expect((await schedule({ startsAtMs: start + 7_200_000, endsAtMs: start + 9_000_000, trackId: "move-track-b" })).status).toBe(200);
		expect(await env.DB.prepare("SELECT track_id FROM agenda_slots WHERE submission_id = 'move-track-submission'").first()).toEqual({ track_id: "move-track-b" });
	});

	it("serializes settings validation and room retirement with schedule writes", async () => {
		const start = Date.parse("2026-05-29T09:00:00Z");
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, start_day, end_day, day_start_minutes, day_end_minutes, slot_duration_minutes, created_at, updated_at) VALUES ('settings-race-event', 'settings-race-event', 'Settings race', 'UTC', '2026-05-29', '2026-05-29', 540, 1080, 30, ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('settings-race-form', 'settings-race-event', 'cfp', 'CFP', 'open', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('settings-race-submission', 'settings-race-form', 'settings-race-event', 'accepted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO event_rooms (id, event_id, name, position, created_at, updated_at) VALUES ('settings-race-main', 'settings-race-event', 'Main', 0, ?, ?)").bind(now, now),
		]);
		const room = env.EVENT_ROOM.getByName("settings-race-event");
		const [scheduleResponse, settingsResponse] = await Promise.all([
			room.fetch("https://event-room/schedule", { method: "POST", headers: { "content-type": "application/json", "x-ce-event-id": "settings-race-event" }, body: JSON.stringify({ submissionId: "settings-race-submission", roomName: "Main", startsAtMs: start, endsAtMs: start + 1_800_000 }) }),
			configuration(room, "settings-race-event", { action: "event-settings", input: { name: "Settings race", startDay: "2026-05-29", endDay: "2026-05-29", timezone: "UTC", dayStartMinutes: 600, dayEndMinutes: 1080, slotDurationMinutes: 30 } }),
		]);
		expect([scheduleResponse.status, settingsResponse.status].sort()).toEqual([200, 400]);
		const [slot, event] = await Promise.all([
			env.DB.prepare("SELECT COUNT(*) AS count FROM agenda_slots WHERE event_id = 'settings-race-event'").first<{ count: number }>(),
			env.DB.prepare("SELECT day_start_minutes FROM events WHERE id = 'settings-race-event'").first<{ day_start_minutes: number }>(),
		]);
		expect([{ slots: 1, dayStart: 540 }, { slots: 0, dayStart: 600 }]).toContainEqual({ slots: slot?.count, dayStart: event?.day_start_minutes });

		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('delete-race-event', 'delete-race-event', 'Delete race', 'UTC', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('delete-race-form', 'delete-race-event', 'cfp', 'CFP', 'open', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('delete-race-submission', 'delete-race-form', 'delete-race-event', 'accepted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO event_rooms (id, event_id, name, position, created_at, updated_at) VALUES ('delete-race-main', 'delete-race-event', 'Main', 0, ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO event_rooms (id, event_id, name, position, created_at, updated_at) VALUES ('delete-race-side', 'delete-race-event', 'Side', 1, ?, ?)").bind(now, now),
		]);
		const deleteRoom = env.EVENT_ROOM.getByName("delete-race-event");
		const [placeResponse, deleteResponse] = await Promise.all([
			deleteRoom.fetch("https://event-room/schedule", { method: "POST", headers: { "content-type": "application/json", "x-ce-event-id": "delete-race-event" }, body: JSON.stringify({ submissionId: "delete-race-submission", roomName: "Main", startsAtMs: start, endsAtMs: start + 1_800_000 }) }),
			configuration(deleteRoom, "delete-race-event", { action: "room-delete", id: "delete-race-main" }),
		]);
		const [placed, retired] = await Promise.all([
			env.DB.prepare("SELECT COUNT(*) AS count FROM agenda_slots WHERE event_id = 'delete-race-event'").first<{ count: number }>(),
			env.DB.prepare("SELECT soft_deleted FROM event_rooms WHERE id = 'delete-race-main'").first<{ soft_deleted: number }>(),
		]);
		expect([[200, 400], [400, 200]]).toContainEqual([placeResponse.status, deleteResponse.status]);
		expect([{ slots: 1, retired: 0 }, { slots: 0, retired: 1 }]).toContainEqual({ slots: placed?.count, retired: retired?.soft_deleted });
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
