import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	authorize: vi.fn(),
	getDb: vi.fn(),
	getEnv: vi.fn(),
	sync: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({ authorizeWritableEventAdminApi: mocks.authorize }));
vi.mock("@/lib/db/cloudflare", () => ({ getDb: mocks.getDb, getCloudflareEnv: mocks.getEnv }));
vi.mock("@/lib/integrations/accelevents/sync", () => ({ syncAcceleventsEvent: mocks.sync }));

import { POST } from "./route";

describe("Accelevents organizer sync API", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getDb.mockResolvedValue({ marker: "db" });
		mocks.getEnv.mockResolvedValue({ AUTH_SECRET: "test-secret" });
		mocks.authorize.mockResolvedValue({
			ok: true,
			access: { event: { id: "event-a", timezone: "UTC" } },
		});
		mocks.sync.mockResolvedValue({
			ok: true,
			dryRun: true,
			configured: true,
			actions: [],
			failures: [],
		});
	});

	it("defaults to a dry run so a request cannot push by omission", async () => {
		const response = await POST(
			new Request("https://conference.example.test/api/admin/events/event-a/integrations/accelevents/sync", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{}",
			}),
			{ params: Promise.resolve({ eventSlug: "event-a" }) },
		);
		expect(response.status).toBe(200);
		expect(mocks.sync).toHaveBeenCalledWith(
			{ marker: "db" },
			expect.objectContaining({
				eventId: "event-a",
				timezone: "UTC",
				dryRun: true,
				secret: "test-secret",
			}),
		);
	});

	it("rejects a direct push unless the organizer explicitly confirms a reviewed preview", async () => {
		const response = await POST(
			new Request("https://conference.example.test/api/admin/events/event-a/integrations/accelevents/sync", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ dryRun: false }),
			}),
			{ params: Promise.resolve({ eventSlug: "event-a" }) },
		);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ ok: false, error: "A reviewed preview is required before pushing Accelevents changes" });
		expect(mocks.sync).not.toHaveBeenCalled();
	});
});
