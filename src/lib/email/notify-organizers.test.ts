import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getSubmissionById: vi.fn(),
	getEventById: vi.fn(),
	listEventMembers: vi.fn(),
	listSpeakersForSubmission: vi.fn(),
	sendTemplatedEmail: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
	getSubmissionById: mocks.getSubmissionById,
	getEventById: mocks.getEventById,
	listEventMembers: mocks.listEventMembers,
	listSpeakersForSubmission: mocks.listSpeakersForSubmission,
}));

vi.mock("./resend", () => ({
	sendTemplatedEmail: mocks.sendTemplatedEmail,
}));

import { notifyOrganizersOfSubmission } from "./notify";

describe("notifyOrganizersOfSubmission", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getSubmissionById.mockResolvedValue({
			id: "sub-1",
			event_id: "evt",
			form_id: "form",
			status: "submitted",
			answers_json: JSON.stringify({ title: "Reliable agents" }),
			submitter_email: "speaker@example.test",
			submitter_name: "Ada",
			created_at: 10,
			updated_at: 99,
		});
		mocks.getEventById.mockResolvedValue({
			id: "evt",
			slug: "evt",
			name: "AI Summit",
			timezone: "UTC",
			mode: "live",
			created_at: 1,
			updated_at: 1,
		});
		mocks.listEventMembers.mockResolvedValue([
			{
				id: "m1",
				event_id: "evt",
				account_id: "a1",
				role: "owner",
				created_at: 1,
				email: "Owner@Example.test",
				name: "Owner",
			},
			{
				id: "m2",
				event_id: "evt",
				account_id: "a2",
				role: "admin",
				created_at: 1,
				email: "admin@example.test",
				name: "Admin",
			},
			{
				id: "m3",
				event_id: "evt",
				account_id: "a3",
				role: "admin",
				created_at: 1,
				email: "owner@example.test",
				name: "Dup Owner",
			},
		]);
		mocks.sendTemplatedEmail.mockImplementation(async (args: { toEmail: string }) => ({
			ok: true,
			status: "sent",
			providerId: `provider-${args.toEmail}`,
			messageId: `msg-${args.toEmail}`,
		}));
	});

	it("sends created mail once per unique organizer email", async () => {
		const results = await notifyOrganizersOfSubmission({} as D1Database, {
			submissionId: "sub-1",
			kind: "created",
		});

		expect(results).toHaveLength(2);
		expect(mocks.sendTemplatedEmail).toHaveBeenCalledTimes(2);
		const payloads = mocks.sendTemplatedEmail.mock.calls.map((call) => call[1]);
		expect(payloads.map((payload) => payload.toEmail).sort()).toEqual([
			"admin@example.test",
			"owner@example.test",
		]);
		for (const payload of payloads) {
			expect(payload).toMatchObject({
				eventId: "evt",
				submissionId: "sub-1",
				templateKey: "submission_received_organizer",
				context: {
					eventName: "AI Summit",
					title: "Reliable agents",
					portalHint: "Submitter: Ada · speaker@example.test.",
				},
			});
			expect(payload.deliveryScope).toBeUndefined();
		}
	});

	it("scopes update deliveries by submission.updated_at", async () => {
		await notifyOrganizersOfSubmission({} as D1Database, {
			submissionId: "sub-1",
			kind: "updated",
		});

		const payloads = mocks.sendTemplatedEmail.mock.calls.map((call) => call[1]);
		expect(payloads).toHaveLength(2);
		expect(payloads.every((payload) => payload.templateKey === "submission_updated_organizer")).toBe(
			true,
		);
		expect(payloads.every((payload) => payload.deliveryScope === "submission-updated:99")).toBe(
			true,
		);
	});

	it("returns nothing when the event has no members", async () => {
		mocks.listEventMembers.mockResolvedValueOnce([]);
		const results = await notifyOrganizersOfSubmission({} as D1Database, {
			submissionId: "sub-1",
			kind: "created",
		});
		expect(results).toEqual([]);
		expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
	});
});
