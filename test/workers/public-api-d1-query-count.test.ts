import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireV1ReadAccess: vi.fn() }));

vi.mock("@/lib/auth/public-api", () => ({
	requireV1ReadAccess: mocks.requireV1ReadAccess,
}));

vi.mock("@/lib/db/cloudflare", () => ({
	getDb: async () => env.DB,
}));

import { GET as getSubmissions } from "@/app/api/v1/events/[eventSlug]/submissions/route";
import { GET as getSchedule } from "@/app/api/v1/events/[eventSlug]/schedule/route";

const now = 1_786_000_000_000;
let sequence = 0;

type PreparedStatementSpy = {
	readonly mock: {
		readonly calls: ReadonlyArray<readonly [query: string, ...args: readonly unknown[]]>;
	};
};

beforeEach(() => {
	mocks.requireV1ReadAccess.mockResolvedValue({ ok: true });
});

async function seedEvent(): Promise<{ eventId: string; slug: string; formId: string }> {
	sequence += 1;
	const eventId = `public-api-query-count-event-${sequence}`;
	const slug = `public-api-query-count-${sequence}`;
	const formId = `public-api-query-count-form-${sequence}`;
	await env.DB.batch([
		env.DB.prepare(
			"INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES (?, ?, ?, 'UTC', ?, ?)",
		).bind(eventId, slug, `Public API query count ${sequence}`, now, now),
		env.DB.prepare(
			"INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES (?, ?, 'cfp', 'CFP', 'open', ?, ?)",
		).bind(formId, eventId, now, now),
	]);
	return { eventId, slug, formId };
}

function countSpeakerQueries(prepare: PreparedStatementSpy): number {
	return prepare.mock.calls.filter(([query]) =>
		query.includes("FROM submission_speakers"),
	).length;
}

describe("v1 public API speaker query count", () => {
	it("Given two submissions, when the submissions route responds, then D1 performs one bounded speaker query", async () => {
		const event = await seedEvent();
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('public-api-query-count-submission-a', ?, ?, 'submitted', ?, ?, ?)",
			).bind(event.formId, event.eventId, JSON.stringify({ title: "First" }), now, now),
			env.DB.prepare(
				"INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('public-api-query-count-submission-b', ?, ?, 'accepted', ?, ?, ?)",
			).bind(event.formId, event.eventId, JSON.stringify({ title: "Second" }), now, now),
			env.DB.prepare(
				"INSERT INTO submission_speakers (id, submission_id, name, email, status, position, added_after_acceptance) VALUES ('public-api-query-count-speaker-a', 'public-api-query-count-submission-a', 'Ari', 'ari@example.test', 'confirmed', 0, 0)",
			),
			env.DB.prepare(
				"INSERT INTO submission_speakers (id, submission_id, name, email, status, position, added_after_acceptance) VALUES ('public-api-query-count-speaker-b', 'public-api-query-count-submission-b', 'Bea', 'bea@example.test', 'confirmed', 0, 0)",
			),
		]);
		const prepare = vi.spyOn(env.DB, "prepare");

		try {
			const response = await getSubmissions(
				new Request(`https://example.test/api/v1/events/${event.slug}/submissions`),
				{ params: Promise.resolve({ eventSlug: event.slug }) },
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("Cache-Control")).toBeNull();
			expect(await response.json()).toMatchObject({
				submissions: expect.arrayContaining([
					expect.objectContaining({ id: "public-api-query-count-submission-a", speakers: [expect.objectContaining({ name: "Ari" })] }),
					expect.objectContaining({ id: "public-api-query-count-submission-b", speakers: [expect.objectContaining({ name: "Bea" })] }),
				]),
			});
			expect(countSpeakerQueries(prepare)).toBe(1);
		} finally {
			prepare.mockRestore();
		}
	});

	it("Given two published slots, when the schedule route responds, then D1 performs one bounded speaker query", async () => {
		const event = await seedEvent();
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('public-api-query-count-schedule-a', ?, ?, 'published', ?, ?, ?)",
			).bind(event.formId, event.eventId, JSON.stringify({ title: "First schedule talk" }), now, now),
			env.DB.prepare(
				"INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('public-api-query-count-schedule-b', ?, ?, 'published', ?, ?, ?)",
			).bind(event.formId, event.eventId, JSON.stringify({ title: "Second schedule talk" }), now, now),
			env.DB.prepare(
				"INSERT INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES ('public-api-query-count-slot-a', ?, 'public-api-query-count-schedule-a', 'Main', ?, ?, 'slot-a@example.test', ?, ?)",
			).bind(event.eventId, now, now + 1_800_000, now, now),
			env.DB.prepare(
				"INSERT INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES ('public-api-query-count-slot-b', ?, 'public-api-query-count-schedule-b', 'Main', ?, ?, 'slot-b@example.test', ?, ?)",
			).bind(event.eventId, now + 1_800_000, now + 3_600_000, now, now),
			env.DB.prepare(
				"INSERT INTO content_revisions (id, event_id, entity_type, entity_id, revision_number, snapshot_json, editor_name, created_at) VALUES ('public-api-query-count-revision-a', ?, 'session', 'public-api-query-count-schedule-a', 1, ?, 'Query count test', ?)",
			).bind(event.eventId, JSON.stringify({ title: "First schedule talk" }), now),
			env.DB.prepare(
				"INSERT INTO content_revisions (id, event_id, entity_type, entity_id, revision_number, snapshot_json, editor_name, created_at) VALUES ('public-api-query-count-revision-b', ?, 'session', 'public-api-query-count-schedule-b', 1, ?, 'Query count test', ?)",
			).bind(event.eventId, JSON.stringify({ title: "Second schedule talk" }), now),
			env.DB.prepare(
				"INSERT INTO content_heads (event_id, entity_type, entity_id, current_revision_id, approved_revision_id, updated_at) VALUES (?, 'session', 'public-api-query-count-schedule-a', 'public-api-query-count-revision-a', 'public-api-query-count-revision-a', ?)",
			).bind(event.eventId, now),
			env.DB.prepare(
				"INSERT INTO content_heads (event_id, entity_type, entity_id, current_revision_id, approved_revision_id, updated_at) VALUES (?, 'session', 'public-api-query-count-schedule-b', 'public-api-query-count-revision-b', 'public-api-query-count-revision-b', ?)",
			).bind(event.eventId, now),
			env.DB.prepare(
				"INSERT INTO submission_speakers (id, submission_id, name, email, status, position, added_after_acceptance) VALUES ('public-api-query-count-schedule-speaker-a', 'public-api-query-count-schedule-a', 'Ari', 'ari@example.test', 'confirmed', 0, 0)",
			),
			env.DB.prepare(
				"INSERT INTO submission_speakers (id, submission_id, name, email, status, position, added_after_acceptance) VALUES ('public-api-query-count-schedule-speaker-b', 'public-api-query-count-schedule-b', 'Bea', 'bea@example.test', 'confirmed', 0, 0)",
			),
		]);
		const prepare = vi.spyOn(env.DB, "prepare");

		try {
			const response = await getSchedule(
				new Request(`https://example.test/api/v1/events/${event.slug}/schedule`),
				{ params: Promise.resolve({ eventSlug: event.slug }) },
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("Cache-Control")).toBeNull();
			expect(await response.json()).toMatchObject({
				slots: [
					{ id: "public-api-query-count-slot-a", speakers: [{ name: "Ari" }] },
					{ id: "public-api-query-count-slot-b", speakers: [{ name: "Bea" }] },
				],
			});
			expect(countSpeakerQueries(prepare)).toBe(1);
		} finally {
			prepare.mockRestore();
		}
	});
});
