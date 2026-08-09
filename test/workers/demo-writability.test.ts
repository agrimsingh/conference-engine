import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createVerifiedDraft, finalizeDraft, issueDraftResumeToken, prepareDraftResumeDelivery, saveDraftForResume } from "@/lib/cfp/drafts";
import { insertSubmission } from "@/lib/cfp/submit";
import { hmacHash } from "@/lib/security/crypto";
import { upsertEvaluationScore } from "@/lib/evaluation/score";
import { completeFileTask, completeTextTask } from "@/lib/speakers/complete-task";
import { sendTaskReminders } from "@/lib/email/reminders";

const now = 1_780_000_000_000;
const eventId = "demo-immutability-event";
const formId = "demo-immutability-form";
const personId = "demo-immutability-person";
const submissionId = "demo-immutability-submission";
const taskId = "demo-immutability-task";
const draftId = "demo-immutability-draft";
const draftToken = "demo-immutability-token";

async function seedDemoFixture(): Promise<void> {
	await env.DB.batch([
		env.DB.prepare("INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES (?, ?, 'Demo immutability', 'UTC', 'demo', ?, ?)").bind(eventId, eventId, now, now),
		env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES (?, ?, 'cfp', 'Demo CFP', 'closed', ?, ?)").bind(formId, eventId, now, now),
		env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES (?, 'speaker@demo.invalid', 'Demo Speaker', ?)").bind(personId, now),
		env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES (?, ?, ?, 'submitted', '{\"title\":\"Demo submission\"}', ?, ?)").bind(submissionId, formId, eventId, now, now),
		env.DB.prepare("INSERT INTO speaker_tasks (id, event_id, submission_id, person_id, template_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'bio', 'pending', ?, ?)").bind(taskId, eventId, submissionId, personId, now, now),
		env.DB.prepare("INSERT INTO evaluation_plans (id, event_id, name, status, reviewer_token, created_at, updated_at) VALUES ('demo-immutability-plan', ?, 'Demo plan', 'active', 'demo-immutability-plan-token', ?, ?)").bind(eventId, now, now),
		env.DB.prepare("INSERT INTO reviewers (id, plan_id, name, token, created_at) VALUES ('demo-immutability-reviewer', 'demo-immutability-plan', 'Demo Reviewer', 'demo-immutability-reviewer-token', ?)").bind(now),
		env.DB.prepare("INSERT INTO review_assignments (id, plan_id, reviewer_id, submission_id, created_at) VALUES ('demo-immutability-assignment', 'demo-immutability-plan', 'demo-immutability-reviewer', ?, ?)").bind(submissionId, now),
	]);
	const tokenHash = await hmacHash("demo-immutability-secret", draftToken);
	await env.DB.batch([
		env.DB.prepare("INSERT INTO submission_drafts (id, event_id, form_id, verified_email, submitter_name, answers_json, status, created_at, updated_at) VALUES (?, ?, ?, 'draft@demo.invalid', 'Draft Demo', '{}', 'draft', ?, ?)").bind(draftId, eventId, formId, now, now),
		env.DB.prepare("INSERT INTO submission_draft_tokens (token_hash, draft_id, state, expires_at, created_at) VALUES (?, ?, 'current', ?, ?)").bind(tokenHash, draftId, now + 86_400_000, now),
	]);
}

describe("demo event immutability", () => {
	it("denies CFP and every durable-draft mutation without changing D1", async () => {
		await seedDemoFixture();
		const before = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM submissions WHERE event_id = ?) AS submissions, (SELECT COUNT(*) FROM submission_drafts WHERE event_id = ?) AS drafts, (SELECT COUNT(*) FROM submission_draft_tokens WHERE draft_id = ?) AS tokens").bind(eventId, eventId, draftId).first<{ submissions: number; drafts: number; tokens: number }>();
		await expect(insertSubmission(env.DB, { eventId, formId, submitterEmail: "new@demo.invalid", submitterName: "New Demo", answers: {}, speakers: [{ name: "New Demo", email: "new@demo.invalid" }] })).rejects.toMatchObject({ code: "DEMO_EVENT_READ_ONLY" });
		await expect(createVerifiedDraft(env.DB, { eventId, formId, verifiedEmail: "new-draft@demo.invalid" })).rejects.toMatchObject({ code: "DEMO_EVENT_READ_ONLY" });
		await expect(prepareDraftResumeDelivery(env.DB, { secret: "demo-immutability-secret", eventId, formId, verifiedEmail: "prepared@demo.invalid" })).rejects.toMatchObject({ code: "DEMO_EVENT_READ_ONLY" });
		await expect(issueDraftResumeToken(env.DB, { secret: "demo-immutability-secret", draftId, deliveryVerified: true, token: "rotated-token", now })).rejects.toMatchObject({ code: "DEMO_EVENT_READ_ONLY" });
		await expect(saveDraftForResume(env.DB, { secret: "demo-immutability-secret", token: draftToken, submitterName: "Changed", answers: { title: "Changed" }, now })).rejects.toMatchObject({ code: "DEMO_EVENT_READ_ONLY" });
		await expect(finalizeDraft(env.DB, { secret: "demo-immutability-secret", draftId, token: draftToken, submitterName: "Changed", answers: { title: "Changed" }, speakers: [{ name: "Changed", email: "draft@demo.invalid" }], now })).rejects.toMatchObject({ code: "DEMO_EVENT_READ_ONLY" });
		expect(await env.DB.prepare("SELECT (SELECT COUNT(*) FROM submissions WHERE event_id = ?) AS submissions, (SELECT COUNT(*) FROM submission_drafts WHERE event_id = ?) AS drafts, (SELECT COUNT(*) FROM submission_draft_tokens WHERE draft_id = ?) AS tokens").bind(eventId, eventId, draftId).first()).toEqual(before);
	});

	it("denies review and portal text/file mutations before D1 or R2 changes", async () => {
		const score = await upsertEvaluationScore(env.DB, { token: "demo-immutability-reviewer-token", submissionId, score: 5, comment: "Must not persist" });
		expect(score).toMatchObject({ ok: false, status: 403 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM evaluation_scores WHERE submission_id = ?").bind(submissionId).first()).toEqual({ count: 0 });
		const text = await completeTextTask(env.DB, { taskId, personId, text: "A speaker biography that is valid but must stay unchanged." });
		expect(text).toMatchObject({ ok: false, status: 403 });
		const r2Prefix = `events/${eventId}/`;
		const beforeObjects = await env.FILES.list({ prefix: r2Prefix });
		const file = await completeFileTask(env.DB, env.FILES, { taskId, personId, file: new File(["demo"], "headshot.png", { type: "image/png" }) });
		expect(file).toMatchObject({ ok: false, status: 403 });
		expect(await env.FILES.list({ prefix: r2Prefix })).toEqual(beforeObjects);
		expect(await env.DB.prepare("SELECT status, text_value, asset_id FROM speaker_tasks WHERE id = ?").bind(taskId).first()).toEqual({ status: "pending", text_value: null, asset_id: null });
	});

	it("excludes demo tasks from reminder selection and does not create a delivery", async () => {
		const result = await sendTaskReminders({
			DB: env.DB,
			SESSIONS: env.SESSIONS,
			AUTH_SECRET: "demo-immutability-secret",
			APP_ORIGIN: "https://conference.example.test",
			RESEND_API_KEY: "unused",
			RESEND_FROM_EMAIL: "team@example.test",
		}, { eventId, now });
		expect(result).toEqual({ sent: 0, skipped: 0 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM email_deliveries WHERE event_id = ?").bind(eventId).first()).toEqual({ count: 0 });
	});
});
