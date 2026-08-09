import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { saveAcceleventsIntegration } from "@/lib/integrations/accelevents/repository";
import { syncOptInEventsToAccelevents } from "@/lib/integrations/accelevents/scheduled";

describe("scheduled Accelevents sync", () => {
	it("syncs only opted-in live events and passes the public origin", async () => {
		const now = 1_786_000_000_000;
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES ('ae-auto-live', 'ae-auto-live', 'Live', 'Asia/Singapore', 'live', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES ('ae-auto-off', 'ae-auto-off', 'Off', 'UTC', 'live', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES ('ae-auto-demo', 'ae-auto-demo', 'Demo', 'UTC', 'demo', ?, ?)").bind(now, now),
		]);
		for (const integration of [
			{ eventId: "ae-auto-live", eventUrl: "ae-auto-live", autoSyncEnabled: true },
			{ eventId: "ae-auto-off", eventUrl: "ae-auto-off", autoSyncEnabled: false },
			{ eventId: "ae-auto-demo", eventUrl: "ae-auto-demo", autoSyncEnabled: true },
		]) {
			await saveAcceleventsIntegration(env.DB, {
				...integration,
				externalEventId: 700,
				sessionTypeFormat: "IN_PERSON",
				apiKey: "worker-test-key",
				secret: env.AUTH_SECRET,
			});
		}

		const calls: Array<{ eventId: string; eventSlug?: string; appOrigin?: string }> = [];
		const result = await syncOptInEventsToAccelevents(
			{ DB: env.DB, AUTH_SECRET: env.AUTH_SECRET, APP_ORIGIN: "https://conference.example" },
			{
				sync: async (_db, args) => {
					calls.push({ eventId: args.eventId, eventSlug: args.eventSlug, appOrigin: args.appOrigin });
					return { ok: true, dryRun: false, configured: true, actions: [], failures: [] };
				},
			},
		);

		expect(result).toEqual({ syncedEvents: 1, skippedEvents: 0, errors: [] });
		expect(calls).toEqual([{ eventId: "ae-auto-live", eventSlug: "ae-auto-live", appOrigin: "https://conference.example" }]);
	});
});
