import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/cloudflare", () => ({
	getDb: async () => env.DB,
	getCloudflareEnv: async () => env,
}));

import { GET as getPublicScheduleJson } from "@/app/api/e/[eventSlug]/schedule/route";
import { PATCH as patchAirtableSync } from "@/app/api/admin/events/[eventSlug]/export/airtable/sync/route";
import { createEventWithDefaults } from "@/lib/events/create-event";
import {
	getAirtableSyncEnabled,
	setAirtableSyncEnabled,
	syncOptInEventsToAirtable,
} from "@/lib/export/airtable-sync";
import {
	buildPublicScheduleJson,
	publicScheduleJsonContainsPii,
} from "@/lib/schedule/public-json";
import type { AccountRow } from "@/lib/db/types";
import { approveSessionContent } from "./approve-content";

const mocks = vi.hoisted(() => ({
	authorizeWritableEventAdminApi: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
	authorizeWritableEventAdminApi: mocks.authorizeWritableEventAdminApi,
}));

const now = 1_781_200_000_000;
let sequence = 0;

async function seedEvent(label: string) {
	sequence += 1;
	const owner: AccountRow = {
		id: `platform-owner-${sequence}`,
		email: `platform-owner-${sequence}@test.invalid`,
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
			slug: `platform-phase8-${sequence}`,
			timezone: "UTC",
			startDay: "2026-11-01",
			endDay: "2026-11-01",
		},
		owner,
	);
}

describe("phase 8 platform", () => {
	it("serves unauthenticated public schedule JSON without PII and only published slots", async () => {
		const created = await seedEvent("Public JSON");
		const form = await env.DB.prepare(
			"SELECT id FROM cfp_forms WHERE event_id = ? AND kind = 'public' LIMIT 1",
		).bind(created.eventId).first<{ id: string }>();
		const formId = form!.id;
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_email, submitter_name, created_at, updated_at) VALUES ('platform-published', ?, ?, 'published', ?, 'secret@test.invalid', 'Secret Submitter', ?, ?)",
			).bind(formId, created.eventId, JSON.stringify({ title: "Published talk" }), now, now),
			env.DB.prepare(
				"INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_email, created_at, updated_at) VALUES ('platform-scheduled', ?, ?, 'scheduled', ?, 'hidden@test.invalid', ?, ?)",
			).bind(formId, created.eventId, JSON.stringify({ title: "Hidden talk" }), now, now),
			env.DB.prepare(
				"INSERT INTO people (id, email, name, created_at) VALUES ('platform-person', 'speaker-secret@test.invalid', 'Pat Public', ?)",
			).bind(now),
			env.DB.prepare(
				"INSERT INTO submission_speakers (id, submission_id, person_id, name, email, status, position, added_after_acceptance) VALUES ('platform-speaker', 'platform-published', 'platform-person', 'Pat Public', 'speaker-secret@test.invalid', 'confirmed', 0, 0)",
			),
			env.DB.prepare(
				"INSERT INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES ('platform-slot-published', ?, 'platform-published', 'Main', ?, ?, 'platform@test.invalid', ?, ?)",
			).bind(created.eventId, Date.parse("2026-11-01T10:00:00Z"), Date.parse("2026-11-01T10:30:00Z"), now, now),
			env.DB.prepare(
				"INSERT INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES ('platform-slot-hidden', ?, 'platform-scheduled', 'Main', ?, ?, 'hidden@test.invalid', ?, ?)",
			).bind(created.eventId, Date.parse("2026-11-01T11:00:00Z"), Date.parse("2026-11-01T11:30:00Z"), now, now),
		]);
		await approveSessionContent(created.eventId, "platform-published");

		const payload = await buildPublicScheduleJson(env.DB, created.slug);
		expect(payload).not.toBeNull();
		expect(payload!.slots).toHaveLength(1);
		expect(payload!.slots[0]).toMatchObject({
			title: "Published talk",
			sessionId: "platform-published",
			speakers: [{ name: "Pat Public", personId: "platform-person" }],
		});
		expect(publicScheduleJsonContainsPii(payload)).toBe(false);
		expect(JSON.stringify(payload)).not.toContain("secret@test.invalid");
		expect(JSON.stringify(payload)).not.toContain("speaker-secret@test.invalid");

		const response = await getPublicScheduleJson(
			new Request(`https://example.test/api/e/${created.slug}/schedule`),
			{ params: Promise.resolve({ eventSlug: created.slug }) },
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toContain("public");
		const body = await response.json();
		expect(body).toMatchObject({ ok: true, slots: [{ title: "Published talk" }] });
		expect(publicScheduleJsonContainsPii(body)).toBe(false);
	});

	it("syncs only opted-in live events during the nightly cron hook", async () => {
		const enabled = await seedEvent("Airtable enabled");
		const disabled = await seedEvent("Airtable disabled");
		const enabledForm = await env.DB.prepare(
			"SELECT id FROM cfp_forms WHERE event_id = ? AND kind = 'public' LIMIT 1",
		).bind(enabled.eventId).first<{ id: string }>();
		const disabledForm = await env.DB.prepare(
			"SELECT id FROM cfp_forms WHERE event_id = ? AND kind = 'public' LIMIT 1",
		).bind(disabled.eventId).first<{ id: string }>();
		await setAirtableSyncEnabled(env.DB, enabled.eventId, true);
		await setAirtableSyncEnabled(env.DB, disabled.eventId, false);

		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('airtable-sub-enabled', ?, ?, 'accepted', ?, ?, ?)",
			).bind(enabledForm!.id, enabled.eventId, JSON.stringify({ title: "Enabled row" }), now, now),
			env.DB.prepare(
				"INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('airtable-sub-disabled', ?, ?, 'accepted', ?, ?, ?)",
			).bind(disabledForm!.id, disabled.eventId, JSON.stringify({ title: "Disabled row" }), now, now),
		]);

		const originalFetch = globalThis.fetch;
		const pushed: string[] = [];
		globalThis.fetch = async (_input, init) => {
			pushed.push(String(init?.body ?? ""));
			return new Response(JSON.stringify({ records: [{ id: "rec123" }] }), { status: 200 });
		};
		try {
			const result = await syncOptInEventsToAirtable({
				DB: env.DB,
				AIRTABLE_API_KEY: "test-key",
				AIRTABLE_BASE_ID: "test-base",
				AIRTABLE_TABLE_NAME: "Submissions",
			});
			expect(result).toMatchObject({ syncedEvents: 1, skippedEvents: 0, upsertedRows: 1, errors: [] });
			expect(pushed).toHaveLength(1);
			expect(pushed[0]).toContain("airtable-sub-enabled");
			expect(pushed[0]).not.toContain("airtable-sub-disabled");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("lets organizers toggle nightly Airtable sync when credentials exist", async () => {
		const created = await seedEvent("Sync toggle");
		mocks.authorizeWritableEventAdminApi.mockResolvedValue({
			ok: true,
			access: {
				event: {
					id: created.eventId,
					slug: created.slug,
					name: "Sync toggle",
					timezone: "UTC",
					start_day: "2026-11-01",
					end_day: "2026-11-01",
					day_start_minutes: 540,
					day_end_minutes: 1080,
					slot_duration_minutes: 30,
					track_conflict_policy: "hard",
					mode: "live",
					created_at: now,
					updated_at: now,
				},
				account: null,
				membership: null,
			},
		});

		const enable = await patchAirtableSync(
			new Request("https://example.test/sync", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ enabled: true }),
			}),
			{ params: Promise.resolve({ eventSlug: created.slug }) },
		);
		expect(enable.status).toBe(503);

		env.AIRTABLE_API_KEY = "test-key";
		env.AIRTABLE_BASE_ID = "test-base";
		env.AIRTABLE_TABLE_NAME = "Submissions";

		const enabled = await patchAirtableSync(
			new Request("https://example.test/sync", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ enabled: true }),
			}),
			{ params: Promise.resolve({ eventSlug: created.slug }) },
		);
		expect(enabled.status).toBe(200);
		expect(await getAirtableSyncEnabled(env.DB, created.eventId)).toBe(true);
	});
});
