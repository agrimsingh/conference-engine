import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorizeWritableEventAdminApi: vi.fn() }));

vi.mock("@/lib/auth/admin", () => ({ authorizeWritableEventAdminApi: mocks.authorizeWritableEventAdminApi }));
vi.mock("@/lib/db/cloudflare", () => ({ getDb: async () => env.DB, getCloudflareEnv: async () => env }));

import { POST } from "@/app/api/admin/events/[eventSlug]/submissions/[submissionId]/schedule/route";

const now = 1_780_400_000_000;
const event = {
	id: "schedule-route-event",
	slug: "schedule-route-event",
	name: "Schedule route",
	timezone: "UTC",
	start_day: "2026-05-29",
	end_day: "2026-05-29",
	day_start_minutes: 540,
	day_end_minutes: 1080,
	slot_duration_minutes: 30,
	track_conflict_policy: "hard" as const,
	mode: "live" as const,
	created_at: now,
	updated_at: now,
};

describe("schedule mutation route", () => {
	it("preserves an existing track when a board move omits trackId", async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, start_day, end_day, day_start_minutes, day_end_minutes, slot_duration_minutes, track_conflict_policy, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(event.id, event.slug, event.name, event.timezone, event.start_day, event.end_day, event.day_start_minutes, event.day_end_minutes, event.slot_duration_minutes, event.track_conflict_policy, now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('schedule-route-form', ?, 'cfp', 'CFP', 'open', ?, ?)").bind(event.id, now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('schedule-route-submission', 'schedule-route-form', ?, 'scheduled', '{}', ?, ?)").bind(event.id, now, now),
			env.DB.prepare("INSERT INTO event_rooms (id, event_id, name, position, created_at, updated_at) VALUES ('schedule-route-room', ?, 'Main', 0, ?, ?)").bind(event.id, now, now),
			env.DB.prepare("INSERT INTO agenda_tracks (id, event_id, name, slug, position, created_at, updated_at) VALUES ('schedule-route-track', ?, 'Agents', 'agents', 0, ?, ?)").bind(event.id, now, now),
			env.DB.prepare("INSERT INTO agenda_tracks (id, event_id, name, slug, position, created_at, updated_at) VALUES ('schedule-route-track-b', ?, 'Platform', 'platform', 1, ?, ?)").bind(event.id, now, now),
			env.DB.prepare("INSERT INTO agenda_slots (id, event_id, submission_id, room_id, track_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES ('schedule-route-slot', ?, 'schedule-route-submission', 'schedule-route-room', 'schedule-route-track', 'Main', ?, ?, 'schedule-route@example.test', ?, ?)").bind(event.id, Date.parse("2026-05-29T10:00:00Z"), Date.parse("2026-05-29T10:30:00Z"), now, now),
		]);
		mocks.authorizeWritableEventAdminApi.mockResolvedValue({ ok: true, access: { event, account: null, membership: null } });

		const request = (body: Record<string, unknown>) => POST(
			new Request("https://conference.example.test/api/admin/events/schedule-route-event/submissions/schedule-route-submission/schedule", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			}),
			{ params: Promise.resolve({ eventSlug: event.slug, submissionId: "schedule-route-submission" }) },
		);

		// This is the board's ordinary move shape: no trackId means preserve it.
		const preserved = await request({ startsAt: "2026-05-29T11:00:00Z", endsAt: "2026-05-29T11:30:00Z", roomName: "Main" });
		expect(preserved.status).toBe(200);
		expect(await preserved.json()).toMatchObject({ ok: true, slot: { track_id: "schedule-route-track" } });

		const assigned = await request({ startsAt: "2026-05-29T11:30:00Z", endsAt: "2026-05-29T12:00:00Z", roomName: "Main", trackId: "schedule-route-track-b" });
		expect(assigned.status).toBe(200);
		expect(await assigned.json()).toMatchObject({ ok: true, slot: { track_id: "schedule-route-track-b" } });

		const cleared = await request({ startsAt: "2026-05-29T12:00:00Z", endsAt: "2026-05-29T12:30:00Z", roomName: "Main", trackId: null });
		expect(cleared.status).toBe(200);
		expect(await cleared.json()).toMatchObject({ ok: true, slot: { track_id: null } });

		const unknown = await request({ startsAt: "2026-05-29T12:30:00Z", endsAt: "2026-05-29T13:00:00Z", roomName: "Main", trackId: "missing-track" });
		expect(unknown.status).toBe(400);
		expect(await unknown.json()).toMatchObject({ ok: false, error: "Choose an active agenda track" });

		const invalid = await request({ startsAt: "2026-05-29T12:30:00Z", endsAt: "2026-05-29T13:00:00Z", roomName: "Main", trackId: 42 });
		expect(invalid.status).toBe(400);
		expect(await invalid.json()).toMatchObject({ ok: false, error: "trackId must be a string or null" });
		expect(await env.DB.prepare("SELECT track_id, starts_at FROM agenda_slots WHERE id = 'schedule-route-slot'").first()).toEqual({ track_id: null, starts_at: Date.parse("2026-05-29T12:00:00Z") });
	});

	it("rejects an explicit unknown track when this event has no active tracks", async () => {
		const noTracksEvent = { ...event, id: "schedule-route-no-tracks", slug: "schedule-route-no-tracks", name: "No tracks" };
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, start_day, end_day, day_start_minutes, day_end_minutes, slot_duration_minutes, track_conflict_policy, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(noTracksEvent.id, noTracksEvent.slug, noTracksEvent.name, noTracksEvent.timezone, noTracksEvent.start_day, noTracksEvent.end_day, noTracksEvent.day_start_minutes, noTracksEvent.day_end_minutes, noTracksEvent.slot_duration_minutes, noTracksEvent.track_conflict_policy, now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('schedule-route-no-tracks-form', ?, 'cfp', 'CFP', 'open', ?, ?)").bind(noTracksEvent.id, now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('schedule-route-no-tracks-submission', 'schedule-route-no-tracks-form', ?, 'accepted', '{}', ?, ?)").bind(noTracksEvent.id, now, now),
			env.DB.prepare("INSERT INTO event_rooms (id, event_id, name, position, created_at, updated_at) VALUES ('schedule-route-no-tracks-room', ?, 'Main', 0, ?, ?)").bind(noTracksEvent.id, now, now),
		]);
		mocks.authorizeWritableEventAdminApi.mockResolvedValue({ ok: true, access: { event: noTracksEvent, account: null, membership: null } });

		const response = await POST(
			new Request("https://conference.example.test/api/admin/events/schedule-route-no-tracks/submissions/schedule-route-no-tracks-submission/schedule", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ startsAt: "2026-05-29T10:00:00Z", endsAt: "2026-05-29T10:30:00Z", roomName: "Main", trackId: "missing-track" }),
			}),
			{ params: Promise.resolve({ eventSlug: noTracksEvent.slug, submissionId: "schedule-route-no-tracks-submission" }) },
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ ok: false, error: "Choose an active agenda track" });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM agenda_slots WHERE event_id = ?").bind(noTracksEvent.id).first()).toEqual({ count: 0 });
	});
});
