import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetReminderDueAtColumnCache, sendTaskReminders } from "@/lib/email/reminders";
import {
	emailRosterSpeakers,
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
	resetReminderDueAtColumnCache();
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

describe("speaker roster reminders and bulk email", () => {
	it("cron due_or_overdue skips undated and future tasks; all_pending forces them", async () => {
		await seedEvent("due-filter-event");
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO people (id, email, name, created_at) VALUES ('due-person', 'due@example.test', 'Due', ?)",
			).bind(now),
			env.DB.prepare(
				`INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at)
				 VALUES ('due-submission', 'due-filter-event-form', 'due-filter-event', 'accepted', '{}', ?, ?)`,
			).bind(now, now),
			env.DB.prepare(
				`INSERT INTO speaker_tasks (
					id, event_id, submission_id, person_id, template_key, template_label, template_required, status, due_at, created_at, updated_at
				) VALUES (
					'due-future', 'due-filter-event', 'due-submission', 'due-person', 'slides', 'Slides', 1, 'pending', ?, ?, ?
				)`,
			).bind(now + 86_400_000, now, now),
			env.DB.prepare(
				`INSERT INTO speaker_tasks (
					id, event_id, submission_id, person_id, template_key, template_label, template_required, status, due_at, created_at, updated_at
				) VALUES (
					'due-undated', 'due-filter-event', 'due-submission', 'due-person', 'bio', 'Bio', 1, 'pending', NULL, ?, ?
				)`,
			).bind(now, now),
		]);

		const reminderEnv = {
			DB: env.DB,
			SESSIONS: env.SESSIONS,
			AUTH_SECRET: "due-filter-secret",
			APP_ORIGIN: "https://conference.example.test",
			RESEND_API_KEY: "test",
			RESEND_FROM_EMAIL: "team@example.test",
		};
		expect(await sendTaskReminders(reminderEnv, { eventId: "due-filter-event", now, dueMode: "due_or_overdue" })).toEqual({
			sent: 0,
			skipped: 0,
		});

		await env.DB
			.prepare("UPDATE speaker_tasks SET due_at = ? WHERE id = 'due-future'")
			.bind(now - 1)
			.run();
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "due-provider" }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		try {
			expect(await sendTaskReminders(reminderEnv, { eventId: "due-filter-event", now, dueMode: "due_or_overdue" })).toEqual({
				sent: 1,
				skipped: 0,
			});
			const [, reminderInit] = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
			expect(String(reminderInit.body)).toContain("Slides");
			expect(String(reminderInit.body)).not.toContain("Bio");

			const forced = await sendTaskReminders(reminderEnv, {
				eventId: "due-filter-event",
				now,
				dueMode: "all_pending",
			});
			expect(forced.sent + forced.skipped).toBeGreaterThanOrEqual(1);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("sends speaker_announcement with composer subject/body instead of task_reminder", async () => {
		await seedEvent("announce-event");
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO people (id, email, name, created_at) VALUES ('announce-person', 'announce@example.test', 'Ann', ?)",
			).bind(now),
			env.DB.prepare(
				`INSERT INTO event_speaker_profiles (
					id, event_id, person_id, job_title, company, social_json, workflow_status, created_at, updated_at
				) VALUES (
					'esp-announce', 'announce-event', 'announce-person', NULL, NULL, NULL, 'confirmed', ?, ?
				)`,
			).bind(now, now),
		]);

		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "announce-provider" }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		try {
			const result = await emailRosterSpeakers(
				{
					DB: env.DB,
					SESSIONS: env.SESSIONS,
					AUTH_SECRET: "announce-secret",
					APP_ORIGIN: "https://conference.example.test",
					RESEND_API_KEY: "test",
					RESEND_FROM_EMAIL: "team@example.test",
				},
				{
					eventId: "announce-event",
					personIds: ["announce-person"],
					templateKey: "speaker_announcement",
					subject: "Room change for {{event_name}}",
					text: "Hi {{submitter_name}}, please check the portal.",
					now,
				},
			);
			expect(result).toMatchObject({ sent: 1, skipped: 0, templateKey: "speaker_announcement" });
			expect(result.error).toBeUndefined();
			const [, announceInit] = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
			const body = String(announceInit.body);
			expect(body).toContain("Room change for announce-event");
			expect(body).toContain("Hi Ann, please check the portal.");
			expect(body).not.toContain("outstanding speaker task");
			const delivery = await env.DB
				.prepare("SELECT template_key, subject FROM email_deliveries WHERE event_id = 'announce-event'")
				.first<{ template_key: string; subject: string }>();
			expect(delivery).toEqual({
				template_key: "speaker_announcement",
				subject: "Room change for announce-event",
			});
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
