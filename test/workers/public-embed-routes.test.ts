import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorizeEventAdminApi: vi.fn(), authorizeWritableEventAdminApi: vi.fn() }));
vi.mock("@/lib/auth/admin", () => ({ authorizeEventAdminApi: mocks.authorizeEventAdminApi, authorizeWritableEventAdminApi: mocks.authorizeWritableEventAdminApi }));
vi.mock("@/lib/db/cloudflare", () => ({ getDb: async () => env.DB }));

import { POST } from "@/app/api/admin/events/[eventSlug]/embeds/route";
import { PATCH } from "@/app/api/admin/events/[eventSlug]/embeds/[embedId]/route";
import { GET as publicJson } from "@/app/api/e/[eventSlug]/embeds/[embedSlug]/route";
import { GET as publicHtml } from "@/app/api/e/[eventSlug]/embeds/[embedSlug]/html/route";
import { GET as publicXml } from "@/app/api/e/[eventSlug]/embeds/[embedSlug]/xml/route";
import { createEventWithDefaults } from "@/lib/events/create-event";
import type { AccountRow, EventRow } from "@/lib/db/types";

let sequence = 0; const now = 1_781_310_000_000;
async function event(): Promise<EventRow> { sequence += 1; const owner: AccountRow = { id: `embed-route-owner-${sequence}`, email: `embed-route-${sequence}@test.invalid`, name: "Owner", created_at: now, updated_at: now }; await env.DB.prepare("INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(owner.id, owner.email, owner.name, now, now).run(); const made = await createEventWithDefaults(env.DB, { name: "Route embed", slug: `embed-route-${sequence}`, timezone: "UTC", startDay: "2026-11-01", endDay: "2026-11-01" }, owner); return (await env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(made.eventId).first<EventRow>())!; }
function request(body: unknown) { return new Request("https://widgets.test/api/admin/embed", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
const valid = { name: "Agenda", slug: "agenda", widgetType: "agenda", brandColor: "#2563eb", trackIds: [], formats: [], rooms: [], visibleFields: ["title", "time", "room"] };

describe("embed routes", () => {
	beforeEach(() => { mocks.authorizeWritableEventAdminApi.mockReset(); mocks.authorizeEventAdminApi.mockReset(); });
	it("rejects unauthenticated and demo-event writes through the writable authorization gate", async () => {
		mocks.authorizeWritableEventAdminApi.mockResolvedValue({ ok: false, response: Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }) });
		expect((await POST(request(valid), { params: Promise.resolve({ eventSlug: "other" }) })).status).toBe(401);
		mocks.authorizeWritableEventAdminApi.mockResolvedValue({ ok: false, response: Response.json({ ok: false, error: "This demo event is read-only" }, { status: 403 }) });
		expect((await POST(request(valid), { params: Promise.resolve({ eventSlug: "demo" }) })).status).toBe(403);
	});

	it("creates a scoped definition, validates config and prevents cross-event updates", async () => {
		const first = await event(); const second = await event(); mocks.authorizeWritableEventAdminApi.mockResolvedValue({ ok: true, access: { event: first, account: null, membership: null } });
		const invalid = await POST(request({ ...valid, brandColor: "red;url(javascript:alert(1))" }), { params: Promise.resolve({ eventSlug: first.slug }) }); expect(invalid.status).toBe(400);
		const createdResponse = await POST(request(valid), { params: Promise.resolve({ eventSlug: first.slug }) }); expect(createdResponse.status).toBe(201); const created = await createdResponse.json() as { embed: { id: string; urls: { iframeSnippet: string } } }; expect(created.embed.urls.iframeSnippet).toContain("/embed/");
		mocks.authorizeWritableEventAdminApi.mockResolvedValue({ ok: true, access: { event: second, account: null, membership: null } });
		const crossEvent = await PATCH(request({ ...valid, name: "Hijacked" }), { params: Promise.resolve({ eventSlug: second.slug, embedId: created.embed.id }) }); expect(crossEvent.status).toBe(404);
		const publicResponse = await publicJson(new Request(`https://widgets.test/api/e/${first.slug}/embeds/agenda`), { params: Promise.resolve({ eventSlug: first.slug, embedSlug: "agenda" }) }); expect(publicResponse.status).toBe(200); expect(publicResponse.headers.get("Access-Control-Allow-Origin")).toBe("*");
		const html = await publicHtml(new Request("https://widgets.test/html"), { params: Promise.resolve({ eventSlug: first.slug, embedSlug: "agenda" }) }); expect(html.headers.get("Content-Type")).toContain("text/html"); expect(await html.text()).toContain("<!doctype html>");
		const xml = await publicXml(new Request("https://widgets.test/xml"), { params: Promise.resolve({ eventSlug: first.slug, embedSlug: "agenda" }) }); expect(xml.headers.get("Content-Type")).toContain("application/xml"); expect(await xml.text()).toContain("<event");
	});
});
