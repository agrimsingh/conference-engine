import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	authorizeRead: vi.fn(),
	authorizeWrite: vi.fn(),
	getDb: vi.fn(),
	getDetail: vi.fn(),
	normalizeTags: vi.fn(),
	update: vi.fn(),
	listRoster: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
	authorizeEventAdminApi: mocks.authorizeRead,
	authorizeWritableEventAdminApi: mocks.authorizeWrite,
}));
vi.mock("@/lib/db/cloudflare", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/speakers/crm", () => ({
	getSpeakerCrmDetail: mocks.getDetail,
	normalizeSpeakerCrmTags: mocks.normalizeTags,
	updateSpeakerCrm: mocks.update,
}));
vi.mock("@/lib/speakers/roster", () => ({ listEventSpeakerRoster: mocks.listRoster }));

import { GET, PATCH } from "./route";

const crm = {
	owner: { accountId: "owner-a", name: "Owner", email: "owner@example.test" },
	tags: ["VIP"],
	lastContactAt: 1_780_600_000_000,
	timeline: [],
};

describe("speaker CRM API", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getDb.mockResolvedValue({ marker: "event-db" });
		mocks.authorizeRead.mockResolvedValue({ event: { id: "event-a" } });
		mocks.authorizeWrite.mockResolvedValue({ ok: true, access: { event: { id: "event-a" }, account: { id: "owner-a" } } });
		mocks.listRoster.mockResolvedValue([{ personId: "speaker-a" }]);
		mocks.normalizeTags.mockReturnValue({ ok: true, tags: ["VIP"] });
		mocks.update.mockResolvedValue({ ok: true, detail: crm });
	});

	it("keeps private CRM updates inside the authorized event speaker roster", async () => {
		// Given: an organizer editing a roster speaker's owner, tag, and contact note.
		const request = new Request("https://conference.example.test/api/admin/events/event-a/speakers/speaker-a/crm", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ ownerAccountId: "owner-a", tags: ["VIP"], contactNote: "Called after agenda update" }),
		});

		// When: the organizer submits the CRM update.
		const response = await PATCH(request, { params: Promise.resolve({ eventSlug: "event-a", personId: "speaker-a" }) });

		// Then: the route sends a scoped, attributed update to the CRM service.
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true, crm });
		expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ marker: "event-db" }), expect.objectContaining({
			eventId: "event-a",
			personId: "speaker-a",
			ownerAccountId: "owner-a",
			tags: ["VIP"],
			contactNote: "Called after agenda update",
			authorAccountId: "owner-a",
		}));
	});

	it("does not disclose CRM history for a person outside the event roster", async () => {
		// Given: a valid organizer but an unrelated person id.
		mocks.listRoster.mockResolvedValue([{ personId: "speaker-a" }]);

		// When: the organizer asks for that person's CRM timeline.
		const response = await GET(new Request("https://conference.example.test"), {
			params: Promise.resolve({ eventSlug: "event-a", personId: "speaker-b" }),
		});

		// Then: no CRM detail query runs and the route reports the scoped absence.
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ ok: false, error: "Speaker not found" });
		expect(mocks.getDetail).not.toHaveBeenCalled();
	});
});
