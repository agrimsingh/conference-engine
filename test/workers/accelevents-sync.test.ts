import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { AcceleventsApi } from "@/lib/integrations/accelevents/api";
import {
	getAcceleventsIntegrationStatus,
	loadAcceleventsIntegrationConfig,
	saveAcceleventsIntegration,
} from "@/lib/integrations/accelevents/repository";
import { syncAcceleventsEvent } from "@/lib/integrations/accelevents/sync";

const now = 1_786_000_000_000;

async function seedSyncEvent(eventId: string, speakerEmail = "ada@accelevents.test"): Promise<void> {
	const formId = `${eventId}-form`;
	await env.DB.batch([
		env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES (?, ?, ?, 'UTC', ?, ?)").bind(eventId, eventId, "Accelevents test", now, now),
		env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at, submission_limit) VALUES (?, ?, 'cfp', 'CFP', 'open', ?, ?, 0)").bind(formId, eventId, now, now),
		env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES (?, ?, 'Ada Lovelace', ?)").bind(`${eventId}-person`, speakerEmail, now),
		env.DB.prepare("INSERT INTO speaker_profiles (id, event_id, person_id, display_name, bio, job_title, company, created_at, updated_at) VALUES (?, ?, ?, 'Ada Lovelace', 'Computing pioneer', 'Engineer', 'Analytical Engines', ?, ?)").bind(`${eventId}-profile`, eventId, `${eventId}-person`, now, now),
		env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES (?, ?, ?, 'accepted', ?, ?, ?)").bind(`${eventId}-accepted`, formId, eventId, JSON.stringify({ title: "Accepted talk", abstract: "Still being scheduled" }), now, now),
		env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES (?, ?, ?, 'scheduled', ?, ?, ?)").bind(`${eventId}-scheduled`, formId, eventId, JSON.stringify({ title: "Scheduled talk", abstract: "Ready for the agenda" }), now, now),
		env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, person_id, name, email, position, status) VALUES (?, ?, ?, 'Ada Lovelace', ?, 0, 'confirmed')").bind(`${eventId}-accepted-speaker`, `${eventId}-accepted`, `${eventId}-person`, speakerEmail),
		env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, person_id, name, email, position, status) VALUES (?, ?, ?, 'Ada Lovelace', ?, 0, 'confirmed')").bind(`${eventId}-scheduled-speaker`, `${eventId}-scheduled`, `${eventId}-person`, speakerEmail),
		env.DB.prepare("INSERT INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES (?, ?, ?, 'Main Hall', ?, ?, ?, ?, ?)").bind(`${eventId}-slot`, eventId, `${eventId}-scheduled`, 1_735_689_600_000, 1_735_693_200_000, `${eventId}-slot@conference.test`, now, now),
	]);
}

describe("Accelevents one-way D1 sync", () => {
	it("previews without a provider call, persists mappings after a push, and reports later failures", async () => {
		const eventId = "accelevents-sync-worker";
		await seedSyncEvent(eventId);
		await saveAcceleventsIntegration(env.DB, {
			eventId,
			eventUrl: "external-event",
			externalEventId: 101,
			sessionTypeFormat: "IN_PERSON",
			apiKey: "worker-test-key",
			secret: env.AUTH_SECRET,
		});

		const preview = await syncAcceleventsEvent(env.DB, { eventId, timezone: "UTC", secret: env.AUTH_SECRET, dryRun: true });
		expect(preview).toMatchObject({ ok: true, dryRun: true, configured: true });
		expect(preview.actions.map((action) => [action.kind, action.operation])).toEqual([
			["speaker", "create"],
			["session", "create"],
			["session", "create"],
		]);
		expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM accelevents_sync_mappings WHERE event_id = ?").bind(eventId).first<{ count: number }>())?.count).toBe(0);

		const calls: string[] = [];
		const api: AcceleventsApi = {
			async createSpeaker(payload) { calls.push(`speaker:${payload.email}`); return "speaker-101"; },
			async updateSpeaker(externalId) { calls.push(`speaker-update:${externalId}`); },
			async createSession(payload) { calls.push(`session:${payload.title}`); return `session-${calls.length}`; },
			async updateSession(externalId) { calls.push(`session-update:${externalId}`); },
			async findSpeakerByEmail() { return null; },
		};
		const pushed = await syncAcceleventsEvent(env.DB, { eventId, timezone: "UTC", secret: env.AUTH_SECRET, dryRun: false, api });
		expect(pushed).toMatchObject({ ok: true, dryRun: false, configured: true, failures: [] });
		expect(calls).toEqual(["speaker:ada@accelevents.test", "session:Accepted talk", "session:Scheduled talk"]);
		expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM accelevents_sync_mappings WHERE event_id = ?").bind(eventId).first<{ count: number }>())?.count).toBe(3);

		const repeated = await syncAcceleventsEvent(env.DB, { eventId, timezone: "UTC", secret: env.AUTH_SECRET, dryRun: false, api });
		expect(repeated.actions.every((action) => action.operation === "skip")).toBe(true);
		expect(calls).toHaveLength(3);

		await env.DB.prepare("UPDATE submissions SET answers_json = ? WHERE id = ?").bind(JSON.stringify({ title: "Changed scheduled talk", abstract: "Ready for the agenda" }), `${eventId}-scheduled`).run();
		const failingApi: AcceleventsApi = {
			...api,
			async updateSession() { throw new Error("Accelevents denied session update"); },
		};
		const failed = await syncAcceleventsEvent(env.DB, { eventId, timezone: "UTC", secret: env.AUTH_SECRET, dryRun: false, api: failingApi });
		expect(failed).toMatchObject({ ok: false, failures: [{ kind: "session", localId: `${eventId}-scheduled`, message: "Accelevents denied session update" }] });
		expect((await getAcceleventsIntegrationStatus(env.DB, eventId)).lastSyncError).toBe("Accelevents denied session update");

		await saveAcceleventsIntegration(env.DB, {
			eventId,
			eventUrl: "replacement-external-event",
			externalEventId: 202,
			sessionTypeFormat: "VIRTUAL",
			secret: env.AUTH_SECRET,
		});
		expect((await loadAcceleventsIntegrationConfig(env.DB, eventId, env.AUTH_SECRET))?.apiKey).toBe("worker-test-key");
		expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM accelevents_sync_mappings WHERE event_id = ?").bind(eventId).first<{ count: number }>())?.count).toBe(0);
	});

	it("reconciles a lost speaker-create response by exact email without POSTing the speaker twice", async () => {
		const eventId = "accelevents-lost-speaker-response";
		const speakerEmail = "lost-response@accelevents.test";
		await seedSyncEvent(eventId, speakerEmail);
		await saveAcceleventsIntegration(env.DB, {
			eventId,
			eventUrl: "external-event-lost-response",
			externalEventId: 303,
			sessionTypeFormat: "IN_PERSON",
			apiKey: "worker-test-key",
			secret: env.AUTH_SECRET,
		});

		let speakerPosts = 0;
		let speakerLookups = 0;
		const api: AcceleventsApi = {
			async createSpeaker() {
				speakerPosts += 1;
				throw new Error("connection closed after provider accepted");
			},
			async updateSpeaker() {},
			async createSession(payload) { return `session-${payload.title}`; },
			async updateSession() {},
			async findSpeakerByEmail(externalEventId, email) {
				speakerLookups += 1;
				expect(externalEventId).toBe(303);
				expect(email).toBe(speakerEmail);
				return "speaker-reconciled-101";
			},
		};

		const first = await syncAcceleventsEvent(env.DB, { eventId, timezone: "UTC", secret: env.AUTH_SECRET, dryRun: false, api });
		expect(first).toMatchObject({
			ok: false,
			failures: [{ kind: "speaker", localId: `person:${eventId}-person`, message: "connection closed after provider accepted" }],
		});
		expect(speakerPosts).toBe(1);
		expect(await env.DB.prepare("SELECT external_id, sync_state FROM accelevents_sync_mappings WHERE event_id = ? AND local_kind = 'speaker'").bind(eventId).first()).toEqual({ external_id: null, sync_state: "creating" });

		const retry = await syncAcceleventsEvent(env.DB, { eventId, timezone: "UTC", secret: env.AUTH_SECRET, dryRun: false, api });
		expect(retry).toMatchObject({ ok: true, failures: [] });
		expect(retry.actions.find((action) => action.kind === "speaker")?.operation).toBe("reconcile");
		expect(speakerPosts).toBe(1);
		expect(speakerLookups).toBe(1);
		expect(await env.DB.prepare("SELECT external_id, sync_state FROM accelevents_sync_mappings WHERE event_id = ? AND local_kind = 'speaker'").bind(eventId).first()).toEqual({ external_id: "speaker-reconciled-101", sync_state: "synced" });
	});

	it("allows only one concurrent sync plan to claim each create before any provider POST", async () => {
		const eventId = "accelevents-concurrent-create-claim";
		await seedSyncEvent(eventId, "concurrent-claim@accelevents.test");
		await saveAcceleventsIntegration(env.DB, {
			eventId,
			eventUrl: "external-event-concurrent-claim",
			externalEventId: 404,
			sessionTypeFormat: "IN_PERSON",
			apiKey: "worker-test-key",
			secret: env.AUTH_SECRET,
		});

		let speakerPosts = 0;
		let sessionPosts = 0;
		let releaseSpeakerCreate: (() => void) | undefined;
		const speakerCreateStarted = new Promise<void>((resolve) => {
			releaseSpeakerCreate = resolve;
		});
		const api: AcceleventsApi = {
			async createSpeaker() {
				speakerPosts += 1;
				await speakerCreateStarted;
				return "speaker-concurrent-101";
			},
			async updateSpeaker() {},
			async createSession(payload) {
				sessionPosts += 1;
				return `session-concurrent-${payload.title}`;
			},
			async updateSession() {},
			async findSpeakerByEmail() { return null; },
		};

		const first = syncAcceleventsEvent(env.DB, { eventId, timezone: "UTC", secret: env.AUTH_SECRET, dryRun: false, api });
		const second = syncAcceleventsEvent(env.DB, { eventId, timezone: "UTC", secret: env.AUTH_SECRET, dryRun: false, api });
		await new Promise<void>((resolve) => {
			const poll = () => speakerPosts === 1 ? resolve() : setTimeout(poll, 1);
			poll();
		});
		releaseSpeakerCreate?.();
		const results = await Promise.all([first, second]);

		expect(results.map((result) => result.actions.find((action) => action.kind === "speaker")?.operation)).toEqual(["create", "create"]);
		expect(speakerPosts).toBe(1);
		expect(sessionPosts).toBe(2);
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM accelevents_sync_mappings WHERE event_id = ? AND sync_state = 'synced'").bind(eventId).first<{ count: number }>()).toEqual({ count: 3 });
	});
});
