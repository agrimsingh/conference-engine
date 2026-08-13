import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/cloudflare", () => ({
	getDb: async () => env.DB,
}));

import { GET as getEmbedJson } from "@/app/api/e/[eventSlug]/embeds/[embedSlug]/route";
import { GET as getEmbedXml } from "@/app/api/e/[eventSlug]/embeds/[embedSlug]/xml/route";
import { updateSessionContent } from "@/lib/content/revisions";
import { createEmbed } from "@/lib/embeds/embed";
import { createEventWithDefaults } from "@/lib/events/create-event";
import type { AccountRow } from "@/lib/db/types";
import { approveSessionContent } from "./approve-content";

const now = 1_786_300_000_000;

async function seedPublishedSessionWithEmbed(): Promise<{ readonly eventId: string; readonly eventSlug: string }> {
	const owner: AccountRow = {
		id: "embed-propagation-owner",
		email: "embed-propagation-owner@test.invalid",
		name: "Embed owner",
		created_at: now,
		updated_at: now,
	};
	await env.DB
		.prepare("INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
		.bind(owner.id, owner.email, owner.name, owner.created_at, owner.updated_at)
		.run();
	const event = await createEventWithDefaults(
		env.DB,
		{
			name: "Embed propagation",
			slug: "embed-propagation",
			timezone: "UTC",
			startDay: "2026-12-08",
			endDay: "2026-12-08",
		},
		owner,
	);
	await createEmbed(env.DB, event.eventId, {
		name: "Agenda",
		slug: "agenda",
		widgetType: "agenda",
		brandColor: "#2563eb",
		trackIds: [],
		formats: [],
		rooms: [],
		visibleFields: ["title", "time", "room"],
	});
	const form = await env.DB
		.prepare("SELECT id FROM cfp_forms WHERE event_id = ? AND kind = 'public' LIMIT 1")
		.bind(event.eventId)
		.first<{ id: string }>();
	if (!form) throw new Error("Public CFP form is required for the embed fixture");
	await env.DB.batch([
		env.DB
			.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('embed-propagation-published', ?, ?, 'published', ?, ?, ?)")
			.bind(form.id, event.eventId, JSON.stringify({ title: "Approved agenda title", abstract: "Approved abstract" }), now, now),
		env.DB
			.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('embed-propagation-hidden', ?, ?, 'scheduled', ?, ?, ?)")
			.bind(form.id, event.eventId, JSON.stringify({ title: "Unpublished agenda title", abstract: "Private abstract" }), now, now),
		env.DB
			.prepare("INSERT INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES ('embed-propagation-published-slot', ?, 'embed-propagation-published', 'Main', ?, ?, 'embed-propagation-published@test.invalid', ?, ?)")
			.bind(event.eventId, now, now + 1_800_000, now, now),
		env.DB
			.prepare("INSERT INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES ('embed-propagation-hidden-slot', ?, 'embed-propagation-hidden', 'Main', ?, ?, 'embed-propagation-hidden@test.invalid', ?, ?)")
			.bind(event.eventId, now + 3_600_000, now + 5_400_000, now, now),
	]);
	await approveSessionContent(event.eventId, "embed-propagation-published");
	return { eventId: event.eventId, eventSlug: event.slug };
}

function embedContext(eventSlug: string) {
	return { params: Promise.resolve({ eventSlug, embedSlug: "agenda" }) };
}

describe("public embed content propagation", () => {
	it("serves approved session edits through JSON and XML while draft and unpublished sessions stay hidden", async () => {
		// Given a published, approved session and a separately unpublished session.
		const fixture = await seedPublishedSessionWithEmbed();
		const embedBeforeEdit = await env.DB
			.prepare("SELECT id, config_json FROM public_embeds WHERE event_id = ? AND slug = 'agenda'")
			.bind(fixture.eventId)
			.first<{ id: string; config_json: string }>();
		expect(embedBeforeEdit).not.toBeNull();

		// When the published session is edited but its new revision has not been approved.
		const draftUpdate = await updateSessionContent(env.DB, {
			eventId: fixture.eventId,
			submissionId: "embed-propagation-published",
			editorAccountId: null,
			editorName: "Agenda editor",
			content: { title: "Updated agenda title", abstract: "Updated abstract" },
		});
		expect(draftUpdate).toEqual({ ok: true });

		const draftJson = await getEmbedJson(new Request("https://widgets.test/embed.json"), embedContext(fixture.eventSlug));
		const draftXml = await getEmbedXml(new Request("https://widgets.test/embed.xml"), embedContext(fixture.eventSlug));

		const draftJsonBody: unknown = await draftJson.json();
		// Then both public formats retain the approved snapshot and omit unpublished content.
		expect(draftJsonBody).toMatchObject({
			sessions: [expect.objectContaining({ id: "embed-propagation-published", title: "Approved agenda title" })],
		});
		expect(JSON.stringify(draftJsonBody)).not.toContain("Unpublished agenda title");
		const draftXmlBody = await draftXml.text();
		expect(draftXmlBody).toContain("<title>Approved agenda title</title>");
		expect(draftXmlBody).not.toContain("Unpublished agenda title");
		expect(draftXmlBody).not.toContain("Updated agenda title");

		// When the edited revision is approved.
		await approveSessionContent(fixture.eventId, "embed-propagation-published");

		const approvedJson = await getEmbedJson(new Request("https://widgets.test/embed-approved.json"), embedContext(fixture.eventSlug));
		const approvedXml = await getEmbedXml(new Request("https://widgets.test/embed-approved.xml"), embedContext(fixture.eventSlug));

		const approvedJsonBody: unknown = await approvedJson.json();
		// Then both formats now return the approved edit, without recreating the embed definition.
		expect(approvedJsonBody).toMatchObject({
			sessions: [expect.objectContaining({ id: "embed-propagation-published", title: "Updated agenda title" })],
		});
		expect(JSON.stringify(approvedJsonBody)).not.toContain("Unpublished agenda title");
		const approvedXmlBody = await approvedXml.text();
		expect(approvedXmlBody).toContain("<title>Updated agenda title</title>");
		expect(approvedXmlBody).not.toContain("Unpublished agenda title");
		expect(
			await env.DB
				.prepare("SELECT id, config_json FROM public_embeds WHERE event_id = ? AND slug = 'agenda'")
				.bind(fixture.eventId)
				.first<{ id: string; config_json: string }>(),
		).toEqual(embedBeforeEdit);
	});
});
