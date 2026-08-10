import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { ADMIN_EVENT_MUTATION_FAMILIES } from "@/lib/events/admin-mutation-families";

const mocks = vi.hoisted(() => ({
	authorizeWritableEventAdminApi: vi.fn(),
	decideSubmission: vi.fn(),
	broadcastEventInvalidate: vi.fn(),
}));

vi.mock("@/lib/db/cloudflare", () => ({ getDb: async () => env.DB }));
vi.mock("@/lib/auth/admin", () => ({ authorizeWritableEventAdminApi: mocks.authorizeWritableEventAdminApi }));
vi.mock("@/lib/speakers/decide", () => ({ decideSubmission: mocks.decideSubmission }));
vi.mock("@/lib/realtime/event-room", () => ({ broadcastEventInvalidate: mocks.broadcastEventInvalidate }));

import { POST as createForm } from "@/app/api/admin/events/[eventSlug]/forms/route";
import { POST as decide } from "@/app/api/admin/events/[eventSlug]/submissions/[submissionId]/decide/route";
import { POST as createSession } from "@/app/api/admin/events/[eventSlug]/sessions/route";

const now = 1_780_300_000_000;
const demoEvent = { id: "admin-demo-guard-event", slug: "admin-demo-guard", name: "Demo guard", timezone: "UTC", mode: "demo" as const, created_at: now, updated_at: now };
const liveEvent = { ...demoEvent, id: "admin-live-guard-event", slug: "admin-live-guard", mode: "live" as const };

function eventContext(eventSlug: string) {
	return { params: Promise.resolve({ eventSlug }) };
}

function submissionContext(eventSlug: string, submissionId: string) {
	return { params: Promise.resolve({ eventSlug, submissionId }) };
}

function jsonRequest(url: string, body: Record<string, unknown>): Request {
	return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("admin demo write gate", () => {
	it("keeps the complete admin mutation-family audit explicit", () => {
		expect(ADMIN_EVENT_MUTATION_FAMILIES).toEqual([
			"claim", "evaluation.activate", "export.airtable", "forms.metadata", "forms.fields",
			"members.invite-remove-leave-transfer", "reminders", "reviewers", "schedule",
			"sessions.create-import-clone-publish",
			"settings.rooms-tracks-tasks-event", "submissions.assignments-decisions-labels-speakers",
			"tokens.mint-revoke",
		]);
	});

	it("denies forms and decisions before D1, email, R2, or realtime side effects", async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(demoEvent.id, demoEvent.slug, demoEvent.name, demoEvent.timezone, demoEvent.mode, now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('admin-demo-guard-form', ?, 'cfp', 'Demo CFP', 'open', ?, ?)").bind(demoEvent.id, now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('admin-demo-guard-submission', 'admin-demo-guard-form', ?, 'submitted', '{}', ?, ?)").bind(demoEvent.id, now, now),
		]);
		const denied = () => ({ ok: false as const, response: NextResponse.json({ ok: false, error: "This demo event is read-only" }, { status: 403 }) });
		mocks.authorizeWritableEventAdminApi.mockReset();
		mocks.authorizeWritableEventAdminApi.mockImplementation(async () => denied());
		mocks.decideSubmission.mockReset();
		mocks.broadcastEventInvalidate.mockReset();
		const before = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM cfp_forms WHERE event_id = ?) AS forms, (SELECT COUNT(*) FROM submissions WHERE event_id = ?) AS submissions, (SELECT COUNT(*) FROM email_deliveries WHERE event_id = ?) AS deliveries, (SELECT COUNT(*) FROM assets WHERE event_id = ?) AS assets").bind(demoEvent.id, demoEvent.id, demoEvent.id, demoEvent.id).first();
		const beforeObjects = await env.FILES.list({ prefix: `events/${demoEvent.id}/` });

		const formResponse = await createForm(jsonRequest("https://conference.example.test/api/admin/events/admin-demo-guard/forms", { slug: "blocked", title: "Blocked form" }), eventContext(demoEvent.slug));
		const decisionResponse = await decide(jsonRequest("https://conference.example.test/api/admin/events/admin-demo-guard/submissions/admin-demo-guard-submission/decide", { action: "accept", email: { send: true, subject: "Accepted", text: "Welcome" } }), submissionContext(demoEvent.slug, "admin-demo-guard-submission"));
		const sessionResponse = await createSession(jsonRequest("https://conference.example.test/api/admin/events/admin-demo-guard/sessions", { origin: "manual", input: { title: "Blocked session" } }), eventContext(demoEvent.slug));
		expect(formResponse.status).toBe(403);
		expect(decisionResponse.status).toBe(403);
		expect(sessionResponse.status).toBe(403);
		expect(await env.DB.prepare("SELECT (SELECT COUNT(*) FROM cfp_forms WHERE event_id = ?) AS forms, (SELECT COUNT(*) FROM submissions WHERE event_id = ?) AS submissions, (SELECT COUNT(*) FROM email_deliveries WHERE event_id = ?) AS deliveries, (SELECT COUNT(*) FROM assets WHERE event_id = ?) AS assets").bind(demoEvent.id, demoEvent.id, demoEvent.id, demoEvent.id).first()).toEqual(before);
		expect(await env.FILES.list({ prefix: `events/${demoEvent.id}/` })).toEqual(beforeObjects);
		expect(mocks.decideSubmission).not.toHaveBeenCalled();
		expect(mocks.broadcastEventInvalidate).not.toHaveBeenCalled();
	});

	it("keeps a live admin form mutation working through the same gate", async () => {
		await env.DB.prepare("INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(liveEvent.id, liveEvent.slug, liveEvent.name, liveEvent.timezone, liveEvent.mode, now, now).run();
		mocks.authorizeWritableEventAdminApi.mockReset();
		mocks.authorizeWritableEventAdminApi.mockResolvedValue({ ok: true, access: { event: liveEvent, account: null, membership: null } });
		const response = await createForm(jsonRequest("https://conference.example.test/api/admin/events/admin-live-guard/forms", { slug: "live-form", title: "Live form" }), eventContext(liveEvent.slug));
		expect(response.status).toBe(200);
		expect(await env.DB.prepare("SELECT event_id, slug FROM cfp_forms WHERE event_id = ? AND slug = 'live-form'").bind(liveEvent.id).first()).toEqual({ event_id: liveEvent.id, slug: "live-form" });
	});
});
