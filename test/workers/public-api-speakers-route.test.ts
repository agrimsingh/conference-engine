import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/cloudflare", () => ({
	getAuthSecret: async () => env.AUTH_SECRET,
	getDb: async () => env.DB,
	getCloudflareEnv: async () => env,
}));

import { GET as getOpenApi } from "@/app/api/v1/openapi.json/route";
import { GET as getSpeakers } from "@/app/api/v1/events/[eventSlug]/speakers/route";
import { createToken } from "@/lib/auth/event-api-tokens";
import { createEventWithDefaults } from "@/lib/events/create-event";
import { createSession } from "@/lib/sessions/session";

const now = 1_786_000_000_000;
const testEnv = env as CloudflareEnv & {
	PUBLIC_API_KEY_CROSS_EVENT?: string;
};
let sequence = 0;

async function seedSpeakerEvent() {
	sequence += 1;
	const created = await createEventWithDefaults(
		env.DB,
		{
			name: `API speakers ${sequence}`,
			slug: `api-speakers-${sequence}`,
			timezone: "UTC",
			startDay: "2026-12-01",
			endDay: "2026-12-01",
		},
		null,
	);
	const session = await createSession(env.DB, {
		eventId: created.eventId,
		origin: "manual",
		input: {
			title: "Speaker API talk",
			abstract: "A test session.",
			speakers: [{ name: "Ada Lovelace", email: `ada-${sequence}@test.invalid`, bio: "Mathematician." }],
		},
	});
	const speaker = await env.DB.prepare(
		"SELECT person_id FROM submission_speakers WHERE submission_id = ?",
	).bind(session.id).first<{ person_id: string }>();
	if (!speaker) throw new Error("Test seed did not create a speaker");
	const task = await env.DB.prepare(
		"SELECT id FROM speaker_tasks WHERE submission_id = ? AND person_id = ? ORDER BY created_at ASC LIMIT 1",
	).bind(session.id, speaker.person_id).first<{ id: string }>();
	if (!task) throw new Error("Test seed did not create a speaker task");

	await env.DB.batch([
		env.DB.prepare(
			"UPDATE speaker_profiles SET job_title = 'Engineer', company = 'Analytical Engines', social_json = ?, logistics_text = 'Private arrival note', updated_at = ? WHERE event_id = ? AND person_id = ?",
		).bind(JSON.stringify({ website: "https://example.test/ada" }), now, created.eventId, speaker.person_id),
		env.DB.prepare(
			"INSERT INTO assets (id, event_id, r2_key, content_type, filename, uploaded_by_person_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		).bind(`api-speaker-asset-${sequence}`, created.eventId, `private/${sequence}/slides.pdf`, "application/pdf", "slides.pdf", speaker.person_id, now),
		env.DB.prepare(
			"UPDATE speaker_tasks SET asset_id = ?, status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?",
		).bind(`api-speaker-asset-${sequence}`, now, now, task.id),
	]);
	return { ...created, personId: speaker.person_id, taskId: task.id };
}

describe("v1 speaker API", () => {
	beforeEach(() => {
		delete testEnv.PUBLIC_API_KEY_CROSS_EVENT;
	});

	it("requires an API key before exposing speaker data", async () => {
		env.PUBLIC_API_KEY = "speaker-api-test-key";
		const response = await getSpeakers(
			new Request("https://conference.example.test/api/v1/events/no-event/speakers"),
			{ params: Promise.resolve({ eventSlug: "no-event" }) },
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ ok: false, error: "Unauthorized" });
	});

	it("rejects the deployment API key without explicit cross-event access", async () => {
		env.PUBLIC_API_KEY = "speaker-api-test-key";
		const created = await seedSpeakerEvent();
		const response = await getSpeakers(
			new Request(`https://conference.example.test/api/v1/events/${created.slug}/speakers`, {
				headers: { authorization: "Bearer speaker-api-test-key" },
			}),
			{ params: Promise.resolve({ eventSlug: created.slug }) },
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ ok: false, error: "Unauthorized" });
	});

	it("scopes event PAT access to its own event", async () => {
		env.PUBLIC_API_KEY = "speaker-api-test-key";
		const eventA = await seedSpeakerEvent();
		const eventB = await seedSpeakerEvent();
		const created = await createToken(env.DB, {
			secret: env.AUTH_SECRET,
			eventId: eventA.eventId,
			name: "Event A reader",
			createdByAccountId: null,
			now,
			token: `ce_pat_speakers-${sequence}`,
		});
		const request = (eventSlug: string) =>
			getSpeakers(
				new Request(
					`https://conference.example.test/api/v1/events/${eventSlug}/speakers`,
					{ headers: { authorization: `Bearer ${created.token}` } },
				),
				{ params: Promise.resolve({ eventSlug }) },
			);

		expect((await request(eventB.slug)).status).toBe(401);
		expect((await request(eventA.slug)).status).toBe(200);
	});

	it("returns a roster, task state, and resource metadata when cross-event access is enabled", async () => {
		env.PUBLIC_API_KEY = "speaker-api-test-key";
		testEnv.PUBLIC_API_KEY_CROSS_EVENT = "true";
		const created = await seedSpeakerEvent();
		const response = await getSpeakers(
			new Request(`https://conference.example.test/api/v1/events/${created.slug}/speakers`, {
				headers: { authorization: "Bearer speaker-api-test-key" },
			}),
			{ params: Promise.resolve({ eventSlug: created.slug }) },
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toMatchObject({
			ok: true,
			event: { id: created.eventId, slug: created.slug, timezone: "UTC" },
			speakers: [{
				personId: created.personId,
				name: "Ada Lovelace",
				email: `ada-${sequence}@test.invalid`,
				profile: {
					bio: "Mathematician.",
					jobTitle: "Engineer",
					company: "Analytical Engines",
					socials: { website: "https://example.test/ada" },
				},
				tasks: expect.arrayContaining([
					expect.objectContaining({
						id: created.taskId,
						status: "completed",
						resource: {
							id: `api-speaker-asset-${sequence}`,
							filename: "slides.pdf",
							contentType: "application/pdf",
							uploadedAt: now,
						},
					}),
				]),
			}],
		});
		expect(JSON.stringify(body)).not.toContain("private arrival note");
		expect(JSON.stringify(body)).not.toContain(`private/${sequence}/slides.pdf`);
	});

	it("accepts x-api-key and returns a scoped 404 for an unknown event", async () => {
		env.PUBLIC_API_KEY = "speaker-api-test-key";
		testEnv.PUBLIC_API_KEY_CROSS_EVENT = "1";
		const response = await getSpeakers(
			new Request("https://conference.example.test/api/v1/events/no-event/speakers", {
				headers: { "x-api-key": "speaker-api-test-key" },
			}),
			{ params: Promise.resolve({ eventSlug: "no-event" }) },
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ ok: false, error: "Event not found" });
	});

	it("publishes a machine-readable v1 contract without requiring a key", async () => {
		const response = await getOpenApi();

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("application/json");
		expect(await response.json()).toMatchObject({
			openapi: "3.1.0",
			paths: {
				"/api/v1/events/{eventSlug}/speakers": {
					get: { security: [{ bearerAuth: [] }, { apiKeyAuth: [] }] },
				},
			},
		});
	});
});
