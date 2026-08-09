import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/cloudflare", () => ({
	getDb: async () => env.DB,
	getFilesBucket: async () => env.FILES,
	getCloudflareEnv: async () => env,
}));

import { GET as getPublicHeadshot } from "@/app/api/e/[eventSlug]/people/[personId]/headshot/route";
import { GET as getPublicIcs } from "@/app/api/e/[eventSlug]/sessions/[sessionId]/ics/route";
import { createEventWithDefaults } from "@/lib/events/create-event";
import {
	getPublicSpeakerDirectoryEntry,
	listPublicSpeakersForEvent,
	resolvePublicHeadshotAsset,
} from "@/lib/db/queries";
import { createSession, loadPublicSession } from "@/lib/sessions/session";
import { buildPublicSessionIcs } from "@/lib/sessions/public-ics";
import type { AccountRow } from "@/lib/db/types";

const now = 1_781_100_000_000;
let sequence = 0;

async function event(label: string) {
	sequence += 1;
	const owner: AccountRow = {
		id: `public-owner-${sequence}`,
		email: `public-owner-${sequence}@test.invalid`,
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
			slug: `public-surface-${sequence}`,
			timezone: "UTC",
			startDay: "2026-11-01",
			endDay: "2026-11-02",
		},
		owner,
	);
}

function bulk(room: DurableObjectStub, eventId: string, sessionIds: string[]) {
	return room.fetch("https://event-room/bulk-publication", {
		method: "POST",
		headers: { "content-type": "application/json", "x-ce-event-id": eventId },
		body: JSON.stringify({ action: "publish", sessionIds }),
	});
}

describe("phase 7 public surface", () => {
	it("streams headshots only for confirmed speakers on published sessions and serves PUBLISH ICS without attendees", async () => {
		const created = await event("Headshot");
		const session = await createSession(env.DB, {
			eventId: created.eventId,
			origin: "manual",
			input: {
				title: "Public talk",
				speakers: [{ name: "Pat Public", email: "pat-public@test.invalid", bio: "Speaks." }],
			},
		});
		const person = await env.DB.prepare(
			"SELECT person_id FROM submission_speakers WHERE submission_id = ?",
		)
			.bind(session.id)
			.first<{ person_id: string }>();
		expect(person?.person_id).toBeTruthy();
		const personId = person!.person_id;
		const r2Key = `events/${created.eventId}/people/${personId}/headshot/pat.png`;
		await env.FILES.put(r2Key, "fake-png-bytes");
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO assets (id, event_id, r2_key, content_type, filename, uploaded_by_person_id, created_at) VALUES (?, ?, ?, 'image/png', 'pat.png', ?, ?)",
			).bind("public-headshot-asset", created.eventId, r2Key, personId, now),
			env.DB.prepare(
				"UPDATE speaker_profiles SET headshot_asset_id = ?, bio = ?, display_name = ?, updated_at = ? WHERE event_id = ? AND person_id = ?",
			).bind("public-headshot-asset", "Published bio", "Pat Public", now, created.eventId, personId),
			env.DB.prepare(
				"UPDATE submissions SET status = 'scheduled' WHERE id = ?",
			).bind(session.id),
			env.DB.prepare(
				"INSERT INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES (?, ?, ?, 'Main', ?, ?, ?, ?, ?)",
			).bind(
				"public-surface-slot",
				created.eventId,
				session.id,
				Date.parse("2026-11-01T10:00:00Z"),
				Date.parse("2026-11-01T10:30:00Z"),
				"public-surface-slot@test.invalid",
				now,
				now,
			),
			env.DB.prepare(
				"INSERT INTO agenda_calendar_lifecycles (event_id, submission_id, ics_uid, sequence, created_at, updated_at) VALUES (?, ?, ?, 3, ?, ?)",
			).bind(created.eventId, session.id, "public-surface-slot@test.invalid", now, now),
		]);

		expect(await resolvePublicHeadshotAsset(env.DB, created.eventId, personId)).toBeNull();
		expect(
			(
				await getPublicHeadshot(new Request("https://example.test/headshot"), {
					params: Promise.resolve({ eventSlug: created.slug, personId }),
				})
			).status,
		).toBe(404);

		const room = env.EVENT_ROOM.getByName(created.eventId);
		expect((await bulk(room, created.eventId, [session.id])).status).toBe(200);

		const asset = await resolvePublicHeadshotAsset(env.DB, created.eventId, personId);
		expect(asset).toMatchObject({ id: "public-headshot-asset", r2_key: r2Key });

		const headshot = await getPublicHeadshot(new Request("https://example.test/headshot"), {
			params: Promise.resolve({ eventSlug: created.slug, personId }),
		});
		expect(headshot.status).toBe(200);
		expect(headshot.headers.get("Cache-Control")).toBe(
			"public, max-age=3600, stale-while-revalidate=86400",
		);
		expect(new TextDecoder().decode(await headshot.arrayBuffer())).toBe("fake-png-bytes");

		const publicSession = await loadPublicSession(env.DB, created.slug, session.id);
		expect(publicSession?.speakers).toEqual([
			{
				id: expect.any(String),
				personId,
				name: "Pat Public",
				bio: "Speaks.",
				hasHeadshot: true,
			},
		]);

		const ics = await buildPublicSessionIcs(env.DB, {
			eventSlug: created.slug,
			sessionId: session.id,
			organizerEmail: "team@65labs.org",
		});
		expect(ics.ok).toBe(true);
		if (!ics.ok) return;
		expect(ics.body).toContain("METHOD:PUBLISH");
		expect(ics.body).not.toContain("ATTENDEE");
		expect(ics.body).not.toContain("pat-public@test.invalid");
		expect(ics.body).toContain("SEQUENCE:3");

		const icsResponse = await getPublicIcs(new Request("https://example.test/ics"), {
			params: Promise.resolve({ eventSlug: created.slug, sessionId: session.id }),
		});
		expect(icsResponse.status).toBe(200);
		expect(icsResponse.headers.get("Content-Type")).toContain("method=PUBLISH");
		const icsText = await icsResponse.text();
		expect(icsText).not.toContain("ATTENDEE");
		expect(icsText).not.toContain("pat-public@test.invalid");

		expect(await listPublicSpeakersForEvent(env.DB, created.eventId)).toEqual([
			{
				person_id: personId,
				display_name: "Pat Public",
				bio: "Published bio",
				has_headshot: 1,
			},
		]);
		expect(await getPublicSpeakerDirectoryEntry(env.DB, created.eventId, personId)).toMatchObject({
			person_id: personId,
			display_name: "Pat Public",
		});
	});

	it("denies headshots for unpublished or unconfirmed speakers", async () => {
		const created = await event("Denied");
		const session = await createSession(env.DB, {
			eventId: created.eventId,
			origin: "manual",
			input: {
				title: "Hidden talk",
				speakers: [{ name: "Hidden", email: "hidden@test.invalid" }],
			},
		});
		const person = await env.DB.prepare(
			"SELECT person_id FROM submission_speakers WHERE submission_id = ?",
		)
			.bind(session.id)
			.first<{ person_id: string }>();
		const personId = person!.person_id;
		const r2Key = `events/${created.eventId}/people/${personId}/headshot/h.png`;
		await env.FILES.put(r2Key, "secret");
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO assets (id, event_id, r2_key, content_type, filename, uploaded_by_person_id, created_at) VALUES (?, ?, ?, 'image/png', 'h.png', ?, ?)",
			).bind("denied-headshot-asset", created.eventId, r2Key, personId, now),
			env.DB.prepare(
				"UPDATE speaker_profiles SET headshot_asset_id = ?, updated_at = ? WHERE event_id = ? AND person_id = ?",
			).bind("denied-headshot-asset", now, created.eventId, personId),
			env.DB.prepare(
				"UPDATE submission_speakers SET status = 'pending' WHERE submission_id = ?",
			).bind(session.id),
		]);
		expect(await resolvePublicHeadshotAsset(env.DB, created.eventId, personId)).toBeNull();
		expect(await listPublicSpeakersForEvent(env.DB, created.eventId)).toEqual([]);
	});
});
