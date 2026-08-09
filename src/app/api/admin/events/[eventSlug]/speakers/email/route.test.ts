import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	authorize: vi.fn(),
	getDb: vi.fn(),
	getEnv: vi.fn(),
	validateRecipients: vi.fn(),
	emailSpeakers: vi.fn(),
	broadcast: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({ authorizeWritableEventAdminApi: mocks.authorize }));
vi.mock("@/lib/db/cloudflare", () => ({ getDb: mocks.getDb, getCloudflareEnv: mocks.getEnv }));
vi.mock("@/lib/realtime/event-room", () => ({ broadcastEventInvalidate: mocks.broadcast }));
vi.mock("@/lib/speakers/roster", () => ({
	emailRosterSpeakers: mocks.emailSpeakers,
	filterRosterSpeakers: vi.fn(() => []),
	isSpeakerWorkflowStatus: vi.fn(() => false),
	listEventSpeakerRoster: vi.fn(() => []),
	resolveRosterBulkEmailTemplateKey: vi.fn(() => "speaker_announcement"),
	validateRosterRecipientSelection: mocks.validateRecipients,
}));

import { POST } from "./route";

describe("speaker email recipient boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		const db = { marker: "event-db" };
		mocks.getDb.mockResolvedValue(db);
		mocks.authorize.mockResolvedValue({ ok: true, access: { event: { id: "event-a", slug: "event-a", name: "Event A" } } });
		mocks.validateRecipients.mockResolvedValue(false);
	});

	it("rejects a mixed explicit selection before calling the mail sender", async () => {
		const request = new Request("https://conference.example.test/api/admin/events/event-a/speakers/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ personIds: ["speaker-event-a", "speaker-event-b"], templateKey: "speaker_announcement", subject: "Welcome", text: "Hello" }),
		});
		const response = await POST(request, { params: Promise.resolve({ eventSlug: "event-a" }) });
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ ok: false, error: "Every recipient must belong to this event's speaker roster" });
		expect(mocks.validateRecipients).toHaveBeenCalledWith(expect.objectContaining({ marker: "event-db" }), "event-a", ["speaker-event-a", "speaker-event-b"]);
		expect(mocks.getEnv).not.toHaveBeenCalled();
		expect(mocks.emailSpeakers).not.toHaveBeenCalled();
	});
});
