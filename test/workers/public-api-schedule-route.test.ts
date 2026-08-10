import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/cloudflare", () => ({
	getDb: async () => env.DB,
	getCloudflareEnv: async () => env,
}));

import { GET as getSchedule } from "@/app/api/v1/events/[eventSlug]/schedule/route";
import { createEventWithDefaults } from "@/lib/events/create-event";
import { createSession } from "@/lib/sessions/session";

const now = 1_786_100_000_000;
const testEnv = env as CloudflareEnv & {
	PUBLIC_API_KEY_CROSS_EVENT?: string;
};

describe("v1 schedule API", () => {
	it("returns only approved published sessions from their approved snapshots", async () => {
		env.PUBLIC_API_KEY = "schedule-api-test-key";
		testEnv.PUBLIC_API_KEY_CROSS_EVENT = "true";
		const event = await createEventWithDefaults(
			env.DB,
			{
				name: "Schedule API approval",
				slug: "schedule-api-approval",
				timezone: "UTC",
				startDay: "2026-12-02",
				endDay: "2026-12-02",
			},
			null,
		);
		const approved = await createSession(env.DB, {
			eventId: event.eventId,
			origin: "manual",
			input: { title: "Unapproved draft title" },
		});
		const unapproved = await createSession(env.DB, {
			eventId: event.eventId,
			origin: "manual",
			input: { title: "Published without approval" },
		});
		await env.DB.batch([
			env.DB
				.prepare("UPDATE submissions SET status = 'published' WHERE id IN (?, ?)")
				.bind(approved.id, unapproved.id),
			env.DB
				.prepare(
					"INSERT INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES (?, ?, ?, 'Main', ?, ?, ?, ?, ?)",
				)
				.bind(
					"schedule-api-approved-slot",
					event.eventId,
					approved.id,
					now,
					now + 1_800_000,
					"schedule-api-approved@test.invalid",
					now,
					now,
				),
			env.DB
				.prepare(
					"INSERT INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES (?, ?, ?, 'Main', ?, ?, ?, ?, ?)",
				)
				.bind(
					"schedule-api-unapproved-slot",
					event.eventId,
					unapproved.id,
					now + 3_600_000,
					now + 5_400_000,
					"schedule-api-unapproved@test.invalid",
					now,
					now,
				),
			env.DB
				.prepare(
					"INSERT INTO content_revisions (id, event_id, entity_type, entity_id, revision_number, snapshot_json, editor_name, created_at) VALUES (?, ?, 'session', ?, 1, ?, 'Schedule API test', ?)",
				)
				.bind(
					"schedule-api-approved-revision",
					event.eventId,
					approved.id,
					JSON.stringify({ title: "Approved snapshot title" }),
					now,
				),
			env.DB
				.prepare(
					"INSERT INTO content_heads (event_id, entity_type, entity_id, current_revision_id, approved_revision_id, updated_at) VALUES (?, 'session', ?, ?, ?, ?)",
				)
				.bind(
					event.eventId,
					approved.id,
					"schedule-api-approved-revision",
					"schedule-api-approved-revision",
					now,
				),
		]);

		const response = await getSchedule(
			new Request(
				`https://conference.example.test/api/v1/events/${event.slug}/schedule`,
				{ headers: { authorization: "Bearer schedule-api-test-key" } },
			),
			{ params: Promise.resolve({ eventSlug: event.slug }) },
		);

		expect(response.status).toBe(200);
		const body = await response.json<{
			slots: Array<{ id: string; title: string }>;
		}>();
		expect(
			body.slots.map((slot) => ({ id: slot.id, title: slot.title })),
		).toEqual([
			{
				id: "schedule-api-approved-slot",
				title: "Approved snapshot title",
			},
		]);
	});
});
