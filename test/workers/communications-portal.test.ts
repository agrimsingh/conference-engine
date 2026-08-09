import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { listEventDeliveryHistory, listReminderRecipients } from "@/lib/email/communications";
import { sendTaskReminders } from "@/lib/email/reminders";
import { retryEmailDelivery, sendTemplatedEmail } from "@/lib/email/resend";
import { updateSpeakerProfile } from "@/lib/speakers/profile";

const now = 1_780_500_000_000;

async function seedEvent(id: string): Promise<void> {
	await env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES (?, ?, ?, 'UTC', ?, ?)").bind(id, id, id, now, now).run();
	await env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES (?, ?, 'cfp', 'CFP', 'open', ?, ?)").bind(`${id}-form`, id, now, now).run();
}

describe("communications and portal tenancy", () => {
	it("treats an explicit empty reminder segment as zero recipients", async () => {
		await seedEvent("empty-reminder");
		expect(await sendTaskReminders({ DB: env.DB, AUTH_SECRET: "test", APP_ORIGIN: "https://conference.example.test" }, { eventId: "empty-reminder", personIds: [] })).toEqual({ sent: 0, skipped: 0 });
	});
	it("keeps delivery history and reminder recipient segments inside the selected event", async () => {
		await seedEvent("comm-a");
		await seedEvent("comm-b");
		await env.DB.batch([
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('comm-person-a', 'a@example.test', 'A', ?)").bind(now),
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('comm-person-b', 'b@example.test', 'B', ?)").bind(now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('comm-sub-a', 'comm-a-form', 'comm-a', 'accepted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('comm-sub-b', 'comm-b-form', 'comm-b', 'accepted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO speaker_tasks (id, event_id, submission_id, person_id, template_key, template_required, status, created_at, updated_at) VALUES ('comm-task-a', 'comm-a', 'comm-sub-a', 'comm-person-a', 'bio', 1, 'pending', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO speaker_tasks (id, event_id, submission_id, person_id, template_key, template_required, status, created_at, updated_at) VALUES ('comm-task-b', 'comm-b', 'comm-sub-b', 'comm-person-b', 'bio', 1, 'pending', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO email_deliveries (delivery_key, event_id, submission_id, template_key, to_email, subject, status, attempt_count, created_at, updated_at) VALUES ('comm-delivery-a', 'comm-a', 'comm-sub-a', 'task_reminder', 'a@example.test', 'A', 'sent', 1, ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO email_deliveries (delivery_key, event_id, submission_id, template_key, to_email, subject, status, attempt_count, created_at, updated_at) VALUES ('comm-delivery-b', 'comm-b', 'comm-sub-b', 'task_reminder', 'b@example.test', 'B', 'failed', 1, ?, ?)").bind(now, now),
		]);
		expect((await listEventDeliveryHistory(env.DB, "comm-a")).map((row) => row.delivery_key)).toEqual(["comm-delivery-a"]);
		expect(await listReminderRecipients(env.DB, "comm-a")).toMatchObject([{ person_id: "comm-person-a", email: "a@example.test", pending_count: 1, last_delivery_status: "sent" }]);
	});

	it("allows a portal profile only for an event tied to that portal person and never writes demos", async () => {
		await seedEvent("profile-live");
		await seedEvent("profile-other");
		await env.DB.batch([
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('profile-person', 'profile@example.test', 'Old', ?)").bind(now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_person_id, created_at, updated_at) VALUES ('profile-sub', 'profile-live-form', 'profile-live', 'accepted', '{}', 'profile-person', ?, ?)").bind(now, now),
		]);
		const saved = await updateSpeakerProfile(env.DB, { eventId: "profile-live", personId: "profile-person", displayName: "New name", bio: "An event-specific biography." });
		expect(saved.ok && saved.profile.display_name).toBe("New name");
		expect(await updateSpeakerProfile(env.DB, { eventId: "profile-other", personId: "profile-person", displayName: "Nope", bio: "" })).toMatchObject({ ok: false, status: 403 });
		await env.DB.prepare("UPDATE events SET mode = 'demo' WHERE id = 'profile-live'").run();
		expect(await updateSpeakerProfile(env.DB, { eventId: "profile-live", personId: "profile-person", displayName: "Demo write", bio: "No" })).toMatchObject({ ok: false, status: 403 });
		expect(await env.DB.prepare("SELECT display_name FROM speaker_profiles WHERE event_id = 'profile-live' AND person_id = 'profile-person'").first()).toEqual({ display_name: "New name" });
	});

	it("replays only the exact persisted envelope and safely skips an ambiguous in-flight attempt", async () => {
		await seedEvent("retry-event");
		const runtime = { authSecret: "retry-secret", resendApiKey: "retry-key", resendFromEmail: "team@example.test" };
		const originalFetch = globalThis.fetch;
		let calls = 0;
		globalThis.fetch = async (_input, init) => {
			calls += 1;
			if (calls === 1) return new Response(JSON.stringify({ message: "rejected" }), { status: 422 });
			if (calls === 2) return new Response(JSON.stringify({ id: "replayed" }), { status: 200 });
			throw new Error("should not send while ambiguous lease is live");
		};
		try {
			const first = await sendTemplatedEmail(env.DB, { eventId: "retry-event", submissionId: null, templateKey: "calendar_invite", toEmail: "speaker@example.test", context: { eventName: "Retry", submitterName: "Speaker", title: "Talk" }, override: { subject: "Exact subject", text: "Exact body" }, attachments: [{ filename: "invite.ics", content: "BEGIN:VCALENDAR", contentType: "text/calendar" }], runtime });
			expect(first).toMatchObject({ ok: false, failureKind: "confirmed" });
			const stored = await env.DB.prepare("SELECT subject, text_body, attachments_json FROM email_delivery_envelopes WHERE delivery_key = ?").bind(first.messageId).first<{ subject: string; text_body: string; attachments_json: string }>();
			expect(stored).toMatchObject({ subject: "Exact subject", text_body: "Exact body" });
			const replay = await retryEmailDelivery(env.DB, { eventId: "retry-event", deliveryKey: first.messageId, runtime });
			expect(replay).toMatchObject({ ok: true, status: "sent", messageId: first.messageId });
			const ambiguous = await sendTemplatedEmail(env.DB, { eventId: "retry-event", submissionId: null, templateKey: "task_reminder", toEmail: "ambiguous@example.test", context: { eventName: "Retry", submitterName: "Speaker", title: "Tasks" }, runtime });
			expect(ambiguous).toMatchObject({ ok: false, failureKind: "ambiguous" });
			const callsAfterAmbiguous = calls;
			// The lease keeps an ambiguous provider outcome from being duplicated.
			expect(await retryEmailDelivery(env.DB, { eventId: "retry-event", deliveryKey: ambiguous.messageId, runtime })).toMatchObject({ ok: true, status: "skipped", messageId: ambiguous.messageId });
			expect(calls).toBe(callsAfterAmbiguous);
		} finally { globalThis.fetch = originalFetch; }
	});
});
