import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { buildPublicEmbedPayload, createEmbed, getPublicEmbedBySlug } from "@/lib/embeds/embed";
import { createEventWithDefaults } from "@/lib/events/create-event";
import type { AccountRow } from "@/lib/db/types";

let sequence = 0;
const now = 1_781_300_000_000;

async function seedEvent(label: string) {
	sequence += 1;
	const owner: AccountRow = { id: `embed-owner-${sequence}`, email: `embed-owner-${sequence}@test.invalid`, name: "Owner", created_at: now, updated_at: now };
	await env.DB.prepare("INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(owner.id, owner.email, owner.name, now, now).run();
	return createEventWithDefaults(env.DB, { name: label, slug: `embed-event-${sequence}`, timezone: "UTC", startDay: "2026-11-01", endDay: "2026-11-01" }, owner);
}

describe("public embeds", () => {
	it("scopes definitions to their event and excludes unpublished sessions", async () => {
		const eventA = await seedEvent("Embed A");
		const eventB = await seedEvent("Embed B");
		const embed = await createEmbed(env.DB, eventA.eventId, { name: "Agenda", slug: "agenda", widgetType: "agenda", brandColor: "#2563eb", trackIds: [], formats: [], rooms: [], visibleFields: ["title", "time", "room"] });
		expect(await getPublicEmbedBySlug(env.DB, eventA.eventId, "agenda")).toMatchObject({ id: embed.id });
		expect(await getPublicEmbedBySlug(env.DB, eventB.eventId, "agenda")).toBeNull();

		const form = await env.DB.prepare("SELECT id FROM cfp_forms WHERE event_id = ? AND kind = 'public' LIMIT 1").bind(eventA.eventId).first<{ id: string }>();
		await env.DB.batch([
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('embed-published', ?, ?, 'published', ?, ?, ?)").bind(form!.id, eventA.eventId, JSON.stringify({ title: "Visible talk", format: "Talk" }), now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('embed-hidden', ?, ?, 'scheduled', ?, ?, ?)").bind(form!.id, eventA.eventId, JSON.stringify({ title: "Hidden talk", format: "Talk" }), now, now),
			env.DB.prepare("INSERT INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES ('embed-slot-visible', ?, 'embed-published', 'Main', ?, ?, 'visible@test.invalid', ?, ?)").bind(eventA.eventId, now, now + 1800000, now, now),
			env.DB.prepare("INSERT INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES ('embed-slot-hidden', ?, 'embed-hidden', 'Main', ?, ?, 'hidden@test.invalid', ?, ?)").bind(eventA.eventId, now + 3600000, now + 5400000, now, now),
		]);
		const payload = await buildPublicEmbedPayload(env.DB, eventA.slug, "agenda");
		expect(payload?.sessions.map((session) => session.title)).toEqual(["Visible talk"]);
		expect(JSON.stringify(payload)).not.toContain("Hidden talk");
		expect(payload?.itineraryUrl).toBe(`/e/${eventA.slug}/schedule?view=itinerary&embed=agenda`);
	});
});
