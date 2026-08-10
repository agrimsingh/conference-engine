import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/cloudflare", () => ({
	getDb: async () => env.DB,
	getCloudflareEnv: async () => env,
}));

import { GET } from "@/app/api/e/[eventSlug]/schedule.ics/route";
import { createEventWithDefaults } from "@/lib/events/create-event";
import type { AccountRow } from "@/lib/db/types";
import { approveSessionContent } from "./approve-content";

const now = 1_786_100_000_000;
let sequence = 0;

async function seedEvent(label: string) {
	sequence += 1;
	const owner: AccountRow = {
		id: `schedule-ics-owner-${sequence}`,
		email: `schedule-ics-owner-${sequence}@test.invalid`,
		name: "Owner",
		created_at: now,
		updated_at: now,
	};
	await env.DB.prepare(
		"INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
	)
		.bind(owner.id, owner.email, owner.name, now, now)
		.run();
	return createEventWithDefaults(
		env.DB,
		{
			name: label,
			slug: `public-schedule-ics-${sequence}`,
			timezone: "UTC",
			startDay: "2026-08-10",
			endDay: "2026-08-11",
		},
		owner,
	);
}

async function addSession(args: {
	eventId: string;
	id: string;
	status: "published" | "scheduled";
	title: string;
	startsAt: string;
	sequence?: number;
}) {
	const form = await env.DB.prepare("SELECT id FROM cfp_forms WHERE event_id = ? LIMIT 1")
		.bind(args.eventId)
		.first<{ id: string }>();
	await env.DB.batch([
		env.DB.prepare(
			"INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		).bind(
			args.id,
			form!.id,
			args.eventId,
			args.status,
			JSON.stringify({ title: args.title }),
			now,
			now,
		),
		env.DB.prepare(
			"INSERT INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES (?, ?, ?, 'Main', ?, ?, ?, ?, ?)",
		).bind(
			`${args.id}-slot`,
			args.eventId,
			args.id,
			Date.parse(args.startsAt),
			Date.parse(args.startsAt) + 1_800_000,
			`${args.id}@test.invalid`,
			now,
			now,
		),
		env.DB.prepare(
			"INSERT INTO agenda_calendar_lifecycles (event_id, submission_id, ics_uid, sequence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		).bind(
			args.eventId,
			args.id,
			`${args.id}@test.invalid`,
			args.sequence ?? 0,
			now,
			now,
		),
	]);
	if (args.status === "published") await approveSessionContent(args.eventId, args.id);
}

function request(eventSlug: string) {
	return GET(new Request(`https://example.test/api/e/${eventSlug}/schedule.ics`), {
		params: Promise.resolve({ eventSlug }),
	});
}

describe("public schedule.ics feed", () => {
	it("returns only published sessions with stable UID and SEQUENCE", async () => {
		const created = await seedEvent("Schedule ICS event");
		await addSession({
			eventId: created.eventId,
			id: "schedule-ics-hidden",
			status: "scheduled",
			title: "Hidden draft",
			startsAt: "2026-08-10T08:00:00Z",
			sequence: 9,
		});
		await addSession({
			eventId: created.eventId,
			id: "schedule-ics-later",
			status: "published",
			title: "Later talk",
			startsAt: "2026-08-11T11:00:00Z",
			sequence: 3,
		});
		await addSession({
			eventId: created.eventId,
			id: "schedule-ics-earlier",
			status: "published",
			title: "Earlier talk",
			startsAt: "2026-08-10T09:00:00Z",
			sequence: 2,
		});

		const response = await request(created.slug);
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("text/calendar");
		expect(response.headers.get("Content-Type")).toContain("method=PUBLISH");
		const body = await response.text();
		expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(2);
		expect(body).toContain("METHOD:PUBLISH");
		expect(body).toContain("UID:schedule-ics-earlier@test.invalid");
		expect(body).toContain("SEQUENCE:2");
		expect(body).toContain("UID:schedule-ics-later@test.invalid");
		expect(body).toContain("SEQUENCE:3");
		expect(body).not.toContain("Hidden draft");
		expect(body).not.toContain("schedule-ics-hidden@test.invalid");
		expect(body).not.toContain("ATTENDEE");
		expect(body.indexOf("SUMMARY:Earlier talk")).toBeLessThan(body.indexOf("SUMMARY:Later talk"));
	});

	it("404s unknown events and returns an empty PUBLISH calendar for events with no published sessions", async () => {
		const created = await seedEvent("Empty schedule ICS");
		await addSession({
			eventId: created.eventId,
			id: "schedule-ics-only-scheduled",
			status: "scheduled",
			title: "Not public",
			startsAt: "2026-08-10T09:00:00Z",
		});

		expect((await request("missing-schedule-ics-event")).status).toBe(404);

		const response = await request(created.slug);
		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain("METHOD:PUBLISH");
		expect(body.match(/BEGIN:VEVENT/g)).toBeNull();
		expect(body).not.toContain("Not public");
	});
});
