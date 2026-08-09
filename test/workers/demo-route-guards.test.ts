import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	sendTemplatedEmail: vi.fn(),
}));

vi.mock("@/lib/db/cloudflare", () => ({
	getDb: async () => env.DB,
	getAuthSecret: async () => "demo-route-guard-secret",
	getCloudflareEnv: async () => ({}),
}));

vi.mock("@/lib/email/resend", () => ({
	sendTemplatedEmail: mocks.sendTemplatedEmail,
}));

vi.mock("@/lib/auth/admin", () => ({
	shouldExposeDevLoginUrl: async () => false,
}));

import { POST as requestPortalLink } from "@/app/api/portal/session/route";
import { POST as requestDraftLink } from "@/app/api/e/[eventSlug]/submit/[formSlug]/draft/route";

const now = 1_780_100_000_000;

function request(url: string, body: Record<string, unknown>): Request {
	return new Request(url, {
		method: "POST",
		headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.20" },
		body: JSON.stringify(body),
	});
}

async function seedEvent(args: { id: string; slug: string; mode: "demo" | "live" }): Promise<void> {
	await env.DB.prepare(
		"INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES (?, ?, ?, 'UTC', ?, ?, ?)",
	).bind(args.id, args.slug, args.slug, args.mode, now, now).run();
}

async function seedForm(args: { id: string; eventId: string; slug: string; status: "open" | "closed" }): Promise<void> {
	await env.DB.prepare(
		"INSERT INTO cfp_forms (id, event_id, slug, title, status, drafts_enabled, created_at, updated_at) VALUES (?, ?, ?, 'CFP', ?, 1, ?, ?)",
	).bind(args.id, args.eventId, args.slug, args.status, now, now).run();
}

describe("demo public-route guards", () => {
	it("does not create portal rate limits, challenges, or delivery attempts for a demo-only person", async () => {
		await seedEvent({ id: "portal-demo-only-event", slug: "portal-demo-only", mode: "demo" });
		await seedForm({ id: "portal-demo-only-form", eventId: "portal-demo-only-event", slug: "cfp", status: "open" });
		await env.DB.batch([
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('portal-demo-only-person', 'demo-only@portal.test', 'Demo only', ?)").bind(now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_person_id, created_at, updated_at) VALUES ('portal-demo-only-submission', 'portal-demo-only-form', 'portal-demo-only-event', 'accepted', '{}', 'portal-demo-only-person', ?, ?)").bind(now, now),
		]);
		const before = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM rate_limit_buckets) AS buckets, (SELECT COUNT(*) FROM auth_challenges) AS challenges, (SELECT COUNT(*) FROM email_deliveries) AS deliveries").first();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		mocks.sendTemplatedEmail.mockReset();
		try {
			const response = await requestPortalLink(request("https://conference.example.test/api/portal/session", { email: "demo-only@portal.test" }));
			expect(response.status).toBe(202);
			expect(await response.json()).toEqual({ ok: true });
			expect(await env.DB.prepare("SELECT (SELECT COUNT(*) FROM rate_limit_buckets) AS buckets, (SELECT COUNT(*) FROM auth_challenges) AS challenges, (SELECT COUNT(*) FROM email_deliveries) AS deliveries").first()).toEqual(before);
			expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
			expect(fetchMock).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("creates a portal challenge for the live event when the same person also owns a demo proposal", async () => {
		await seedEvent({ id: "portal-mixed-demo-event", slug: "portal-mixed-demo", mode: "demo" });
		await seedEvent({ id: "portal-mixed-live-event", slug: "portal-mixed-live", mode: "live" });
		await seedForm({ id: "portal-mixed-demo-form", eventId: "portal-mixed-demo-event", slug: "cfp", status: "open" });
		await seedForm({ id: "portal-mixed-live-form", eventId: "portal-mixed-live-event", slug: "cfp", status: "open" });
		await env.DB.batch([
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('portal-mixed-person', 'mixed@portal.test', 'Mixed person', ?)").bind(now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_person_id, created_at, updated_at) VALUES ('portal-mixed-demo-submission', 'portal-mixed-demo-form', 'portal-mixed-demo-event', 'accepted', '{}', 'portal-mixed-person', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_person_id, created_at, updated_at) VALUES ('portal-mixed-live-submission', 'portal-mixed-live-form', 'portal-mixed-live-event', 'accepted', '{}', 'portal-mixed-person', ?, ?)").bind(now, now + 1),
		]);
		mocks.sendTemplatedEmail.mockReset();
		mocks.sendTemplatedEmail.mockResolvedValue({ ok: true, status: "sent", providerId: "provider-live", messageId: "live-link" });

		const response = await requestPortalLink(request("https://conference.example.test/api/portal/session", { email: "mixed@portal.test" }));
		expect(response.status).toBe(202);
		expect(mocks.sendTemplatedEmail).toHaveBeenCalledOnce();
		expect(await env.DB.prepare("SELECT event_id, person_id, state FROM auth_challenges WHERE person_id = 'portal-mixed-person' AND kind = 'portal_login'").first()).toEqual({ event_id: "portal-mixed-live-event", person_id: "portal-mixed-person", state: "active" });
	});

	it("checks closed demo form state before consuming draft-link rate-limit buckets", async () => {
		await seedEvent({ id: "draft-closed-demo-event", slug: "draft-closed-demo", mode: "demo" });
		await seedForm({ id: "draft-closed-demo-form", eventId: "draft-closed-demo-event", slug: "cfp", status: "closed" });
		const before = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM rate_limit_buckets) AS buckets, (SELECT COUNT(*) FROM submission_drafts) AS drafts, (SELECT COUNT(*) FROM submission_draft_tokens) AS tokens, (SELECT COUNT(*) FROM email_deliveries) AS deliveries").first();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		mocks.sendTemplatedEmail.mockReset();
		try {
			const response = await requestDraftLink(
				request("https://conference.example.test/api/e/draft-closed-demo/submit/cfp/draft", { email: "draft@demo.test", submitterName: "Demo draft", answers: {} }),
				{ params: Promise.resolve({ eventSlug: "draft-closed-demo", formSlug: "cfp" }) },
			);
			expect(response.status).toBe(202);
			expect(await response.json()).toEqual({ ok: true });
			expect(await env.DB.prepare("SELECT (SELECT COUNT(*) FROM rate_limit_buckets) AS buckets, (SELECT COUNT(*) FROM submission_drafts) AS drafts, (SELECT COUNT(*) FROM submission_draft_tokens) AS tokens, (SELECT COUNT(*) FROM email_deliveries) AS deliveries").first()).toEqual(before);
			expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
			expect(fetchMock).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
