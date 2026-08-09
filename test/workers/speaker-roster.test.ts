import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import {
	listEventSpeakerRoster,
	resetSpeakerTasksDueAtCache,
	upsertEventSpeakerProfile,
} from "@/lib/speakers/roster";

const now = 1_780_600_000_000;

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

describe("speaker roster query", () => {
	it("includes accepted-pipeline and confirmed speakers, excludes rejected drafts, and filters by workflow status", async () => {
		await seedEvent("roster-event");
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO people (id, email, name, created_at) VALUES ('roster-ada', 'ada@example.test', 'Ada', ?)",
			).bind(now),
			env.DB.prepare(
				"INSERT INTO people (id, email, name, created_at) VALUES ('roster-grace', 'grace@example.test', 'Grace', ?)",
			).bind(now),
			env.DB.prepare(
				"INSERT INTO people (id, email, name, created_at) VALUES ('roster-rejected', 'reject@example.test', 'Reject', ?)",
			).bind(now),
			env.DB.prepare(
				"INSERT INTO people (id, email, name, created_at) VALUES ('roster-manual', 'manual@example.test', 'Manual', ?)",
			).bind(now),
			env.DB.prepare(
				`INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at)
				 VALUES ('roster-accepted', 'roster-event-form', 'roster-event', 'accepted', '{}', ?, ?)`,
			).bind(now, now),
			env.DB.prepare(
				`INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at)
				 VALUES ('roster-submitted', 'roster-event-form', 'roster-event', 'submitted', '{}', ?, ?)`,
			).bind(now, now),
			env.DB.prepare(
				`INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at)
				 VALUES ('roster-rejected', 'roster-event-form', 'roster-event', 'rejected', '{}', ?, ?)`,
			).bind(now, now),
			env.DB.prepare(
				`INSERT INTO submission_speakers (id, submission_id, person_id, name, email, bio, position, status, confirmed_at, added_after_acceptance)
				 VALUES ('ss-ada', 'roster-accepted', 'roster-ada', 'Ada', 'ada@example.test', NULL, 0, 'confirmed', ?, 0)`,
			).bind(now),
			env.DB.prepare(
				`INSERT INTO submission_speakers (id, submission_id, person_id, name, email, bio, position, status, confirmed_at, added_after_acceptance)
				 VALUES ('ss-grace', 'roster-submitted', 'roster-grace', 'Grace', 'grace@example.test', NULL, 0, 'confirmed', ?, 0)`,
			).bind(now),
			env.DB.prepare(
				`INSERT INTO submission_speakers (id, submission_id, person_id, name, email, bio, position, status, confirmed_at, added_after_acceptance)
				 VALUES ('ss-reject', 'roster-rejected', 'roster-rejected', 'Reject', 'reject@example.test', NULL, 0, 'confirmed', ?, 0)`,
			).bind(now),
			env.DB.prepare(
				`INSERT INTO event_speaker_profiles (
					id, event_id, person_id, job_title, company, social_json, workflow_status, created_at, updated_at
				) VALUES (
					'esp-ada', 'roster-event', 'roster-ada', 'Mathematician', 'Analytical', '{"twitter":"ada"}', 'confirmed', ?, ?
				)`,
			).bind(now, now),
			env.DB.prepare(
				`INSERT INTO event_speaker_profiles (
					id, event_id, person_id, job_title, company, social_json, workflow_status, created_at, updated_at
				) VALUES (
					'esp-manual', 'roster-event', 'roster-manual', 'Producer', 'Lab', NULL, 'invited', ?, ?
				)`,
			).bind(now, now),
			env.DB.prepare(
				`INSERT INTO speaker_tasks (
					id, event_id, submission_id, person_id, template_key, template_label, template_required, status, created_at, updated_at
				) VALUES (
					'roster-task-ada', 'roster-event', 'roster-accepted', 'roster-ada', 'bio', 'Bio', 1, 'pending', ?, ?
				)`,
			).bind(now, now),
		]);

		const all = await listEventSpeakerRoster(env.DB, "roster-event");
		expect(all.map((row) => row.personId).sort()).toEqual([
			"roster-ada",
			"roster-grace",
			"roster-manual",
		]);
		expect(all.find((row) => row.personId === "roster-ada")).toMatchObject({
			email: "ada@example.test",
			jobTitle: "Mathematician",
			company: "Analytical",
			workflowStatus: "confirmed",
			pendingTaskCount: 1,
			socials: { twitter: "ada" },
		});
		expect(all.find((row) => row.personId === "roster-grace")?.workflowStatus).toBe("confirmed");

		const invited = await listEventSpeakerRoster(env.DB, "roster-event", { status: "invited" });
		expect(invited.map((row) => row.personId)).toEqual(["roster-manual"]);

		const searched = await listEventSpeakerRoster(env.DB, "roster-event", { q: "analytical" });
		expect(searched.map((row) => row.personId)).toEqual(["roster-ada"]);

		const updated = await upsertEventSpeakerProfile(env.DB, {
			eventId: "roster-event",
			personId: "roster-manual",
			input: {
				email: "manual@example.test",
				name: "Manual Updated",
				jobTitle: "Director",
				company: "Lab",
				workflowStatus: "declined",
				socials: { website: "https://lab.example.test" },
			},
			now: now + 1,
		});
		expect(updated.ok).toBe(true);
		const declined = await listEventSpeakerRoster(env.DB, "roster-event", { status: "declined" });
		expect(declined).toMatchObject([
			{
				personId: "roster-manual",
				name: "Manual Updated",
				jobTitle: "Director",
				workflowStatus: "declined",
				socials: { website: "https://lab.example.test" },
			},
		]);
	});
});
