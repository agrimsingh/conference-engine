import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetReminderDueAtColumnCache, sendTaskReminders } from "@/lib/email/reminders";

const now = 1_780_600_000_000;
const eventId = "targeted-reminder-event";
const personId = "targeted-reminder-person";

afterEach(() => {
	resetReminderDueAtColumnCache();
	vi.unstubAllGlobals();
});

describe("targeted task reminders", () => {
	it("sends selected speakers both pending template and action tasks", async () => {
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES (?, ?, 'Targeted reminders', 'UTC', ?, ?)",
			).bind(eventId, eventId, now, now),
			env.DB.prepare(
				"INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('targeted-reminder-form', ?, 'cfp', 'CFP', 'open', ?, ?)",
			).bind(eventId, now, now),
			env.DB.prepare(
				"INSERT INTO people (id, email, name, created_at) VALUES (?, 'targeted@example.test', 'Targeted', ?)",
			).bind(personId, now),
			env.DB.prepare(
				"INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('targeted-reminder-submission', 'targeted-reminder-form', ?, 'accepted', '{}', ?, ?)",
			).bind(eventId, now, now),
			env.DB.prepare(
				`INSERT INTO speaker_tasks (
					id, event_id, submission_id, person_id, template_key, template_label, template_required, status, created_at, updated_at
				) VALUES (
					'targeted-reminder-template-task', ?, 'targeted-reminder-submission', ?, 'bio', 'Biography', 1, 'pending', ?, ?
				)`,
			).bind(eventId, personId, now, now),
			env.DB.prepare(
				"INSERT INTO speaker_action_tasks (id, event_id, title, instructions, due_at, created_at, updated_at) VALUES ('targeted-reminder-action-task', ?, 'Sign release', NULL, NULL, ?, ?)",
			).bind(eventId, now, now),
			env.DB.prepare(
				"INSERT INTO speaker_action_task_assignments (id, event_id, task_id, person_id, status, created_at, updated_at) VALUES ('targeted-reminder-assignment', ?, 'targeted-reminder-action-task', ?, 'pending', ?, ?)",
			).bind(eventId, personId, now, now),
		]);

		const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify({ id: "targeted-reminder-provider" }), { status: 200 })));
		vi.stubGlobal("fetch", fetchMock);

		expect(
			await sendTaskReminders(
				{
					DB: env.DB,
					SESSIONS: env.SESSIONS,
					AUTH_SECRET: "targeted-reminder-secret",
					APP_ORIGIN: "https://conference.example.test",
					RESEND_API_KEY: "test",
					RESEND_FROM_EMAIL: "team@example.test",
				},
				{ eventId, personIds: [personId], now, dueMode: "all_pending" },
			),
		).toEqual({ sent: 1, skipped: 0 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const envelope = await env.DB
			.prepare("SELECT text_body FROM email_delivery_envelopes WHERE event_id = ? AND template_key = 'task_reminder'")
			.bind(eventId)
			.first<{ text_body: string }>();
		expect(envelope?.text_body).toContain("Biography");
		expect(envelope?.text_body).toContain("Sign release");
	});
});
