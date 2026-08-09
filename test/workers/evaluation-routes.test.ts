import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	authorizeEventAdminApi: vi.fn(),
	authorizeWritableEventAdminApi: vi.fn(),
	decideSubmission: vi.fn(),
	broadcastEventInvalidate: vi.fn(),
}));

vi.mock("@/lib/db/cloudflare", () => ({ getDb: async () => env.DB }));
vi.mock("@/lib/auth/admin", () => ({
	authorizeEventAdminApi: mocks.authorizeEventAdminApi,
	authorizeWritableEventAdminApi: mocks.authorizeWritableEventAdminApi,
}));
vi.mock("@/lib/speakers/decide", () => ({ decideSubmission: mocks.decideSubmission }));
vi.mock("@/lib/realtime/event-room", () => ({ broadcastEventInvalidate: mocks.broadcastEventInvalidate }));

import { POST as createPlan } from "@/app/api/admin/events/[eventSlug]/evaluation/route";
import { POST as activatePlan } from "@/app/api/admin/events/[eventSlug]/evaluation/activate/route";
import { GET as listReviewers, POST as createReviewer } from "@/app/api/admin/events/[eventSlug]/reviewers/route";
import { POST as bulkDecide } from "@/app/api/admin/events/[eventSlug]/review/decisions/route";

const now = 1_780_600_000_000;
const event = { id: "evaluation-route-event", slug: "evaluation-route", name: "Evaluation route", timezone: "UTC", mode: "live" as const, created_at: now, updated_at: now };
const context = { params: Promise.resolve({ eventSlug: event.slug }) };

function request(url: string, body: Record<string, unknown>): Request {
	return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("evaluation admin routes", () => {
	it("returns review links only when issuing them and never exposes stored bearer values", async () => {
		await env.DB.prepare("INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
			.bind(event.id, event.slug, event.name, event.timezone, event.mode, now, now).run();
		const access = { event, account: null, membership: null };
		mocks.authorizeEventAdminApi.mockResolvedValue(access);
		mocks.authorizeWritableEventAdminApi.mockResolvedValue({ ok: true, access });

		const createdResponse = await createPlan(request("https://conference.example.test/api/admin/events/evaluation-route/evaluation", { name: "Route rubric" }), context);
		expect(createdResponse.status).toBe(201);
		const created = await createdResponse.json() as { plan: { id: string; reviewerToken?: string } };
		expect(created.plan.reviewerToken).toBeUndefined();
		expect(await env.DB.prepare("SELECT reviewer_token FROM evaluation_plans WHERE id = ?").bind(created.plan.id).first())
			.toMatchObject({ reviewer_token: `digest:${created.plan.id}` });

		const activatedResponse = await activatePlan(request("https://conference.example.test/api/admin/events/evaluation-route/evaluation/activate", { planId: created.plan.id }), context);
		expect(activatedResponse.status).toBe(200);
		const activated = await activatedResponse.json() as { plan: { reviewPath?: string; reviewerToken?: string } };
		expect(activated.plan.reviewPath).toMatch(/^\/review\?token=/);
		expect(activated.plan.reviewerToken).toBeUndefined();

		const reviewerResponse = await createReviewer(request("https://conference.example.test/api/admin/events/evaluation-route/reviewers", { name: "Route reviewer" }), context);
		expect(reviewerResponse.status).toBe(200);
		const reviewer = await reviewerResponse.json() as { reviewer: { id: string; reviewPath?: string; token?: string } };
		expect(reviewer.reviewer.reviewPath).toMatch(/^\/review\?token=/);
		expect(reviewer.reviewer.token).toBeUndefined();

		const listedResponse = await listReviewers(new Request("https://conference.example.test/api/admin/events/evaluation-route/reviewers"), context);
		const listed = await listedResponse.json() as { reviewers: Array<Record<string, unknown>> };
		expect(listed.reviewers.find((item) => item.id === reviewer.reviewer.id)).toEqual(expect.objectContaining({ id: reviewer.reviewer.id, name: "Route reviewer" }));
		expect(JSON.stringify(listed)).not.toContain("reviewPath");
		expect(JSON.stringify(listed)).not.toContain("token");

		await env.DB.batch([
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('evaluation-route-form', ?, 'cfp', 'CFP', 'open', ?, ?)").bind(event.id, now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('evaluation-route-first', 'evaluation-route-form', ?, 'submitted', '{}', ?, ?)").bind(event.id, now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('evaluation-route-second', 'evaluation-route-form', ?, 'submitted', '{}', ?, ?)").bind(event.id, now, now),
		]);
		mocks.decideSubmission.mockReset();
		mocks.broadcastEventInvalidate.mockReset();
		mocks.decideSubmission.mockResolvedValueOnce({ ok: true, submissionId: "evaluation-route-first", status: "rejected", email: null });
		mocks.decideSubmission.mockRejectedValueOnce(new Error("injected route failure"));
		mocks.broadcastEventInvalidate.mockResolvedValue(true);
		const decisionsResponse = await bulkDecide(request("https://conference.example.test/api/admin/events/evaluation-route/review/decisions", { submissionIds: ["evaluation-route-first", "evaluation-route-second"], action: "reject" }), context);
		expect(decisionsResponse.status).toBe(207);
		expect(await decisionsResponse.json()).toMatchObject({ ok: false, partial: true, succeeded: 1, failed: 1, outcomes: [{ submissionId: "evaluation-route-first", ok: true }, { submissionId: "evaluation-route-second", ok: false, error: "injected route failure", status: 500 }] });
		expect(mocks.broadcastEventInvalidate).toHaveBeenCalledWith(event.id, "tasks.decide");
	});
});
