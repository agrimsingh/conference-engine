import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	authorizeRead: vi.fn(),
	authorizeWrite: vi.fn(),
	getDb: vi.fn(),
	getEnv: vi.fn(),
	getStatus: vi.fn(),
	save: vi.fn(),
	remove: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
	authorizeEventAdminApi: mocks.authorizeRead,
	authorizeWritableEventAdminApi: mocks.authorizeWrite,
}));
vi.mock("@/lib/db/cloudflare", () => ({
	getDb: mocks.getDb,
	getCloudflareEnv: mocks.getEnv,
}));
vi.mock("@/lib/integrations/accelevents/repository", () => ({
	ACCELEVENTS_SESSION_TYPE_FORMATS: ["IN_PERSON", "VIRTUAL", "HYBRID"],
	deleteAcceleventsIntegration: mocks.remove,
	getAcceleventsIntegrationStatus: mocks.getStatus,
	saveAcceleventsIntegration: mocks.save,
}));

import { GET, POST } from "./route";

describe("Accelevents organizer configuration API", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getDb.mockResolvedValue({ marker: "db" });
		mocks.getEnv.mockResolvedValue({ AUTH_SECRET: "test-secret" });
		mocks.getStatus.mockResolvedValue({ configured: true, externalEventId: 99 });
		mocks.authorizeRead.mockResolvedValue({ event: { id: "event-a" } });
		mocks.authorizeWrite.mockResolvedValue({ ok: true, access: { event: { id: "event-a" } } });
		mocks.save.mockResolvedValue({
			configured: true,
			eventUrl: "demo-event",
			externalEventId: 99,
			sessionTypeFormat: "IN_PERSON",
			lastSyncAt: null,
			lastSyncError: null,
		});
	});

	it("stores a submitted API key without returning it", async () => {
		const response = await POST(
			new Request("https://conference.example.test/api/admin/events/event-a/integrations/accelevents", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					eventUrl: "https://www.accelevents.com/events/demo-event",
					externalEventId: 99,
					apiKey: "private-api-key",
					sessionTypeFormat: "IN_PERSON",
				}),
			}),
			{ params: Promise.resolve({ eventSlug: "event-a" }) },
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			ok: true,
			integration: {
				configured: true,
				eventUrl: "demo-event",
				externalEventId: 99,
				sessionTypeFormat: "IN_PERSON",
				lastSyncAt: null,
				lastSyncError: null,
			},
		});
		expect(mocks.save).toHaveBeenCalledWith(
			{ marker: "db" },
			expect.objectContaining({ eventId: "event-a", externalEventId: 99, apiKey: "private-api-key" }),
		);
	});

	it("does not disclose configuration to an unauthorized request", async () => {
		mocks.authorizeRead.mockResolvedValue(null);
		const response = await GET(
			new Request("https://conference.example.test/api/admin/events/event-a/integrations/accelevents"),
			{ params: Promise.resolve({ eventSlug: "event-a" }) },
		);
		expect(response.status).toBe(401);
		expect(mocks.getStatus).not.toHaveBeenCalled();
	});

	it("retains the encrypted key when updating the event URL without a replacement", async () => {
		const response = await POST(
			new Request("https://conference.example.test/api/admin/events/event-a/integrations/accelevents", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					eventUrl: "new-demo-event",
					externalEventId: 100,
					apiKey: "",
					sessionTypeFormat: "VIRTUAL",
				}),
			}),
			{ params: Promise.resolve({ eventSlug: "event-a" }) },
		);

		expect(response.status).toBe(200);
		expect(mocks.save).toHaveBeenCalledWith(
			{ marker: "db" },
			expect.objectContaining({
				eventId: "event-a",
				eventUrl: "new-demo-event",
				externalEventId: 100,
				sessionTypeFormat: "VIRTUAL",
				apiKey: undefined,
			}),
		);
	});
});
