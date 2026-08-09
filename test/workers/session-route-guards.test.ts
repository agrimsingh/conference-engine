import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { createEventWithDefaults } from "@/lib/events/create-event";
import type { AccountRow } from "@/lib/db/types";

const mocks = vi.hoisted(() => ({
	authorizeWritableEventAdminApi: vi.fn(),
	authorizeEventAdminApi: vi.fn(),
	getSubmissionById: vi.fn(),
	cloneSession: vi.fn(),
	broadcastEventInvalidate: vi.fn(),
}));

vi.mock("@/lib/db/cloudflare", () => ({ getDb: async () => env.DB }));
vi.mock("@/lib/auth/admin", () => ({ authorizeWritableEventAdminApi: mocks.authorizeWritableEventAdminApi, authorizeEventAdminApi: mocks.authorizeEventAdminApi }));
vi.mock("@/lib/db/queries", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/db/queries")>(), getSubmissionById: mocks.getSubmissionById }));
vi.mock("@/lib/sessions/session", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/sessions/session")>(), cloneSession: mocks.cloneSession }));
vi.mock("@/lib/realtime/event-room", () => ({ broadcastEventInvalidate: mocks.broadcastEventInvalidate }));

import { POST as createSession } from "@/app/api/admin/events/[eventSlug]/sessions/route";
import { POST as cloneSessionRoute } from "@/app/api/admin/events/[eventSlug]/sessions/clone/route";

const now = 1_781_200_000_000;

function context(eventSlug: string) { return { params: Promise.resolve({ eventSlug }) }; }
function request(url: string, body: Record<string, unknown>) { return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }

describe("session route guards", () => {
	it("rejects an invited session without a complete speaker before it leaves a session row", async () => {
		const owner: AccountRow = { id: "session-route-owner", email: "session-route-owner@test.invalid", name: "Owner", created_at: now, updated_at: now };
		await env.DB.prepare("INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(owner.id, owner.email, owner.name, now, now).run();
		const created = await createEventWithDefaults(env.DB, { name: "Session route", slug: "session-route", timezone: "UTC", startDay: "2026-11-01", endDay: "2026-11-01" }, owner);
		mocks.authorizeWritableEventAdminApi.mockResolvedValue({ ok: true, access: { event: { id: created.eventId, slug: created.slug, name: "Session route", timezone: "UTC", created_at: now, updated_at: now }, account: owner, membership: null } });
		mocks.broadcastEventInvalidate.mockResolvedValue(false);
		const response = await createSession(request("https://conference.example.test/api/admin/events/session-route/sessions", { origin: "invited", input: { title: "Missing speaker" } }), context(created.slug));
		expect(response.status).toBe(400);
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM submissions WHERE event_id = ?").bind(created.eventId).first()).toEqual({ count: 0 });
	});

	it("denies a cross-event clone before the clone service can read or write it", async () => {
		const target = { id: "clone-target-route", slug: "clone-target-route", name: "Target", timezone: "UTC", created_at: now, updated_at: now };
		await env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(target.id, target.slug, target.name, target.timezone, now, now).run();
		await env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('clone-source-route', 'clone-source-route', 'Source', 'UTC', ?, ?)").bind(now, now).run();
		mocks.authorizeWritableEventAdminApi.mockResolvedValue({ ok: true, access: { event: target, account: null, membership: null } });
		mocks.getSubmissionById.mockResolvedValue({ id: "cross-event-source", event_id: "clone-source-route", status: "accepted", lineage_root_submission_id: null });
		mocks.authorizeEventAdminApi.mockResolvedValue(null);
		mocks.cloneSession.mockReset();
		const response = await cloneSessionRoute(request("https://conference.example.test/api/admin/events/clone-target-route/sessions/clone", { sourceSubmissionId: "cross-event-source" }), context(target.slug));
		expect(response.status).toBe(404);
		expect(mocks.cloneSession).not.toHaveBeenCalled();
	});
});
