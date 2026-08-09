import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { setBulkSubmissionReviewers, setSubmissionReviewers } from "@/lib/evaluation/assignments";
import { bulkDecideSubmissions } from "@/lib/evaluation/decisions";
import { activateEvaluationPlan, createCriterion, createEvaluationPlan, deleteCriterion, listCriteria, updateCriterion } from "@/lib/evaluation/plan";
import { createReviewer, regenerateReviewerToken, revokeReviewer } from "@/lib/evaluation/reviewers";
import { listCriterionScoresForPlan, resolveReviewIdentity, upsertEvaluationScore } from "@/lib/evaluation/score";

const now = 1_780_500_000_000;

async function seedEvent(eventId: string, mode: "live" | "demo" = "live") {
	await env.DB.prepare("INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES (?, ?, ?, 'UTC', ?, ?, ?)")
		.bind(eventId, eventId, `${eventId} event`, mode, now, now).run();
	await env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES (?, ?, 'cfp', 'CFP', 'open', ?, ?)")
		.bind(`${eventId}-form`, eventId, now, now).run();
}

async function seedSubmission(eventId: string, submissionId: string, status = "submitted", confirmedSpeaker = false) {
	await env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_name, submitter_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'Reviewer Test', 'reviewer@test.invalid', ?, ?)")
		.bind(submissionId, `${eventId}-form`, eventId, status, JSON.stringify({ title: submissionId }), now, now).run();
	if (confirmedSpeaker) await env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, name, email, position, status) VALUES (?, ?, 'Reviewer Test', ?, 0, 'confirmed')")
		.bind(`${submissionId}-speaker`, submissionId, `${submissionId}@test.invalid`).run();
}

describe("evaluation workflows", () => {
	it("supports criteria CRUD with bounded weighted scales", async () => {
		await seedEvent("eval-criteria-event");
		const plan = await createEvaluationPlan(env.DB, { eventId: "eval-criteria-event", name: "Program committee" });
		expect(plan.status).toBe("draft");
		expect(plan.criteria).toHaveLength(3);
		const created = await createCriterion(env.DB, { planId: plan.id, label: "Originality", description: "Distinct point of view", weight: 2.5, scaleMin: 0, scaleMax: 10 });
		const updated = await updateCriterion(env.DB, { planId: plan.id, criterionId: created.id, label: "Originality and evidence", weight: 3 });
		expect(updated).toMatchObject({ label: "Originality and evidence", weight: 3, scale_min: 0, scale_max: 10 });
		await deleteCriterion(env.DB, { planId: plan.id, criterionId: created.id });
		expect(await listCriteria(env.DB, plan.id)).toHaveLength(3);
		const activation = await activateEvaluationPlan(env.DB, { eventId: "eval-criteria-event", planId: plan.id });
		if (!activation.ok) throw new Error(activation.error);
		await expect(createCriterion(env.DB, { planId: plan.id, label: "Late criterion", weight: 1 })).rejects.toMatchObject({ status: 409 });
		await expect(updateCriterion(env.DB, { planId: plan.id, criterionId: plan.criteria[0]!.id, label: "Changed after activation" })).rejects.toMatchObject({ status: 409 });
		await expect(deleteCriterion(env.DB, { planId: plan.id, criterionId: plan.criteria[0]!.id })).rejects.toMatchObject({ status: 409 });
	});

	it("invalidates old reviewer tokens on regeneration and revocation", async () => {
		await seedEvent("eval-token-event");
		const draft = await createEvaluationPlan(env.DB, { eventId: "eval-token-event", name: "Token plan" });
		const active = await activateEvaluationPlan(env.DB, { eventId: "eval-token-event", planId: draft.id });
		if (!active.ok) throw new Error(active.error);
		const reviewer = await createReviewer(env.DB, { planId: draft.id, name: "Ari Reviewer" });
		expect(reviewer.reviewer.token).not.toBe(reviewer.token);
		expect(reviewer.reviewer.token).toMatch(/^digest:/);
		expect((await env.DB.prepare("SELECT token_digest FROM reviewers WHERE id = ?").bind(reviewer.reviewer.id).first())?.token_digest).toBeTruthy();
		expect((await resolveReviewIdentity(env.DB, reviewer.token))?.mode).toBe("reviewer");
		const regenerated = await regenerateReviewerToken(env.DB, { planId: draft.id, reviewerId: reviewer.reviewer.id });
		expect(await resolveReviewIdentity(env.DB, reviewer.token)).toBeNull();
		expect((await resolveReviewIdentity(env.DB, regenerated.token))?.mode).toBe("reviewer");
		await revokeReviewer(env.DB, { planId: draft.id, reviewerId: reviewer.reviewer.id });
		expect(await resolveReviewIdentity(env.DB, regenerated.token)).toBeNull();
	});

	it("allows exactly one active plan when two drafts race for activation", async () => {
		await seedEvent("eval-activation-conflict-event");
		const first = await createEvaluationPlan(env.DB, { eventId: "eval-activation-conflict-event", name: "First plan" });
		const second = await createEvaluationPlan(env.DB, { eventId: "eval-activation-conflict-event", name: "Second plan" });
		const activated = await activateEvaluationPlan(env.DB, { eventId: "eval-activation-conflict-event", planId: first.id });
		expect(activated.ok).toBe(true);
		await expect(activateEvaluationPlan(env.DB, { eventId: "eval-activation-conflict-event", planId: second.id })).resolves.toMatchObject({ ok: false, status: 409 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM evaluation_plans WHERE event_id = ? AND status = 'active'").bind("eval-activation-conflict-event").first()).toEqual({ count: 1 });
	});

	it("denies cross-event assignments, retains zero-assignment fail-closed scoring, and persists per-criterion scores", async () => {
		await seedEvent("eval-live-event");
		await seedEvent("eval-other-event");
		await seedSubmission("eval-live-event", "eval-live-submission");
		await seedSubmission("eval-other-event", "eval-other-submission");
		const draft = await createEvaluationPlan(env.DB, { eventId: "eval-live-event", name: "Scoring plan" });
		const active = await activateEvaluationPlan(env.DB, { eventId: "eval-live-event", planId: draft.id });
		if (!active.ok) throw new Error(active.error);
		const reviewer = await createReviewer(env.DB, { planId: draft.id, name: "Assigned reviewer" });
		const criteria = await listCriteria(env.DB, draft.id);
		const scoreInput = criteria.map((criterion, index) => ({ criterionId: criterion.id, score: index + 3, comment: `criterion ${index}` }));
		const zeroAssignment = await upsertEvaluationScore(env.DB, { token: reviewer.token, submissionId: "eval-live-submission", criterionScores: scoreInput });
		expect(zeroAssignment).toMatchObject({ ok: false, status: 403 });
		await expect(setBulkSubmissionReviewers(env.DB, { planId: draft.id, submissionIds: ["eval-other-submission"], reviewerIds: [reviewer.reviewer.id] })).rejects.toMatchObject({ status: 404 });
		await setSubmissionReviewers(env.DB, { planId: draft.id, submissionId: "eval-live-submission", reviewerIds: [reviewer.reviewer.id] });
		const scored = await upsertEvaluationScore(env.DB, { token: reviewer.token, submissionId: "eval-live-submission", criterionScores: scoreInput });
		expect(scored).toMatchObject({ ok: true, score: { score: 4 } });
		expect(await listCriterionScoresForPlan(env.DB, draft.id)).toHaveLength(criteria.length);
		// A legacy soft-deleted criterion must stop contributing to review
		// progress even if it still has historical normalized score rows.
		await env.DB.prepare("UPDATE evaluation_criteria SET soft_deleted = 1 WHERE id = ?").bind(criteria[0]!.id).run();
		expect(await listCriterionScoresForPlan(env.DB, draft.id)).toHaveLength(criteria.length - 1);
		const foreign = await upsertEvaluationScore(env.DB, { token: reviewer.token, submissionId: "eval-other-submission", criterionScores: scoreInput });
		expect(foreign).toMatchObject({ ok: false, status: 404 });
	});

	it("keeps every selected submission unchanged when a bulk assignment write fails", async () => {
		await seedEvent("eval-assignment-atomic-event");
		await seedSubmission("eval-assignment-atomic-event", "eval-assignment-a");
		await seedSubmission("eval-assignment-atomic-event", "eval-assignment-b");
		const draft = await createEvaluationPlan(env.DB, { eventId: "eval-assignment-atomic-event", name: "Atomic assignments" });
		const active = await activateEvaluationPlan(env.DB, { eventId: "eval-assignment-atomic-event", planId: draft.id });
		if (!active.ok) throw new Error(active.error);
		const original = await createReviewer(env.DB, { planId: draft.id, name: "Original reviewer" });
		const replacement = await createReviewer(env.DB, { planId: draft.id, name: "Replacement reviewer" });
		await setSubmissionReviewers(env.DB, { planId: draft.id, submissionId: "eval-assignment-a", reviewerIds: [original.reviewer.id] });
		await env.DB.prepare(`CREATE TRIGGER eval_assignment_fail BEFORE INSERT ON review_assignments
      WHEN NEW.submission_id = 'eval-assignment-b' BEGIN SELECT RAISE(ABORT, 'injected assignment failure'); END`).run();
		try {
			await expect(setBulkSubmissionReviewers(env.DB, {
				planId: draft.id,
				submissionIds: ["eval-assignment-a", "eval-assignment-b"],
				reviewerIds: [replacement.reviewer.id],
			})).rejects.toThrow("injected assignment failure");
		} finally {
			await env.DB.prepare("DROP TRIGGER eval_assignment_fail").run();
		}
		expect((await env.DB.prepare("SELECT submission_id, reviewer_id FROM review_assignments WHERE plan_id = ? ORDER BY submission_id").bind(draft.id).all()).results)
			.toEqual([{ submission_id: "eval-assignment-a", reviewer_id: original.reviewer.id }]);
	});

	it("reports bulk accept and reject outcomes without silently hiding partial failures", async () => {
		await seedEvent("eval-decisions-event");
		await env.DB.prepare("INSERT INTO task_templates (id, event_id, key, label, task_kind, required, position) VALUES ('eval-decision-template', 'eval-decisions-event', 'bio', 'Bio', 'text', 1, 0)").run();
		await seedSubmission("eval-decisions-event", "eval-accept-submission", "submitted", true);
		await seedSubmission("eval-decisions-event", "eval-reject-submission", "submitted", true);
		const accepted = await bulkDecideSubmissions(env.DB, { eventId: "eval-decisions-event", submissionIds: ["eval-accept-submission"], action: "accept", decide: async (submissionId) => ({ ok: true, submissionId, status: "accepted", email: null }) });
		expect(accepted.outcomes).toEqual([{ submissionId: "eval-accept-submission", ok: true, status: "accepted" }]);
		const partial = await bulkDecideSubmissions(env.DB, { eventId: "eval-decisions-event", submissionIds: ["eval-accept-submission", "eval-reject-submission"], action: "reject", decide: async (submissionId) => submissionId === "eval-reject-submission" ? { ok: false, error: "injected failure", status: 409 } : { ok: true, submissionId, status: "rejected", email: null } });
		expect(partial).toMatchObject({ succeeded: 1, failed: 1, outcomes: [{ submissionId: "eval-accept-submission", ok: true }, { submissionId: "eval-reject-submission", ok: false, error: "injected failure" }] });
		const thrown = await bulkDecideSubmissions(env.DB, { eventId: "eval-decisions-event", submissionIds: ["eval-accept-submission", "eval-reject-submission"], action: "reject", decide: async (submissionId) => {
			if (submissionId === "eval-reject-submission") throw new Error("injected exception");
			return { ok: true, submissionId, status: "rejected", email: null };
		} });
		expect(thrown).toMatchObject({ succeeded: 1, failed: 1, outcomes: [{ submissionId: "eval-accept-submission", ok: true }, { submissionId: "eval-reject-submission", ok: false, status: 500, error: "injected exception" }] });
	});

	it("keeps demo review scoring immutable", async () => {
		await seedEvent("eval-demo-event", "demo");
		await seedSubmission("eval-demo-event", "eval-demo-submission");
		const draft = await createEvaluationPlan(env.DB, { eventId: "eval-demo-event", name: "Demo plan" });
		await activateEvaluationPlan(env.DB, { eventId: "eval-demo-event", planId: draft.id });
		const reviewer = await createReviewer(env.DB, { planId: draft.id, name: "Demo reviewer" });
		await setSubmissionReviewers(env.DB, { planId: draft.id, submissionId: "eval-demo-submission", reviewerIds: [reviewer.reviewer.id] });
		const criteria = await listCriteria(env.DB, draft.id);
		const result = await upsertEvaluationScore(env.DB, { token: reviewer.token, submissionId: "eval-demo-submission", criterionScores: criteria.map((criterion) => ({ criterionId: criterion.id, score: 5 })) });
		expect(result).toMatchObject({ ok: false, status: 403 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM evaluation_scores WHERE plan_id = ?").bind(draft.id).first()).toEqual({ count: 0 });
	});
});
