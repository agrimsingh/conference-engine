import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import demoSeed from "../../scripts/seed-demo.sql?raw";

const now = 1_780_200_000_000;

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

async function clearDemoFixture(): Promise<void> {
	const eventId = "demo-cfp-to-stage-2026";
	await env.DB.batch([
		env.DB.prepare("DELETE FROM agenda_calendar_lifecycles WHERE event_id = ?").bind(eventId),
		env.DB.prepare("DELETE FROM agenda_slots WHERE event_id = ?").bind(eventId),
		env.DB.prepare("DELETE FROM evaluation_scores WHERE plan_id = 'demo-review-plan'").bind(),
		env.DB.prepare("DELETE FROM review_assignments WHERE plan_id = 'demo-review-plan'").bind(),
		env.DB.prepare("DELETE FROM reviewers WHERE plan_id = 'demo-review-plan'").bind(),
		env.DB.prepare("DELETE FROM evaluation_criteria WHERE plan_id = 'demo-review-plan'").bind(),
		env.DB.prepare("DELETE FROM evaluation_plans WHERE id = 'demo-review-plan'").bind(),
		env.DB.prepare("DELETE FROM speaker_tasks WHERE event_id = ?").bind(eventId),
		env.DB.prepare("DELETE FROM task_templates WHERE event_id = ?").bind(eventId),
		env.DB.prepare("DELETE FROM speaker_profiles WHERE event_id = ?").bind(eventId),
		env.DB.prepare("DELETE FROM submission_speakers WHERE submission_id IN (SELECT id FROM submissions WHERE event_id = ?)").bind(eventId),
		env.DB.prepare("DELETE FROM submissions WHERE event_id = ?").bind(eventId),
		env.DB.prepare("DELETE FROM agenda_tracks WHERE event_id = ?").bind(eventId),
		env.DB.prepare("DELETE FROM event_rooms WHERE event_id = ?").bind(eventId),
		env.DB.prepare("DELETE FROM form_fields WHERE form_id = 'demo-cfp-form'").bind(),
		env.DB.prepare("DELETE FROM cfp_forms WHERE id = 'demo-cfp-form'").bind(),
		env.DB.prepare("DELETE FROM events WHERE id = ?").bind(eventId),
		env.DB.prepare("DELETE FROM people WHERE id LIKE 'demo-person-%'").bind(),
	]);
}

describe("demo seed collision safety", () => {
	it("skips colliding live identities and IDs while continuing to seed only the demo event", async () => {
		await clearDemoFixture();
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES ('seed-collision-live-event', 'seed-collision-live', 'Live collision event', 'UTC', 'live', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('seed-collision-live-form', 'seed-collision-live-event', 'cfp', 'Live CFP', 'open', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('demo-person-amara-diallo', 'amara.diallo@example.invalid', 'Live Amara', ?)").bind(now),
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('demo-person-priya-nair', 'priya.nair@example.invalid', 'Live Priya', ?)").bind(now),
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('demo-person-diego-reyes', 'diego.reyes@example.invalid', 'Live Diego', ?)").bind(now),
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('demo-person-hana-sato', 'hana.sato@example.invalid', 'Live Hana', ?)").bind(now),
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('seed-collision-submitter', 'submission-collision@example.test', 'Live submitter', ?)").bind(now),
			env.DB.prepare("INSERT INTO event_members (id, event_id, person_id, role, created_at) VALUES ('seed-collision-membership', 'seed-collision-live-event', 'demo-person-priya-nair', 'speaker', ?)").bind(now),
			env.DB.prepare("INSERT INTO assets (id, event_id, r2_key, filename, uploaded_by_person_id, created_at) VALUES ('seed-collision-asset', 'seed-collision-live-event', 'seed-collision/live-diego.png', 'live-diego.png', 'demo-person-diego-reyes', ?)").bind(now),
			env.DB.prepare("INSERT INTO auth_challenges (token_hash, kind, person_id, state, expires_at, created_at) VALUES ('seed-collision-auth', 'organizer_login', 'demo-person-hana-sato', 'active', ?, ?)").bind(now + 86_400_000, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_person_id, created_at, updated_at) VALUES ('seed-collision-live-submission', 'seed-collision-live-form', 'seed-collision-live-event', 'accepted', '{\"title\":\"Live Amara talk\"}', 'demo-person-amara-diallo', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_person_id, created_at, updated_at) VALUES ('demo-sub-jonas-weber', 'seed-collision-live-form', 'seed-collision-live-event', 'submitted', '{\"title\":\"Reserved ID stays live\"}', 'seed-collision-submitter', ?, ?)").bind(now, now),
		]);

		await runDemoSeed();
		expect(await env.DB.prepare(`SELECT COUNT(*) AS count
			FROM agenda_slots a
			INNER JOIN agenda_slots b ON b.event_id = a.event_id AND b.track_id = a.track_id AND b.id > a.id
			WHERE a.event_id = 'demo-cfp-to-stage-2026'
				AND a.track_id IS NOT NULL
				AND a.starts_at < b.ends_at
				AND b.starts_at < a.ends_at`).first<{ count: number }>()).toEqual({ count: 0 });

		expect(await env.DB.prepare("SELECT name, email FROM people WHERE id = 'demo-person-amara-diallo'").first()).toEqual({ name: "Live Amara", email: "amara.diallo@example.invalid" });
		expect(await env.DB.prepare("SELECT event_id, form_id FROM submissions WHERE id = 'demo-sub-jonas-weber'").first()).toEqual({ event_id: "seed-collision-live-event", form_id: "seed-collision-live-form" });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM submissions WHERE id = 'demo-sub-amara-diallo' AND event_id = 'demo-cfp-to-stage-2026'").first()).toEqual({ count: 0 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM submission_speakers WHERE id = 'demo-speaker-amara-diallo'").first()).toEqual({ count: 0 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_profiles WHERE id = 'demo-profile-amara-diallo'").first()).toEqual({ count: 0 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_tasks WHERE id LIKE 'demo-task-amara-%'").first()).toEqual({ count: 0 });
		expect(await env.DB.prepare(`SELECT COUNT(*) AS count
			FROM submissions
			WHERE event_id = 'demo-cfp-to-stage-2026'
				AND submitter_person_id IN ('demo-person-priya-nair', 'demo-person-diego-reyes', 'demo-person-hana-sato')`).first()).toEqual({ count: 0 });
		expect(await env.DB.prepare(`SELECT
			(SELECT COUNT(*) FROM event_members WHERE id = 'seed-collision-membership' AND person_id = 'demo-person-priya-nair') AS memberships,
			(SELECT COUNT(*) FROM assets WHERE id = 'seed-collision-asset' AND uploaded_by_person_id = 'demo-person-diego-reyes') AS assets,
			(SELECT COUNT(*) FROM auth_challenges WHERE token_hash = 'seed-collision-auth' AND person_id = 'demo-person-hana-sato') AS auth_challenges`).first()).toEqual({
			memberships: 1,
			assets: 1,
			auth_challenges: 1,
		});
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM submissions WHERE id = 'demo-sub-maya-chen' AND event_id = 'demo-cfp-to-stage-2026'").first()).toEqual({ count: 1 });

		const beforeSecondSeed = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM events WHERE id = 'demo-cfp-to-stage-2026') AS events, (SELECT COUNT(*) FROM submissions WHERE event_id = 'demo-cfp-to-stage-2026') AS submissions, (SELECT COUNT(*) FROM agenda_slots WHERE event_id = 'demo-cfp-to-stage-2026') AS slots").first();
		await runDemoSeed();
		expect(await env.DB.prepare("SELECT (SELECT COUNT(*) FROM events WHERE id = 'demo-cfp-to-stage-2026') AS events, (SELECT COUNT(*) FROM submissions WHERE event_id = 'demo-cfp-to-stage-2026') AS submissions, (SELECT COUNT(*) FROM agenda_slots WHERE event_id = 'demo-cfp-to-stage-2026') AS slots").first()).toEqual(beforeSecondSeed);
	});
});
