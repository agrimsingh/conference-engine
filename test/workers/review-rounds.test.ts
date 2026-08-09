import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { setSubmissionReviewers } from "@/lib/evaluation/assignments";
import { activateEvaluationPlan, createCriterion, createEvaluationPlan } from "@/lib/evaluation/plan";
import { createReviewer } from "@/lib/evaluation/reviewers";
import { listCriterionScoresForPlan, upsertEvaluationScore } from "@/lib/evaluation/score";
import { recuseAssignment } from "@/lib/evaluation/recusal";

const now = Date.now();

describe("review rounds in D1", () => {
	it("scopes a typed scorecard to one event/round and persists an exact weighted aggregate", async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('round-event', 'round-event', 'Round event', 'UTC', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('foreign-round-event', 'foreign-round-event', 'Foreign event', 'UTC', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('round-form', 'round-event', 'cfp', 'CFP', 'open', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('foreign-round-form', 'foreign-round-event', 'cfp', 'CFP', 'open', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('round-submission', 'round-form', 'round-event', 'submitted', '{\"title\":\"Taming CI\"}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('round-submission-2', 'round-form', 'round-event', 'submitted', '{\"title\":\"Second\"}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('foreign-round-submission', 'foreign-round-form', 'foreign-round-event', 'submitted', '{\"title\":\"Foreign\"}', ?, ?)").bind(now, now),
		]);

		const plan = await createEvaluationPlan(env.DB, { eventId: "round-event", name: "Initial Review", openAt: now - 60_000, closeAt: now + 60_000, blindReview: true, assignmentCap: 1 });
		const finalPlan = await createEvaluationPlan(env.DB, { eventId: "round-event", name: "Final Review", openAt: now + 120_000, closeAt: now + 240_000, blindReview: false });
		const finalReviewer = await createReviewer(env.DB, { planId: finalPlan.id, name: "Final reviewer" });
		expect(finalReviewer.reviewer.plan_id).toBe(finalPlan.id);
		expect(await env.DB.prepare("SELECT name, open_at, close_at, blind_review, assignment_cap FROM evaluation_plans WHERE id = ?").bind(plan.id).first()).toEqual({ name: "Initial Review", open_at: now - 60_000, close_at: now + 60_000, blind_review: 1, assignment_cap: 1 });
		await env.DB.prepare("DELETE FROM evaluation_criteria WHERE plan_id = ?").bind(plan.id).run();
		const originality = await createCriterion(env.DB, { planId: plan.id, label: "Originality", weight: 2 });
		const relevance = await createCriterion(env.DB, { planId: plan.id, label: "Relevance", weight: 1 });
		const recommendation = await createCriterion(env.DB, { planId: plan.id, label: "Recommendation", weight: 1, criterionType: "dropdown", options: ["Accept", "Maybe", "Reject"] });
		const comments = await createCriterion(env.DB, { planId: plan.id, label: "Comments", weight: 1, criterionType: "text" });
		const issued = await createReviewer(env.DB, { planId: plan.id, name: "Sam Whitfield" });
		await expect(setSubmissionReviewers(env.DB, { planId: finalPlan.id, submissionId: "round-submission-2", reviewerIds: [issued.reviewer.id] })).rejects.toThrow(/not on this plan/i);
		const activated = await activateEvaluationPlan(env.DB, { eventId: "round-event", planId: plan.id });
		expect(activated.ok).toBe(true);
		await setSubmissionReviewers(env.DB, { planId: plan.id, submissionId: "round-submission", reviewerIds: [issued.reviewer.id] });

		const scored = await upsertEvaluationScore(env.DB, {
			token: issued.token,
			submissionId: "round-submission",
			criterionScores: [
				{ criterionId: originality.id, value: 4 }, { criterionId: relevance.id, value: 2 },
				{ criterionId: recommendation.id, value: "Accept" }, { criterionId: comments.id, value: "Specific feedback" },
			],
		});
		expect(scored.ok && scored.score.score).toBe(10 / 3);
		const stored = await listCriterionScoresForPlan(env.DB, plan.id);
		expect(stored.find((row) => row.criterion_id === recommendation.id)?.value_text).toBe("Accept");
		expect(stored.find((row) => row.criterion_id === comments.id)?.value_text).toBe("Specific feedback");
		await expect(setSubmissionReviewers(env.DB, { planId: plan.id, submissionId: "round-submission-2", reviewerIds: [issued.reviewer.id] })).rejects.toThrow(/cap of 1/i);

		const recused = await recuseAssignment(env.DB, { planId: plan.id, reviewerId: issued.reviewer.id, submissionId: "round-submission" });
		expect(recused.ok).toBe(true);
		expect(await upsertEvaluationScore(env.DB, { token: issued.token, submissionId: "round-submission", score: 4 })).toMatchObject({ ok: false, status: 403, error: expect.stringMatching(/recused/) });

		const foreign = await upsertEvaluationScore(env.DB, { token: issued.token, submissionId: "foreign-round-submission", criterionScores: [] });
		expect(foreign).toMatchObject({ ok: false, status: 404 });

		await env.DB.prepare("UPDATE evaluation_plans SET open_at = ?, close_at = ? WHERE id = ?").bind(Date.now() + 60_000, Date.now() + 120_000, plan.id).run();
		expect(await upsertEvaluationScore(env.DB, { token: issued.token, submissionId: "round-submission", score: 4 })).toMatchObject({ ok: false, status: 409, error: expect.stringMatching(/not opened/) });
		await env.DB.prepare("UPDATE evaluation_plans SET status = 'closed', open_at = NULL, close_at = NULL WHERE id = ?").bind(plan.id).run();
		expect(await upsertEvaluationScore(env.DB, { token: issued.token, submissionId: "round-submission", score: 4 })).toMatchObject({ ok: false, status: 409, error: expect.stringMatching(/closed/) });
	});
});
