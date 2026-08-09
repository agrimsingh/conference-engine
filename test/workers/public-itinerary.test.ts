import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/cloudflare", () => ({ getDb: async () => env.DB }));

import { POST } from "@/app/api/e/[eventSlug]/itinerary/ics/route";
import { createEventWithDefaults } from "@/lib/events/create-event";
import type { AccountRow } from "@/lib/db/types";
import { approveSessionContent } from "./approve-content";

const now = 1_786_000_000_000;
let sequence = 0;

async function seedEvent(label: string) {
	sequence += 1;
	const owner: AccountRow = {
		id: `itinerary-owner-${sequence}`,
		email: `itinerary-owner-${sequence}@test.invalid`,
		name: "Owner",
		created_at: now,
		updated_at: now,
	};
	await env.DB.prepare("INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
		.bind(owner.id, owner.email, owner.name, now, now).run();
	return createEventWithDefaults(env.DB, {
		name: label,
		slug: `public-itinerary-${sequence}`,
		timezone: "UTC",
		startDay: "2026-08-10",
		endDay: "2026-08-11",
	}, owner);
}

async function addSession(args: {
	eventId: string;
	id: string;
	status: "published" | "scheduled";
	title: string;
	startsAt: string;
}) {
	const form = await env.DB.prepare("SELECT id FROM cfp_forms WHERE event_id = ? LIMIT 1")
		.bind(args.eventId).first<{ id: string }>();
	await env.DB.batch([
		env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
			.bind(args.id, form!.id, args.eventId, args.status, JSON.stringify({ title: args.title }), now, now),
		env.DB.prepare("INSERT INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES (?, ?, ?, 'Main', ?, ?, ?, ?, ?)")
			.bind(`${args.id}-slot`, args.eventId, args.id, Date.parse(args.startsAt), Date.parse(args.startsAt) + 1_800_000, `${args.id}@test.invalid`, now, now),
	]);
	if (args.status === "published") await approveSessionContent(args.eventId, args.id);
}

function request(eventSlug: string, sessionIds: string[]) {
	return POST(new Request(`https://example.test/api/e/${eventSlug}/itinerary/ics`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ sessionIds }),
	}), { params: Promise.resolve({ eventSlug }) });
}

describe("public itinerary calendar export", () => {
	it("rejects empty, unpublished, and cross-event selections", async () => {
		const first = await seedEvent("First event");
		const second = await seedEvent("Second event");
		await addSession({ eventId: first.eventId, id: "itinerary-hidden", status: "scheduled", title: "Hidden", startsAt: "2026-08-10T09:00:00Z" });
		await addSession({ eventId: second.eventId, id: "itinerary-other", status: "published", title: "Other event", startsAt: "2026-08-10T10:00:00Z" });

		expect((await request(first.slug, [])).status).toBe(400);
		expect((await request(first.slug, ["itinerary-hidden"])).status).toBe(404);
		expect((await request(first.slug, ["itinerary-other"])).status).toBe(404);
	});

	it("exports each selected published session once in chronological order", async () => {
		const created = await seedEvent("Calendar event");
		await addSession({ eventId: created.eventId, id: "itinerary-later", status: "published", title: "Later session", startsAt: "2026-08-11T11:00:00Z" });
		await addSession({ eventId: created.eventId, id: "itinerary-earlier", status: "published", title: "Earlier session", startsAt: "2026-08-10T09:00:00Z" });

		const response = await request(created.slug, ["itinerary-later", "itinerary-earlier", "itinerary-later"]);
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("text/calendar");
		const body = await response.text();
		expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(2);
		expect(body.indexOf("SUMMARY:Earlier session")).toBeLessThan(body.indexOf("SUMMARY:Later session"));
		expect(body).not.toContain("ATTENDEE");
	});

	it("exports 98, 99, and 100 sessions and rejects 101", async () => {
		const created = await seedEvent("Calendar boundary event");
		const form = await env.DB.prepare("SELECT id FROM cfp_forms WHERE event_id = ? LIMIT 1")
			.bind(created.eventId).first<{ id: string }>();
		const ids = Array.from({ length: 100 }, (_, index) => `itinerary-boundary-${index}`);
		await env.DB.batch(ids.flatMap((id, index) => {
			const revisionId = `${id}-revision`;
			const startsAt = Date.parse("2026-08-10T09:00:00Z") + index * 1_800_000;
			return [
				env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, content_status, created_at, updated_at) VALUES (?, ?, ?, 'published', ?, 'approved', ?, ?)")
					.bind(id, form!.id, created.eventId, JSON.stringify({ title: id }), now, now),
				env.DB.prepare("INSERT INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES (?, ?, ?, 'Main', ?, ?, ?, ?, ?)")
					.bind(`${id}-slot`, created.eventId, id, startsAt, startsAt + 1_800_000, `${id}@test.invalid`, now, now),
				env.DB.prepare("INSERT INTO content_revisions (id, event_id, entity_type, entity_id, revision_number, snapshot_json, editor_name, created_at) VALUES (?, ?, 'session', ?, 1, ?, 'Boundary seed', ?)")
					.bind(revisionId, created.eventId, id, JSON.stringify({ title: id }), now),
				env.DB.prepare("INSERT INTO content_heads (event_id, entity_type, entity_id, current_revision_id, approved_revision_id, updated_at) VALUES (?, 'session', ?, ?, ?, ?)")
					.bind(created.eventId, id, revisionId, revisionId, now),
			];
		}));
		for (const count of [98, 99, 100]) {
			const response = await request(created.slug, ids.slice(0, count));
			expect(response.status).toBe(200);
			expect((await response.text()).match(/BEGIN:VEVENT/g)).toHaveLength(count);
		}
		expect((await request(created.slug, [...ids, "itinerary-boundary-101"])).status).toBe(400);
	});
});
