import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { updateFormMeta } from "@/lib/cfp/form-admin";
import { insertSubmission } from "@/lib/cfp/submit";
import { setSubmissionReviewers } from "@/lib/evaluation/assignments";
import { activateEvaluationPlan, listCriteria } from "@/lib/evaluation/plan";
import { createReviewer } from "@/lib/evaluation/reviewers";
import { upsertEvaluationScore } from "@/lib/evaluation/score";
import { createEventWithDefaults } from "@/lib/events/create-event";
import { loadPublicSession } from "@/lib/sessions/session";
import { acceptSubmission } from "@/lib/speakers/accept";
import type { AccountRow } from "@/lib/db/types";

const now = 1_781_200_000_000;

function bulkPublish(room: DurableObjectStub, eventId: string, sessionIds: string[]) {
	return room.fetch("https://event-room/bulk-publication", {
		method: "POST",
		headers: { "content-type": "application/json", "x-ce-event-id": eventId },
		body: JSON.stringify({ action: "publish", sessionIds }),
	});
}

describe("release lifecycle", () => {
	it("walks submit → review → accept → schedule → publish on one live event", async () => {
		const owner: AccountRow = {
			id: "release-lifecycle-owner",
			email: "owner@release-lifecycle.test",
			name: "Release owner",
			created_at: now,
			updated_at: now,
		};
		await env.DB.prepare(
			"INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		).bind(owner.id, owner.email, owner.name, now, now).run();

		const created = await createEventWithDefaults(
			env.DB,
			{
				name: "Release lifecycle event",
				slug: "release-lifecycle",
				timezone: "UTC",
				startDay: "2030-06-01",
				endDay: "2030-06-02",
			},
			owner,
		);

		const form = await env.DB.prepare(
			"SELECT id FROM cfp_forms WHERE event_id = ? AND slug = 'cfp'",
		).bind(created.eventId).first<{ id: string }>();
		const plan = await env.DB.prepare(
			"SELECT id FROM evaluation_plans WHERE event_id = ? ORDER BY created_at ASC LIMIT 1",
		).bind(created.eventId).first<{ id: string }>();
		if (!form || !plan) throw new Error("seeded event missing form or plan");

		await updateFormMeta(env.DB, { formId: form.id, status: "open" });

		const submissionId = await insertSubmission(env.DB, {
			eventId: created.eventId,
			formId: form.id,
			submitterEmail: "speaker@release-lifecycle.test",
			submitterName: "Release Speaker",
			answers: {
				title: "From CFP to stage",
				abstract: "End-to-end release verification path.",
			},
			speakers: [{ name: "Release Speaker", email: "speaker@release-lifecycle.test" }],
		});
		expect(await env.DB.prepare("SELECT status FROM submissions WHERE id = ?").bind(submissionId).first()).toEqual({ status: "submitted" });

		const activated = await activateEvaluationPlan(env.DB, { eventId: created.eventId, planId: plan.id });
		if (!activated.ok) throw new Error(activated.error);
		const reviewer = await createReviewer(env.DB, { planId: plan.id, name: "Release reviewer" });
		await setSubmissionReviewers(env.DB, {
			planId: plan.id,
			submissionId,
			reviewerIds: [reviewer.reviewer.id],
		});
		const criteria = await listCriteria(env.DB, plan.id);
		const scored = await upsertEvaluationScore(env.DB, {
			token: reviewer.token,
			submissionId,
			criterionScores: criteria.map((criterion) => ({ criterionId: criterion.id, score: 5 })),
		});
		expect(scored).toMatchObject({ ok: true });
		expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM evaluation_scores WHERE submission_id = ?").bind(submissionId).first())?.count).toBe(criteria.length);

		const accepted = await acceptSubmission(env.DB, submissionId, { send: false });
		if (!accepted.ok) throw new Error(accepted.error);
		expect(accepted).toMatchObject({ ok: true, status: "accepted", spawnedTaskKeys: expect.any(Array) });
		expect(await env.DB.prepare("SELECT status FROM submissions WHERE id = ?").bind(submissionId).first()).toEqual({ status: "accepted" });
		expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_tasks WHERE submission_id = ?").bind(submissionId).first())?.count).toBeGreaterThan(0);

		const room = env.EVENT_ROOM.getByName(created.eventId);
		const startsAt = Date.parse("2030-06-01T14:00:00Z");
		const placed = await room.fetch("https://event-room/schedule", {
			method: "POST",
			headers: { "content-type": "application/json", "x-ce-event-id": created.eventId },
			body: JSON.stringify({
				submissionId,
				roomName: "Main Stage",
				startsAtMs: startsAt,
				endsAtMs: startsAt + 3_600_000,
			}),
		});
		expect(placed.status).toBe(200);
		expect(await env.DB.prepare("SELECT status FROM submissions WHERE id = ?").bind(submissionId).first()).toEqual({ status: "scheduled" });
		expect(await loadPublicSession(env.DB, created.slug, submissionId)).toBeNull();

		expect((await bulkPublish(room, created.eventId, [submissionId])).status).toBe(200);
		expect(await env.DB.prepare("SELECT status FROM submissions WHERE id = ?").bind(submissionId).first()).toEqual({ status: "published" });
		expect(await loadPublicSession(env.DB, created.slug, submissionId)).toMatchObject({
			submission: { id: submissionId, status: "published" },
			slot: { roomName: "Main Stage" },
			speakers: [{ name: "Release Speaker" }],
		});
	});
});
