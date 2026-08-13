import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	listAssignmentsForPlan,
	listEvaluationScoresForPlan,
	listReviewableSubmissions,
} from "@/lib/db/queries";
import { setBulkSubmissionReviewers } from "@/lib/evaluation/assignments";
import { activateEvaluationPlan, createEvaluationPlan, listCriteria } from "@/lib/evaluation/plan";
import { createReviewer } from "@/lib/evaluation/reviewers";
import { upsertEvaluationScore } from "@/lib/evaluation/score";
import { sendOutstandingReviewerReminders } from "@/lib/email/reviewer-reminders";

const now = 1_780_900_000_000;

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("reviewer reminders", () => {
	it("counts accepted and rejected assignments as outstanding review work until the reviewer scores them", async () => {
		const eventId = "reviewer-reminder-status-event";
		const formId = "reviewer-reminder-status-form";
		const submissionIds = {
			accepted: "reviewer-reminder-accepted",
			rejected: "reviewer-reminder-rejected",
			draft: "reviewer-reminder-private-draft",
			withdrawn: "reviewer-reminder-withdrawn",
		};
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES (?, ?, 'Reviewer reminders', 'UTC', 'live', ?, ?)",
			).bind(eventId, eventId, now, now),
			env.DB.prepare(
				"INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES (?, ?, 'cfp', 'CFP', 'open', ?, ?)",
			).bind(formId, eventId, now, now),
			...Object.entries(submissionIds).map(([status, id]) => env.DB.prepare(
				"INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			).bind(id, formId, eventId, status, JSON.stringify({ title: `${status} proposal` }), now, now)),
		]);
		const plan = await createEvaluationPlan(env.DB, { eventId, name: "Reviewer reminder plan" });
		const activation = await activateEvaluationPlan(env.DB, { eventId, planId: plan.id });
		if (!activation.ok) throw new Error(activation.error);
		const reviewer = await createReviewer(env.DB, {
			planId: plan.id,
			name: "Reminder reviewer",
			email: "reviewer-reminder@example.test",
		});
		await setBulkSubmissionReviewers(env.DB, {
			planId: plan.id,
			submissionIds: Object.values(submissionIds),
			reviewerIds: [reviewer.reviewer.id],
		});

		const reviewableSubmissions = await listReviewableSubmissions(env.DB, eventId);
		const reviewableIds = new Set(reviewableSubmissions.map((submission) => submission.id));
		const assignments = await listAssignmentsForPlan(env.DB, plan.id);
		const assignedReviewableIds = assignments
			.filter((assignment) => assignment.recused_at === null && reviewableIds.has(assignment.submission_id))
			.map((assignment) => assignment.submission_id)
			.sort();
		expect(assignedReviewableIds).toEqual([submissionIds.accepted, submissionIds.rejected].sort());

		const fetchMock = vi.fn<typeof fetch>(() =>
			Promise.resolve(new Response(JSON.stringify({ id: "reviewer-reminder-provider" }), { status: 200 })),
		);
		vi.stubGlobal("fetch", fetchMock);
		expect(
			await sendOutstandingReviewerReminders(
				{
					DB: env.DB,
					AUTH_SECRET: "reviewer-reminder-secret",
					APP_ORIGIN: "https://conference.example.test",
					RESEND_API_KEY: "test",
					RESEND_FROM_EMAIL: "team@example.test",
				},
				{ eventId, planId: plan.id, now },
			),
		).toEqual({ sent: 1, skipped: 0 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const envelope = await env.DB.prepare(
			"SELECT text_body FROM email_delivery_envelopes WHERE event_id = ? AND template_key = 'reviewer_outstanding_reminder'",
		).bind(eventId).first<{ text_body: string }>();
		expect(envelope?.text_body).toContain("accepted proposal");
		expect(envelope?.text_body).toContain("rejected proposal");
		expect(envelope?.text_body).not.toContain("draft proposal");
		expect(envelope?.text_body).not.toContain("withdrawn proposal");

		const criteria = await listCriteria(env.DB, plan.id);
		const criterionScores = criteria.map((criterion) => ({ criterionId: criterion.id, score: 4 }));
		for (const submissionId of [submissionIds.accepted, submissionIds.rejected]) {
			expect(
				await upsertEvaluationScore(env.DB, {
					token: reviewer.token,
					submissionId,
					criterionScores,
				}),
			).toMatchObject({ ok: true });
		}

		const completedReviewCount = (await listEvaluationScoresForPlan(env.DB, plan.id))
			.filter((score) => score.reviewer_id === reviewer.reviewer.id && reviewableIds.has(score.submission_id))
			.length;
		expect({ assigned: assignedReviewableIds.length, submitted: completedReviewCount }).toEqual({ assigned: 2, submitted: 2 });
		expect(
			await sendOutstandingReviewerReminders(
				{
					DB: env.DB,
					AUTH_SECRET: "reviewer-reminder-secret",
					APP_ORIGIN: "https://conference.example.test",
					RESEND_API_KEY: "test",
					RESEND_FROM_EMAIL: "team@example.test",
				},
				{ eventId, planId: plan.id, now: now + 1 },
			),
		).toEqual({ sent: 0, skipped: 0 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
