import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	requireV1ReadAccess: vi.fn(),
	getDb: vi.fn(),
	getEventBySlug: vi.fn(),
	listLabelsForEvent: vi.fn(),
	listSubmissionsForEvent: vi.fn(),
	listAgendaTracks: vi.fn(),
	listAgendaSlotsWithSubmissions: vi.fn(),
	listEventRooms: vi.fn(),
	listSpeakersForSubmission: vi.fn(),
	listSpeakersForSubmissions: vi.fn(),
}));

vi.mock("@/lib/auth/public-api", () => ({
	requireV1ReadAccess: mocks.requireV1ReadAccess,
}));

vi.mock("@/lib/db/cloudflare", () => ({
	getDb: mocks.getDb,
}));

vi.mock("@/lib/db/queries", () => ({
	getEventBySlug: mocks.getEventBySlug,
	listLabelsForEvent: mocks.listLabelsForEvent,
	listSubmissionsForEvent: mocks.listSubmissionsForEvent,
	listAgendaTracks: mocks.listAgendaTracks,
	listAgendaSlotsWithSubmissions: mocks.listAgendaSlotsWithSubmissions,
	listEventRooms: mocks.listEventRooms,
	listSpeakersForSubmission: mocks.listSpeakersForSubmission,
	listSpeakersForSubmissions: mocks.listSpeakersForSubmissions,
}));

import { GET as getSubmissions } from "@/app/api/v1/events/[eventSlug]/submissions/route";
import { GET as getSchedule } from "@/app/api/v1/events/[eventSlug]/schedule/route";

const db = {};
const event = {
	id: "performance-event",
	slug: "performance-event",
	name: "Performance Event",
	timezone: "UTC",
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.requireV1ReadAccess.mockResolvedValue({ ok: true });
	mocks.getDb.mockResolvedValue(db);
	mocks.getEventBySlug.mockResolvedValue(event);
	mocks.listSpeakersForSubmission.mockRejectedValue(
		new Error("serial speaker lookups are a regression"),
	);
});

describe("public API speaker loading", () => {
	it("Given multiple submissions, when the submissions API responds, then it makes one bulk speaker fetch", async () => {
		mocks.listSubmissionsForEvent.mockResolvedValue([
			{
				id: "submission-a",
				status: "submitted",
				answers_json: JSON.stringify({ title: "First talk" }),
				submitter_name: "Ari",
				submitter_email: "ari@example.test",
				submitted_at: 1,
				updated_at: 2,
			},
			{
				id: "submission-b",
				status: "accepted",
				answers_json: JSON.stringify({ title: "Second talk" }),
				submitter_name: "Bea",
				submitter_email: "bea@example.test",
				submitted_at: 3,
				updated_at: 4,
			},
		]);
		mocks.listLabelsForEvent.mockResolvedValue([
			{ submission_id: "submission-a", label: "AI" },
		]);
		mocks.listSpeakersForSubmissions.mockResolvedValue(new Map([
			["submission-a", [{
				name: "Ari",
				email: "ari@example.test",
				position: 0,
				status: "confirmed",
				added_after_acceptance: 0,
			}],
			],
			["submission-b", [{
				name: "Bea",
				email: "bea@example.test",
				position: 0,
				status: "removed",
				added_after_acceptance: 1,
			}],
			],
		]));

		const response = await getSubmissions(
			new Request("https://example.test/api/v1/events/performance-event/submissions", {
				headers: { "x-api-key": "test-key" },
			}),
			{ params: Promise.resolve({ eventSlug: event.slug }) },
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBeNull();
		expect(await response.json()).toMatchObject({
			ok: true,
			event: { id: event.id, slug: event.slug, name: event.name },
			submissions: [{
				id: "submission-a",
				labels: ["AI"],
				speakers: [{ name: "Ari", status: "confirmed" }],
			}, {
				id: "submission-b",
				speakers: [],
			}],
		});
		expect(mocks.listSpeakersForSubmissions).toHaveBeenCalledTimes(1);
		expect(mocks.listSpeakersForSubmissions).toHaveBeenCalledWith(db, ["submission-a", "submission-b"]);
		expect(mocks.listSpeakersForSubmission).not.toHaveBeenCalled();
	});

	it("Given multiple public slots, when the schedule API responds, then it makes one bulk speaker fetch", async () => {
		mocks.listEventRooms.mockResolvedValue([
			{ id: "room-1", name: "Main", position: 0 },
		]);
		mocks.listAgendaTracks.mockResolvedValue([]);
		mocks.listAgendaSlotsWithSubmissions.mockResolvedValue([
			{
				id: "slot-a",
				submission_id: "submission-a",
				submission_status: "published",
				answers_json: JSON.stringify({ title: "First talk" }),
				content_approved: 1,
				room_name: "Main",
				track_id: null,
				starts_at: 1,
				ends_at: 2,
				video_url: null,
				google_doc_url: null,
				supporting_url: null,
			},
			{
				id: "slot-b",
				submission_id: "submission-b",
				submission_status: "published",
				answers_json: JSON.stringify({ title: "Second talk" }),
				content_approved: 1,
				room_name: "Main",
				track_id: null,
				starts_at: 3,
				ends_at: 4,
				video_url: null,
				google_doc_url: null,
				supporting_url: null,
			},
		]);
		mocks.listSpeakersForSubmissions.mockResolvedValue(new Map([
			["submission-a", [{ name: "Ari", email: "ari@example.test", status: "confirmed" }]],
			["submission-b", [{ name: "Bea", email: "bea@example.test", status: "pending" }]],
		]));

		const response = await getSchedule(
			new Request("https://example.test/api/v1/events/performance-event/schedule", {
				headers: { "x-api-key": "test-key" },
			}),
			{ params: Promise.resolve({ eventSlug: event.slug }) },
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBeNull();
		expect(await response.json()).toMatchObject({
			ok: true,
			event: { id: event.id, slug: event.slug, name: event.name, timezone: event.timezone },
			slots: [{
				id: "slot-a",
				speakers: [{ name: "Ari", email: "ari@example.test" }],
			}, {
				id: "slot-b",
				speakers: [],
			}],
		});
		expect(mocks.listSpeakersForSubmissions).toHaveBeenCalledTimes(1);
		expect(mocks.listSpeakersForSubmissions).toHaveBeenCalledWith(db, ["submission-a", "submission-b"]);
		expect(mocks.listSpeakersForSubmission).not.toHaveBeenCalled();
	});
});
