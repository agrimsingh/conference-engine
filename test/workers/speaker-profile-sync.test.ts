import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { getSpeakerProfile } from "@/lib/db/queries";
import { updateSpeakerProfile } from "@/lib/speakers/profile";
import {
	listEventSpeakerRoster,
	resetSpeakerTasksDueAtCache,
	upsertEventSpeakerProfile,
} from "@/lib/speakers/roster";

const now = 1_780_700_000_000;

async function seedEvent(id: string): Promise<void> {
	await env.DB
		.prepare(
			"INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES (?, ?, ?, 'UTC', ?, ?)",
		)
		.bind(id, id, id, now, now)
		.run();
	await env.DB
		.prepare(
			"INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES (?, ?, 'cfp', 'CFP', 'open', ?, ?)",
		)
		.bind(`${id}-form`, id, now, now)
		.run();
}

afterEach(() => {
	resetSpeakerTasksDueAtCache();
});

describe("speaker profile ↔ roster sync", () => {
	it("shows portal speaker_profiles updates on the organizer roster query", async () => {
		await seedEvent("sync-portal");
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO people (id, email, name, created_at) VALUES ('sync-portal-person', 'portal@example.test', 'Portal', ?)",
			).bind(now),
			env.DB.prepare(
				`INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_person_id, created_at, updated_at)
				 VALUES ('sync-portal-sub', 'sync-portal-form', 'sync-portal', 'accepted', '{}', 'sync-portal-person', ?, ?)`,
			).bind(now, now),
			env.DB.prepare(
				`INSERT INTO submission_speakers (id, submission_id, person_id, name, email, bio, position, status, confirmed_at, added_after_acceptance)
				 VALUES ('sync-portal-ss', 'sync-portal-sub', 'sync-portal-person', 'Portal', 'portal@example.test', NULL, 0, 'confirmed', ?, 0)`,
			).bind(now),
			env.DB.prepare(
				`INSERT INTO event_speaker_profiles (
					id, event_id, person_id, job_title, company, social_json, workflow_status, created_at, updated_at
				) VALUES (
					'esp-sync-portal', 'sync-portal', 'sync-portal-person', 'Stale Title', 'Stale Co', NULL, 'confirmed', ?, ?
				)`,
			).bind(now, now),
		]);

		const saved = await updateSpeakerProfile(env.DB, {
			eventId: "sync-portal",
			personId: "sync-portal-person",
			displayName: "Portal Name",
			bio: "Portal bio",
			jobTitle: "Staff Engineer",
			company: "65 Labs",
			salutation: "Dr",
			pronouns: "she/her",
			honorific: "PhD",
			social: {
				github: "portal-gh",
				linkedin: "https://linkedin.com/in/portal",
				website: "https://portal.example",
				facebook: "https://facebook.com/portal",
				twitter: "@portal",
			},
		});
		expect(saved.ok).toBe(true);
		if (!saved.ok) throw new Error("expected profile save");
		expect(saved.profile).toMatchObject({
			display_name: "Portal Name",
			salutation: "Dr",
			pronouns: "she/her",
			honorific: "PhD",
			social_json: JSON.stringify({
				twitter: "@portal",
				linkedin: "https://linkedin.com/in/portal",
				github: "portal-gh",
				website: "https://portal.example",
				facebook: "https://facebook.com/portal",
			}),
		});

		const stored = await getSpeakerProfile(env.DB, "sync-portal", "sync-portal-person");
		expect(stored).toMatchObject({
			salutation: "Dr",
			pronouns: "she/her",
			honorific: "PhD",
		});

		const roster = await listEventSpeakerRoster(env.DB, "sync-portal");
		expect(roster).toMatchObject([
			{
				personId: "sync-portal-person",
				name: "Portal Name",
				jobTitle: "Staff Engineer",
				company: "65 Labs",
				salutation: "Dr",
				pronouns: "she/her",
				honorific: "PhD",
				workflowStatus: "confirmed",
				socials: {
					github: "portal-gh",
					linkedin: "https://linkedin.com/in/portal",
					website: "https://portal.example",
					facebook: "https://facebook.com/portal",
					twitter: "@portal",
				},
			},
		]);
	});

	it("shows organizer roster profile updates via getSpeakerProfile", async () => {
		await seedEvent("sync-org");
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO people (id, email, name, created_at) VALUES ('sync-org-person', 'org@example.test', 'Org', ?)",
			).bind(now),
			env.DB.prepare(
				`INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_person_id, created_at, updated_at)
				 VALUES ('sync-org-sub', 'sync-org-form', 'sync-org', 'accepted', '{}', 'sync-org-person', ?, ?)`,
			).bind(now, now),
			env.DB.prepare(
				`INSERT INTO submission_speakers (id, submission_id, person_id, name, email, bio, position, status, confirmed_at, added_after_acceptance)
				 VALUES ('sync-org-ss', 'sync-org-sub', 'sync-org-person', 'Org', 'org@example.test', NULL, 0, 'confirmed', ?, 0)`,
			).bind(now),
		]);

		const upserted = await upsertEventSpeakerProfile(env.DB, {
			eventId: "sync-org",
			personId: "sync-org-person",
			input: {
				email: "org@example.test",
				name: "Organizer Name",
				jobTitle: "Principal",
				company: "Conference Co",
				workflowStatus: "invited",
				socials: { website: "https://org.example.test" },
			},
			now: now + 1,
		});
		expect(upserted.ok).toBe(true);
		expect(upserted.ok && upserted.speaker).toMatchObject({
			jobTitle: "Principal",
			company: "Conference Co",
			workflowStatus: "invited",
			socials: { website: "https://org.example.test" },
		});

		const profile = await getSpeakerProfile(env.DB, "sync-org", "sync-org-person");
		expect(profile).toMatchObject({
			display_name: "Organizer Name",
			job_title: "Principal",
			company: "Conference Co",
			social_json: JSON.stringify({ website: "https://org.example.test" }),
		});

		const esp = await env.DB
			.prepare(
				"SELECT job_title, company, social_json, workflow_status FROM event_speaker_profiles WHERE event_id = ? AND person_id = ?",
			)
			.bind("sync-org", "sync-org-person")
			.first<{
				job_title: string | null;
				company: string | null;
				social_json: string | null;
				workflow_status: string;
			}>();
		expect(esp).toMatchObject({
			job_title: null,
			company: null,
			social_json: null,
			workflow_status: "invited",
		});
	});
});
