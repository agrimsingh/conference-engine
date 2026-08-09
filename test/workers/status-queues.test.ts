import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import {
	decisionNotifiedLabel,
	listDecisionNotifiedForSubmissions,
} from "@/lib/db/queries";
import { decideSubmission } from "@/lib/speakers/decide";
import { withdrawSubmission } from "@/lib/speakers/withdraw";

const now = 1_780_700_000_000;

vi.mock("@/lib/email/notify", () => ({
	notifySubmissionLifecycle: vi.fn(async () => ({
		ok: true,
		status: "sent",
		providerId: "mock",
		messageId: "mock-msg",
	})),
	notifyConfirmedSpeakerLifecycle: vi.fn(async () => [
		{ ok: true, status: "sent", providerId: "mock", messageId: "mock-msg" },
	]),
}));

describe("status queues: decide ≠ notify + withdraw", () => {
	it("decides without email, derives notified from email_deliveries, and withdraws", async () => {
		await env.DB.batch([
			env.DB.prepare(
				`INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at)
         VALUES ('queue-event', 'queue-event', 'Queue Event', 'UTC', 'live', ?, ?)`,
			).bind(now, now),
			env.DB.prepare(
				`INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at)
         VALUES ('queue-form', 'queue-event', 'cfp', 'CFP', 'open', ?, ?)`,
			).bind(now, now),
			env.DB.prepare(
				`INSERT INTO people (id, email, name, created_at)
         VALUES ('queue-person', 'speaker@queue.test', 'Queue Speaker', ?)`,
			).bind(now),
			env.DB.prepare(
				`INSERT INTO submissions (
           id, form_id, event_id, status, submitter_email, submitter_name,
           submitter_person_id, answers_json, created_at, updated_at
         ) VALUES (
           'queue-sub', 'queue-form', 'queue-event', 'submitted',
           'speaker@queue.test', 'Queue Speaker', 'queue-person',
           '{"title":"Queue talk"}', ?, ?
         )`,
			).bind(now, now),
			env.DB.prepare(
				`INSERT INTO submissions (
           id, form_id, event_id, status, submitter_email, submitter_name,
           submitter_person_id, answers_json, created_at, updated_at
         ) VALUES (
           'queue-withdraw', 'queue-form', 'queue-event', 'under_review',
           'speaker@queue.test', 'Queue Speaker', 'queue-person',
           '{"title":"Withdraw me"}', ?, ?
         )`,
			).bind(now, now),
			env.DB.prepare(
				`INSERT INTO submission_speakers (
           id, submission_id, person_id, name, email, bio, position, status, confirmed_at, added_after_acceptance
         ) VALUES (
           'queue-speaker', 'queue-sub', 'queue-person', 'Queue Speaker', 'speaker@queue.test',
           'bio', 0, 'confirmed', ?, 0
         )`,
			).bind(now),
		]);

		const rejected = await decideSubmission(env.DB, "queue-sub", "reject", {
			send: false,
		});
		expect(rejected).toMatchObject({
			ok: true,
			status: "rejected",
			email: null,
		});
		const afterDecide = await env.DB
			.prepare("SELECT status FROM submissions WHERE id = ?")
			.bind("queue-sub")
			.first<{ status: string }>();
		expect(afterDecide?.status).toBe("rejected");

		let notified = await listDecisionNotifiedForSubmissions(env.DB, ["queue-sub"]);
		expect(notified.get("queue-sub")).toBe(false);
		expect(decisionNotifiedLabel("rejected", false)).toBe("Unnotified");

		await env.DB
			.prepare(
				`INSERT INTO email_deliveries (
           delivery_key, event_id, submission_id, template_key, to_email, subject,
           status, attempt_count, created_at, updated_at, sent_at
         ) VALUES (
           'queue-delivery', 'queue-event', 'queue-sub', 'rejection',
           'speaker@queue.test', 'Rejected', 'sent', 1, ?, ?, ?
         )`,
			)
			.bind(now, now, now)
			.run();

		notified = await listDecisionNotifiedForSubmissions(env.DB, ["queue-sub"]);
		expect(notified.get("queue-sub")).toBe(true);
		expect(decisionNotifiedLabel("rejected", true)).toBe("Notified");

		const withdrawn = await withdrawSubmission(env.DB, {
			submissionId: "queue-withdraw",
			personId: "queue-person",
		});
		expect(withdrawn).toEqual({
			ok: true,
			submissionId: "queue-withdraw",
			status: "withdrawn",
		});
		const afterWithdraw = await env.DB
			.prepare("SELECT status FROM submissions WHERE id = ?")
			.bind("queue-withdraw")
			.first<{ status: string }>();
		expect(afterWithdraw?.status).toBe("withdrawn");
	});
});
