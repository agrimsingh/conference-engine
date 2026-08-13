import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";

const configuredOrigin = "https://conference.example";
const mocks = vi.hoisted(() => ({
	authorizeWritableEventAdminApi: vi.fn(),
	bulkDecideSubmissions: vi.fn(),
	broadcastEventInvalidate: vi.fn(),
	decideSubmission: vi.fn(),
	notifyDecidedSubmissions: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
	authorizeWritableEventAdminApi: mocks.authorizeWritableEventAdminApi,
}));
vi.mock("@/lib/db/cloudflare", () => ({
	getCloudflareEnv: async () => ({ ...env, APP_ORIGIN: configuredOrigin }),
	getDb: async () => env.DB,
}));
vi.mock("@/lib/evaluation/decisions", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/evaluation/decisions")>()),
	bulkDecideSubmissions: mocks.bulkDecideSubmissions,
}));
vi.mock("@/lib/realtime/event-room", () => ({
	broadcastEventInvalidate: mocks.broadcastEventInvalidate,
}));
vi.mock("@/lib/speakers/decide", () => ({ decideSubmission: mocks.decideSubmission }));
vi.mock("@/lib/speakers/notify-decided", () => ({
	notifyDecidedSubmissions: mocks.notifyDecidedSubmissions,
}));

import { POST as decide } from "@/app/api/admin/events/[eventSlug]/submissions/[submissionId]/decide/route";
import { POST as notify } from "@/app/api/admin/events/[eventSlug]/submissions/notify/route";
import { POST as bulkDecide } from "@/app/api/admin/events/[eventSlug]/review/decisions/route";

const now = 1_780_910_000_000;
const event = {
	id: "configured-origin-decision-event",
	slug: "configured-origin-decision",
	name: "Configured origin decisions",
	timezone: "UTC",
	mode: "live" as const,
	created_at: now,
	updated_at: now,
};

function request(pathname: string, body: Record<string, unknown>): Request {
	return new Request(`https://evil.example${pathname}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("configured origins for decision email routes", () => {
	beforeEach(async () => {
		mocks.authorizeWritableEventAdminApi.mockReset();
		mocks.bulkDecideSubmissions.mockReset();
		mocks.broadcastEventInvalidate.mockReset();
		mocks.decideSubmission.mockReset();
		mocks.notifyDecidedSubmissions.mockReset();
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			).bind(event.id, event.slug, event.name, event.timezone, now, now),
			env.DB.prepare(
				"INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('configured-origin-decision-form', ?, 'cfp', 'CFP', 'open', ?, ?)",
			).bind(event.id, now, now),
			env.DB.prepare(
				"INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('configured-origin-decision-submission', 'configured-origin-decision-form', ?, 'submitted', '{}', ?, ?)",
			).bind(event.id, now, now),
		]);
		mocks.authorizeWritableEventAdminApi.mockResolvedValue({ ok: true, access: { event, account: null, membership: null } });
		mocks.broadcastEventInvalidate.mockResolvedValue(true);
		mocks.decideSubmission.mockResolvedValue({ ok: true, submissionId: "configured-origin-decision-submission", status: "accepted", email: null });
		mocks.bulkDecideSubmissions.mockResolvedValue({ succeeded: 1, failed: 0, outcomes: [] });
		mocks.notifyDecidedSubmissions.mockResolvedValue({ succeeded: 1, failed: 0, outcomes: [] });
	});

	it("passes the configured portal URL to every decision sender instead of the request origin", async () => {
		// Given: each route receives an untrusted host with an explicit email send.
		const email = { send: true, subject: "Decision", text: "An update" };

		// When: the single decision, bulk decision, and bulk notification endpoints send.
		const single = await decide(
			request(`/api/admin/events/${event.slug}/submissions/configured-origin-decision-submission/decide`, { action: "accept", email }),
			{ params: Promise.resolve({ eventSlug: event.slug, submissionId: "configured-origin-decision-submission" }) },
		);
		const bulk = await bulkDecide(
			request(`/api/admin/events/${event.slug}/review/decisions`, { submissionIds: ["configured-origin-decision-submission"], action: "accept", email }),
			{ params: Promise.resolve({ eventSlug: event.slug }) },
		);
		const notification = await notify(
			request(`/api/admin/events/${event.slug}/submissions/notify`, { submissionIds: ["configured-origin-decision-submission"], email }),
			{ params: Promise.resolve({ eventSlug: event.slug }) },
		);

		// Then: each downstream mail contract receives only the configured portal URL.
		expect([single.status, bulk.status, notification.status]).toEqual([200, 200, 200]);
		expect(mocks.decideSubmission).toHaveBeenCalledTimes(1);
		expect(mocks.decideSubmission.mock.calls[0]?.[1]).toBe("configured-origin-decision-submission");
		expect(mocks.decideSubmission.mock.calls[0]?.[2]).toBe("accept");
		expect(mocks.decideSubmission.mock.calls[0]?.[3]).toMatchObject({ portalUrl: `${configuredOrigin}/portal` });
		expect(mocks.bulkDecideSubmissions).toHaveBeenCalledTimes(1);
		expect(mocks.bulkDecideSubmissions.mock.calls[0]?.[1]).toMatchObject({
			email: { portalUrl: `${configuredOrigin}/portal` },
		});
		expect(mocks.notifyDecidedSubmissions).toHaveBeenCalledTimes(1);
		expect(mocks.notifyDecidedSubmissions.mock.calls[0]?.[1]).toMatchObject({
			email: { portalUrl: `${configuredOrigin}/portal` },
		});
	});
});
