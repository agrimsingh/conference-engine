import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import demoSeed from "../../scripts/seed-demo.sql?raw";
import { listPublicSpeakersForEvent } from "@/lib/db/queries";
import { buildPublicEmbedPayload, parseEmbedInput } from "@/lib/embeds/embed";

const demoEventId = "demo-cfp-to-stage-2026";

async function runDemoSeed(): Promise<void> {
	// D1's Worker `exec` rejects an initial comment-only fragment, unlike the
	// Wrangler file runner. The fixture contains no semicolons in SQL strings.
	const statements = demoSeed
		.split("\n")
		.filter((line) => !line.trimStart().startsWith("--"))
		.join("\n")
		.split(/;\s*(?:\n|$)/)
		.map((statement) => statement.trim())
		.filter(Boolean);
	for (const statement of statements) await env.DB.prepare(statement).run();
}

describe("demo public state", () => {
	it("reseeds approval heads after migration-created revision one", async () => {
		await runDemoSeed();
		const submissionId = "demo-sub-amara-diallo";
		await env.DB.batch([
			env.DB.prepare("DELETE FROM content_heads WHERE event_id = ? AND entity_type = 'session' AND entity_id = ?").bind(demoEventId, submissionId),
			env.DB.prepare("DELETE FROM content_revisions WHERE id = ?").bind(`demo-content-${submissionId}`),
			env.DB.prepare(`INSERT INTO content_revisions (
				id, event_id, entity_type, entity_id, revision_number, snapshot_json,
				editor_account_id, editor_name, created_at
			) VALUES (?, ?, 'session', ?, 1, ?, NULL, 'Migration backfill', ?)`)
				.bind(`content-backfill-${submissionId}`, demoEventId, submissionId, JSON.stringify({
					title: "Shipping agents that recover",
					abstract: "Patterns for durable agent operations.",
					contentStatus: "approved",
				}), 1_790_000_000_000),
		]);

		await runDemoSeed();
		await runDemoSeed();

		expect(await env.DB.prepare(`SELECT h.approved_revision_id, r.revision_number
			FROM content_heads h
			JOIN content_revisions r ON r.id = h.approved_revision_id
			WHERE h.event_id = ? AND h.entity_type = 'session' AND h.entity_id = ?`)
			.bind(demoEventId, submissionId).first()).toEqual({
			approved_revision_id: `demo-content-${submissionId}`,
			revision_number: 2,
		});
	});

	it("seeds a three-day published program with rich speaker profiles and fallback headshots", async () => {
		await runDemoSeed();

		expect(await env.DB.prepare(
			"SELECT start_day, end_day FROM events WHERE id = ?",
		).bind(demoEventId).first()).toEqual({ start_day: "2026-10-10", end_day: "2026-10-12" });

		const program = await env.DB.prepare(`SELECT
			COUNT(*) AS published_slots,
			COUNT(DISTINCT date(a.starts_at / 1000, 'unixepoch', '+8 hours')) AS days,
			COUNT(DISTINCT a.room_id) AS rooms,
			COUNT(DISTINCT a.track_id) AS tracks,
			COUNT(DISTINCT json_extract(s.answers_json, '$.format')) AS formats,
			COUNT(DISTINCT CASE WHEN sp.job_title IS NOT NULL AND sp.company IS NOT NULL THEN s.id END) AS rich_session_cards
			FROM agenda_slots a
			INNER JOIN submissions s ON s.id = a.submission_id
			LEFT JOIN submission_speakers ss ON ss.submission_id = s.id AND ss.status = 'confirmed'
			LEFT JOIN speaker_profiles sp ON sp.event_id = s.event_id AND sp.person_id = ss.person_id
			WHERE a.event_id = ? AND s.status = 'published'`).bind(demoEventId).first<{
			published_slots: number;
			days: number;
			rooms: number;
			tracks: number;
			formats: number;
			rich_session_cards: number;
		}>();
		expect(program?.published_slots).toBeGreaterThanOrEqual(5);
		expect(program?.days).toBe(3);
		expect(program?.rooms).toBeGreaterThanOrEqual(3);
		expect(program?.tracks).toBeGreaterThanOrEqual(3);
		expect(program?.formats).toBeGreaterThanOrEqual(3);
		expect(program?.rich_session_cards).toBeGreaterThanOrEqual(3);

		const speakers = await listPublicSpeakersForEvent(env.DB, demoEventId);
		expect(speakers.length).toBeGreaterThanOrEqual(5);
		expect(speakers.filter((speaker) => speaker.job_title && speaker.company).length).toBeGreaterThanOrEqual(3);
		expect(speakers.filter((speaker) => speaker.has_headshot === 0).map((speaker) => speaker.display_name))
			.toContain("Amara Diallo");
	});

	it("seeds five validated, event-scoped public embeds and publishes only published sessions", async () => {
		await runDemoSeed();

		const embeds = await env.DB.prepare(`SELECT id, name, slug, widget_type, config_json
			FROM public_embeds WHERE event_id = ? ORDER BY slug`).bind(demoEventId).all<{
			id: string;
			name: string;
			slug: string;
			widget_type: string;
			config_json: string;
		}>();
		expect(embeds.results.map((embed) => `${embed.slug}:${embed.widget_type}`)).toEqual([
			"agenda:agenda",
			"itinerary:itinerary",
			"sessions:sessions",
			"speaker-gallery:speaker_gallery",
			"speakers:speakers",
		]);
		for (const embed of embeds.results) {
			const config = JSON.parse(embed.config_json) as Record<string, unknown>;
			expect(parseEmbedInput({ name: embed.name, slug: embed.slug, widgetType: embed.widget_type, ...config })).toMatchObject({ ok: true });
		}
		for (const slug of ["speakers", "speaker-gallery"]) {
			const config = JSON.parse(embeds.results.find((embed) => embed.slug === slug)!.config_json) as { visibleFields: string[] };
			expect(config.visibleFields).toEqual(expect.arrayContaining(["headshot", "jobTitle", "company", "bio"]));
		}
		const filteredSessions = await buildPublicEmbedPayload(env.DB, "demo-cfp-to-stage", "sessions");
		expect(filteredSessions?.sessions).toHaveLength(2);
		expect(filteredSessions?.sessions.every((session) => session.trackId === "demo-track-agents" && ["Stage", "Lightning"].includes(session.format) && session.room === "Main Stage")).toBe(true);
		const speakerPayload = await buildPublicEmbedPayload(env.DB, "demo-cfp-to-stage", "speakers");
		expect(speakerPayload?.speakers).toContainEqual(expect.objectContaining({ name: "Amara Diallo", jobTitle: "Staff Engineer", company: "Resilient Labs" }));

		await env.DB.prepare("UPDATE public_embeds SET name = 'Stale agenda', config_json = '{}', updated_at = ? WHERE id = ? AND event_id = ?").bind(1_790_000_000_000, "demo-embed-agenda", demoEventId).run();
		await runDemoSeed();
		expect(await env.DB.prepare("SELECT name, config_json FROM public_embeds WHERE id = ? AND event_id = ?").bind("demo-embed-agenda", demoEventId).first()).toEqual({
			name: "Conference agenda",
			config_json: '{"brandColor":"#2563eb","trackIds":[],"formats":[],"rooms":[],"visibleFields":["title","time","room","track","speakers","abstract","format"]}',
		});

		const form = await env.DB.prepare("SELECT id FROM cfp_forms WHERE event_id = ? AND kind = 'public' LIMIT 1").bind(demoEventId).first<{ id: string }>();
		await env.DB.batch([
			env.DB.prepare("INSERT OR IGNORE INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('demo-embed-hidden-session', ?, ?, 'scheduled', ?, ?, ?)").bind(form!.id, demoEventId, JSON.stringify({ title: "Scheduled demo session" }), 1_790_000_000_000, 1_790_000_000_000),
			env.DB.prepare("INSERT OR IGNORE INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES ('demo-embed-hidden-slot', ?, 'demo-embed-hidden-session', 'Main Stage', ?, ?, 'demo-embed-hidden@conference-engine.invalid', ?, ?)").bind(demoEventId, 1_790_000_000_000, 1_790_001_800_000, 1_790_000_000_000, 1_790_000_000_000),
		]);
		const payload = await buildPublicEmbedPayload(env.DB, "demo-cfp-to-stage", "agenda");
		expect(payload?.sessions.length).toBeGreaterThan(0);
		expect(payload?.sessions.map((session) => session.title)).not.toContain("Scheduled demo session");
	});
});
