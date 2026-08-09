import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { loadCockpitSnapshot } from "@/lib/cockpit/snapshot";
import { COCKPIT_BLOCKER_LIST_LIMIT } from "@/lib/domain/cockpit";
import { getEventById } from "@/lib/db/queries";
import { setSubmissionReviewers } from "@/lib/evaluation/assignments";
import { activateEvaluationPlan, createEvaluationPlan, listCriteria } from "@/lib/evaluation/plan";
import { createReviewer } from "@/lib/evaluation/reviewers";
import { upsertEvaluationScore } from "@/lib/evaluation/score";

const now = 1_780_700_000_000;

async function seedBase(eventId: string) {
	await env.DB.batch([
		env.DB.prepare(
			"INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES (?, ?, ?, 'UTC', 'live', ?, ?)",
		).bind(eventId, eventId, `${eventId} cockpit`, now, now),
		env.DB.prepare(
			"INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES (?, ?, 'cfp', 'CFP', 'open', ?, ?)",
		).bind(`${eventId}-form`, eventId, now, now),
		env.DB.prepare(
			"INSERT INTO people (id, email, name, created_at) VALUES (?, ?, 'Speaker', ?)",
		).bind(`${eventId}-person`, `${eventId}@test.invalid`, now),
	]);
}

async function insertSubmittedSubmission(
	eventId: string,
	submissionId: string,
	title: string,
	submitter = "Submitter",
) {
	await env.DB.prepare(
		`INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_name, submitter_email, created_at, updated_at)
     VALUES (?, ?, ?, 'submitted', ?, ?, ?, ?, ?)`,
	)
		.bind(
			submissionId,
			`${eventId}-form`,
			eventId,
			JSON.stringify({ title }),
			submitter,
			`${submissionId}@test.invalid`,
			now,
			now,
		)
		.run();
}

describe("loadCockpitSnapshot", () => {
	it("aggregates review, schedule, task, and email blockers without N+1 fan-out", async () => {
		const eventId = "cockpit-blockers";
		await seedBase(eventId);

		await env.DB.batch([
			env.DB.prepare(
				`INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_name, submitter_email, created_at, updated_at)
         VALUES (?, ?, ?, 'submitted', ?, 'Unassigned', 'unassigned@test.invalid', ?, ?)`,
			).bind(`${eventId}-unassigned`, `${eventId}-form`, eventId, JSON.stringify({ title: "Needs assign" }), now, now),
			env.DB.prepare(
				`INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_name, submitter_email, created_at, updated_at)
         VALUES (?, ?, ?, 'submitted', ?, 'Assigned', 'assigned@test.invalid', ?, ?)`,
			).bind(`${eventId}-assigned`, `${eventId}-form`, eventId, JSON.stringify({ title: "Needs score" }), now, now),
			env.DB.prepare(
				`INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_name, submitter_email, created_at, updated_at)
         VALUES (?, ?, ?, 'submitted', ?, 'Scored', 'scored@test.invalid', ?, ?)`,
			).bind(`${eventId}-scored`, `${eventId}-form`, eventId, JSON.stringify({ title: "Needs decide" }), now, now),
			env.DB.prepare(
				`INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_name, submitter_email, created_at, updated_at)
         VALUES (?, ?, ?, 'accepted', ?, 'Accepted', 'accepted@test.invalid', ?, ?)`,
			).bind(`${eventId}-accepted`, `${eventId}-form`, eventId, JSON.stringify({ title: "Needs slot" }), now, now),
			env.DB.prepare(
				`INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_name, submitter_email, created_at, updated_at)
         VALUES (?, ?, ?, 'scheduled', ?, 'Scheduled', 'scheduled@test.invalid', ?, ?)`,
			).bind(`${eventId}-scheduled`, `${eventId}-form`, eventId, JSON.stringify({ title: "Needs publish" }), now, now),
			env.DB.prepare(
				`INSERT INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at)
         VALUES (?, ?, ?, 'Main', ?, ?, ?, ?, ?)`,
			).bind(
				`${eventId}-slot`,
				eventId,
				`${eventId}-scheduled`,
				now + 3_600_000,
				now + 7_200_000,
				`${eventId}-ics`,
				now,
				now,
			),
			env.DB.prepare(
				`INSERT INTO speaker_tasks (id, event_id, submission_id, person_id, template_key, template_label, template_task_kind, template_required, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'bio', 'Bio', 'text', 1, 'pending', ?, ?)`,
			).bind(
				`${eventId}-task`,
				eventId,
				`${eventId}-accepted`,
				`${eventId}-person`,
				now,
				now,
			),
			env.DB.prepare(
				`INSERT INTO submission_speakers (id, submission_id, name, email, position, status, invited_at)
         VALUES (?, ?, 'Co', 'co@test.invalid', 1, 'pending', NULL)`,
			).bind(`${eventId}-cospeaker`, `${eventId}-accepted`),
			env.DB.prepare(
				`INSERT INTO email_deliveries (delivery_key, event_id, submission_id, template_key, to_email, subject, status, error, attempt_count, created_at, updated_at)
         VALUES (?, ?, ?, 'task_reminder', 'accepted@test.invalid', 'Reminder', 'failed', 'provider down', 1, ?, ?)`,
			).bind(`${eventId}-delivery`, eventId, `${eventId}-accepted`, now, now),
			env.DB.prepare(
				`INSERT INTO email_delivery_envelopes (delivery_key, event_id, submission_id, template_key, to_email, subject, text_body, created_at)
         VALUES (?, ?, ?, 'task_reminder', 'accepted@test.invalid', 'Reminder', 'hi', ?)`,
			).bind(`${eventId}-delivery`, eventId, `${eventId}-accepted`, now),
		]);

		const draft = await createEvaluationPlan(env.DB, { eventId, name: "Cockpit plan" });
		const active = await activateEvaluationPlan(env.DB, { eventId, planId: draft.id });
		if (!active.ok) throw new Error(active.error);
		const reviewer = await createReviewer(env.DB, { planId: draft.id, name: "Cockpit reviewer" });
		await setSubmissionReviewers(env.DB, {
			planId: draft.id,
			submissionId: `${eventId}-assigned`,
			reviewerIds: [reviewer.reviewer.id],
		});
		await setSubmissionReviewers(env.DB, {
			planId: draft.id,
			submissionId: `${eventId}-scored`,
			reviewerIds: [reviewer.reviewer.id],
		});
		const criteria = await listCriteria(env.DB, draft.id);
		const scoreInput = criteria.map((criterion, index) => ({
			criterionId: criterion.id,
			score: index + 3,
		}));
		const scored = await upsertEvaluationScore(env.DB, {
			token: reviewer.token,
			submissionId: `${eventId}-scored`,
			criterionScores: scoreInput,
		});
		expect(scored.ok).toBe(true);

		const event = await getEventById(env.DB, eventId);
		expect(event).not.toBeNull();
		const snapshot = await loadCockpitSnapshot(env.DB, event!);

		expect(snapshot.activePlanId).toBe(draft.id);
		expect(snapshot.outstandingTasks.incompleteCount).toBe(1);
		expect(snapshot.pendingCoSpeakers.map((row) => row.email)).toEqual(["co@test.invalid"]);
		expect(snapshot.unassignedReviews.map((row) => row.submissionId)).toEqual([
			`${eventId}-unassigned`,
		]);
		expect(snapshot.incompleteReviews.map((row) => row.submissionId)).toEqual([
			`${eventId}-assigned`,
		]);
		expect(snapshot.reviewedUndecided.map((row) => row.submissionId)).toEqual([
			`${eventId}-scored`,
		]);
		expect(snapshot.acceptedUnscheduled.map((row) => row.submissionId)).toEqual([
			`${eventId}-accepted`,
		]);
		expect(snapshot.scheduledUnpublished.map((row) => row.submissionId)).toEqual([
			`${eventId}-scheduled`,
		]);
		expect(snapshot.failedDeliveries).toMatchObject([
			{
				deliveryKey: `${eventId}-delivery`,
				replayable: true,
				templateKey: "task_reminder",
			},
		]);
		expect(snapshot.reviewers.map((row) => row.name)).toContain("Cockpit reviewer");
	});

	it("surfaces submitted work when no evaluation plan is active", async () => {
		const eventId = "cockpit-no-plan";
		await seedBase(eventId);
		await insertSubmittedSubmission(eventId, `${eventId}-waiting`, "Waiting on plan");

		const event = await getEventById(env.DB, eventId);
		expect(event).not.toBeNull();
		const snapshot = await loadCockpitSnapshot(env.DB, event!);

		expect(snapshot.activePlanId).toBeNull();
		expect(snapshot.needsReviewActivation.map((row) => row.submissionId)).toEqual([
			`${eventId}-waiting`,
		]);
		expect(snapshot.needsReviewActivationTotal).toBe(1);
		expect(snapshot.unassignedReviews).toEqual([]);
		expect(snapshot.incompleteReviews).toEqual([]);
		expect(snapshot.reviewedUndecided).toEqual([]);
	});

	it("keeps partially scored proposals in incomplete reviews, not undecided", async () => {
		const eventId = "cockpit-partial-score";
		await seedBase(eventId);
		await insertSubmittedSubmission(eventId, `${eventId}-partial`, "Two reviewers");

		const draft = await createEvaluationPlan(env.DB, { eventId, name: "Partial plan" });
		const active = await activateEvaluationPlan(env.DB, { eventId, planId: draft.id });
		if (!active.ok) throw new Error(active.error);

		const reviewerA = await createReviewer(env.DB, { planId: draft.id, name: "Reviewer A" });
		const reviewerB = await createReviewer(env.DB, { planId: draft.id, name: "Reviewer B" });
		await setSubmissionReviewers(env.DB, {
			planId: draft.id,
			submissionId: `${eventId}-partial`,
			reviewerIds: [reviewerA.reviewer.id, reviewerB.reviewer.id],
		});

		const criteria = await listCriteria(env.DB, draft.id);
		const scoreInput = criteria.map((criterion, index) => ({
			criterionId: criterion.id,
			score: index + 3,
		}));
		const scored = await upsertEvaluationScore(env.DB, {
			token: reviewerA.token,
			submissionId: `${eventId}-partial`,
			criterionScores: scoreInput,
		});
		expect(scored.ok).toBe(true);

		const event = await getEventById(env.DB, eventId);
		expect(event).not.toBeNull();
		const snapshot = await loadCockpitSnapshot(env.DB, event!);

		expect(snapshot.reviewedUndecided.map((row) => row.submissionId)).toEqual([]);
		expect(snapshot.reviewedUndecidedTotal).toBe(0);
		expect(snapshot.incompleteReviews.map((row) => row.reviewerName)).toEqual(["Reviewer B"]);
		expect(snapshot.incompleteReviewsTotal).toBe(1);
	});

	it("caps blocker lists while reporting full totals", async () => {
		const eventId = "cockpit-cap";
		await seedBase(eventId);

		const overLimit = COCKPIT_BLOCKER_LIST_LIMIT + 5;
		const statements = [];
		for (let index = 0; index < overLimit; index += 1) {
			statements.push(
				env.DB.prepare(
					`INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_name, submitter_email, created_at, updated_at)
           VALUES (?, ?, ?, 'accepted', ?, 'Speaker', ?, ?, ?)`,
				).bind(
					`${eventId}-accepted-${index}`,
					`${eventId}-form`,
					eventId,
					JSON.stringify({ title: `Talk ${index}` }),
					`speaker-${index}@test.invalid`,
					now - index,
					now - index,
				),
			);
		}
		await env.DB.batch(statements);

		const event = await getEventById(env.DB, eventId);
		expect(event).not.toBeNull();
		const snapshot = await loadCockpitSnapshot(env.DB, event!);

		expect(snapshot.acceptedUnscheduled).toHaveLength(COCKPIT_BLOCKER_LIST_LIMIT);
		expect(snapshot.acceptedUnscheduledTotal).toBe(overLimit);
	});
});
