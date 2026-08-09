import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEventWithDefaults } from "@/lib/events/create-event";
import {
	createPortalResource,
	deletePortalResource,
	listOrganizerPortalResources,
	listPublishedPortalResourcesForSpeaker,
	updatePortalResource,
} from "@/lib/resources/resources";
import type { AccountRow } from "@/lib/db/types";

const mocks = vi.hoisted(() => ({ authorizeEventAdminApi: vi.fn(), authorizeWritableEventAdminApi: vi.fn() }));
vi.mock("@/lib/auth/admin", () => ({ authorizeEventAdminApi: mocks.authorizeEventAdminApi, authorizeWritableEventAdminApi: mocks.authorizeWritableEventAdminApi }));
vi.mock("@/lib/db/cloudflare", () => ({ getDb: async () => env.DB }));
import { GET, POST } from "@/app/api/admin/events/[eventSlug]/resources/route";
import { DELETE, PATCH } from "@/app/api/admin/events/[eventSlug]/resources/[resourceId]/route";

const now = 1_785_000_000_000;
let sequence = 0;

async function event(label: string) {
	sequence += 1;
	const owner: AccountRow = {
		id: `resource-owner-${sequence}`,
		email: `resource-owner-${sequence}@test.invalid`,
		name: "Owner",
		created_at: now,
		updated_at: now,
	};
	await env.DB.prepare("INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
		.bind(owner.id, owner.email, owner.name, now, now)
		.run();
	return createEventWithDefaults(env.DB, {
		name: label,
		slug: `resources-${sequence}`,
		timezone: "UTC",
		startDay: "2026-11-01",
		endDay: "2026-11-02",
	}, owner);
}

describe("portal resources", () => {
	beforeEach(() => { mocks.authorizeEventAdminApi.mockReset(); mocks.authorizeWritableEventAdminApi.mockReset(); });
	it("keeps drafts organizer-only and shows published resources only to speakers in the event", async () => {
		const first = await event("First event");
		const second = await event("Second event");
		await env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('portal-resource-speaker', 'speaker@test.invalid', 'Speaker', ?)")
			.bind(now)
			.run();
		await env.DB.prepare("INSERT INTO event_speaker_profiles (id, event_id, person_id, workflow_status, created_at, updated_at) VALUES ('portal-resource-profile', ?, 'portal-resource-speaker', 'confirmed', ?, ?)")
			.bind(first.eventId, now, now)
			.run();

		await createPortalResource(env.DB, first.eventId, {
			title: "Published guide", slug: "published-guide", resourceType: "rich_text", content: "Read this first.", embedUrl: null, published: 1,
		});
		await createPortalResource(env.DB, first.eventId, {
			title: "Draft guide", slug: "draft-guide", resourceType: "rich_text", content: "Not ready.", embedUrl: null, published: 0,
		});
		await createPortalResource(env.DB, second.eventId, {
			title: "Other event", slug: "other-event", resourceType: "rich_text", content: "Private to another event.", embedUrl: null, published: 1,
		});

		expect((await listOrganizerPortalResources(env.DB, first.eventId)).map((resource) => resource.title))
			.toEqual(["Published guide", "Draft guide"]);
		expect((await listPublishedPortalResourcesForSpeaker(env.DB, "portal-resource-speaker")).map((resource) => resource.title))
			.toEqual(["Published guide"]);
	});

	it("updates and deletes only within the owning event", async () => {
		const first = await event("Mutation owner");
		const second = await event("Mutation foreign");
		const created = await createPortalResource(env.DB, first.eventId, {
			title: "Arrival guide", slug: "arrival-guide", resourceType: "rich_text", content: "Original guide.", embedUrl: null, published: 0,
		});

		expect(await updatePortalResource(env.DB, second.eventId, created.id, {
			title: "Foreign edit", slug: "foreign-edit", resourceType: "rich_text", content: "Should not persist.", embedUrl: null, published: 1,
		})).toBeNull();
		expect(await deletePortalResource(env.DB, second.eventId, created.id)).toBe(false);
		expect(await updatePortalResource(env.DB, first.eventId, created.id, {
			title: "Updated arrival guide", slug: "arrival-guide", resourceType: "embed", content: "", embedUrl: "https://maps.example.test/arrival", published: 1,
		})).toMatchObject({ title: "Updated arrival guide", resource_type: "embed", published: 1 });
		expect(await deletePortalResource(env.DB, first.eventId, created.id)).toBe(true);
		expect(await listOrganizerPortalResources(env.DB, first.eventId)).toEqual([]);
	});

	it("enforces route authorization, validates unsafe embeds, and preserves tenant boundaries", async () => {
		const first = await event("Route owner");
		const second = await event("Route foreign");
		const firstAccess = { id: first.eventId, slug: first.slug, name: "Route owner", timezone: "UTC", mode: "live" as const, created_at: now, updated_at: now };
		const secondAccess = { id: second.eventId, slug: second.slug, name: "Route foreign", timezone: "UTC", mode: "live" as const, created_at: now, updated_at: now };
		const body = { title: "Travel guide", slug: "travel-guide", resourceType: "rich_text", content: "Bring your badge.", published: true };
		const request = (method: "POST" | "PATCH", value: unknown) => new Request("https://conference.example.test/resources", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
		mocks.authorizeWritableEventAdminApi.mockResolvedValue({ ok: false, response: Response.json({ ok: false, error: "This demo event is read-only" }, { status: 403 }) });
		expect((await POST(request("POST", body), { params: Promise.resolve({ eventSlug: "demo" }) })).status).toBe(403);
		mocks.authorizeWritableEventAdminApi.mockResolvedValue({ ok: true, access: { event: firstAccess, account: null, membership: null } });
		expect((await POST(request("POST", { ...body, resourceType: "embed", embed: '<iframe src="https://maps.example.test"></iframe><script>alert(1)</script>' }), { params: Promise.resolve({ eventSlug: first.slug }) })).status).toBe(400);
		const createdResponse = await POST(request("POST", body), { params: Promise.resolve({ eventSlug: first.slug }) });
		expect(createdResponse.status).toBe(201);
		const created = await createdResponse.json() as { resource: { id: string } };
		mocks.authorizeEventAdminApi.mockResolvedValue({ event: firstAccess, account: null, membership: null });
		expect((await GET(new Request("https://conference.example.test/resources"), { params: Promise.resolve({ eventSlug: first.slug }) })).status).toBe(200);
		mocks.authorizeWritableEventAdminApi.mockResolvedValue({ ok: true, access: { event: secondAccess, account: null, membership: null } });
		expect((await PATCH(request("PATCH", body), { params: Promise.resolve({ eventSlug: second.slug, resourceId: created.resource.id }) })).status).toBe(404);
		expect((await DELETE(new Request("https://conference.example.test/resources", { method: "DELETE" }), { params: Promise.resolve({ eventSlug: second.slug, resourceId: created.resource.id }) })).status).toBe(404);
	});
});
