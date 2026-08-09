import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import demoSeed from "../../scripts/seed-demo.sql?raw";
import { listPublicSpeakersForEvent } from "@/lib/db/queries";

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
});
