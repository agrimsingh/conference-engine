import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

const notifyMocks = vi.hoisted(() => ({
	notifyCalendarCancellation: vi.fn(async () => ({
		email: { ok: true, status: "sent", providerId: "mock", messageId: "mock-cancel" },
		emails: [{ ok: true, status: "sent", providerId: "mock", messageId: "mock-cancel" }],
		icsBytes: "BEGIN:VCALENDAR\r\nMETHOD:CANCEL\r\nEND:VCALENDAR",
	})),
	notifyCalendarInvite: vi.fn(async () => ({
		email: null,
		emails: [],
		icsBytes: "",
	})),
	notifySubmissionLifecycle: vi.fn(async () => ({
		ok: true,
		status: "sent",
		providerId: "mock",
		messageId: "mock-msg",
	})),
	notifyConfirmedSpeakerLifecycle: vi.fn(async () => [
		{ ok: true, status: "sent", providerId: "mock", messageId: "mock-msg" },
	]),
}));

const authMocks = vi.hoisted(() => ({
	authorizeWritableEventAdminApi: vi.fn(),
}));

vi.mock("@/lib/db/cloudflare", () => ({
	getDb: async () => env.DB,
	getCloudflareEnv: async () => env,
}));

vi.mock("@/lib/email/notify", () => notifyMocks);

vi.mock("@/lib/auth/admin", () => ({
	authorizeWritableEventAdminApi: authMocks.authorizeWritableEventAdminApi,
}));

import { withdrawSubmission } from "@/lib/speakers/withdraw";
import { restoreWithdrawnSubmission } from "@/lib/speakers/restore-withdrawn";
import { POST as restorePost } from "@/app/api/admin/events/[eventSlug]/submissions/[submissionId]/restore/route";

const now = 1_780_800_000_000;
const start = Date.parse("2026-05-29T10:00:00Z");

describe("withdraw placed submission", () => {
	it("unplaces via EventRoom, cancels calendar, and lands in withdrawn", async () => {
		await env.DB.batch([
			env.DB.prepare(
				`INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at)
         VALUES ('wd-event', 'wd-event', 'Withdraw Event', 'UTC', 'live', ?, ?)`,
			).bind(now, now),
			env.DB.prepare(
				`INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at)
         VALUES ('wd-form', 'wd-event', 'cfp', 'CFP', 'open', ?, ?)`,
			).bind(now, now),
			env.DB.prepare(
				`INSERT INTO people (id, email, name, created_at)
         VALUES ('wd-person', 'speaker@wd.test', 'WD Speaker', ?)`,
			).bind(now),
			env.DB.prepare(
				`INSERT INTO submissions (
           id, form_id, event_id, status, submitter_email, submitter_name,
           submitter_person_id, answers_json, created_at, updated_at
         ) VALUES (
           'wd-sub', 'wd-form', 'wd-event', 'accepted',
           'speaker@wd.test', 'WD Speaker', 'wd-person',
           '{"title":"Placed talk"}', ?, ?
         )`,
			).bind(now, now),
			env.DB.prepare(
				`INSERT INTO event_rooms (id, event_id, name, position, created_at, updated_at)
         VALUES ('wd-room', 'wd-event', 'Main', 0, ?, ?)`,
			).bind(now, now),
		]);

		const room = env.EVENT_ROOM.getByName("wd-event");
		const placed = await room.fetch("https://event-room/schedule", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-ce-event-id": "wd-event",
			},
			body: JSON.stringify({
				submissionId: "wd-sub",
				roomName: "Main",
				startsAtMs: start,
				endsAtMs: start + 1_800_000,
			}),
		});
		expect(placed.status).toBe(200);
		expect(
			(
				await env.DB.prepare("SELECT status FROM submissions WHERE id = 'wd-sub'").first<{
					status: string;
				}>()
			)?.status,
		).toBe("scheduled");

		notifyMocks.notifyCalendarCancellation.mockClear();
		const withdrawn = await withdrawSubmission(env.DB, {
			submissionId: "wd-sub",
			personId: "wd-person",
		});
		expect(withdrawn).toEqual({
			ok: true,
			submissionId: "wd-sub",
			status: "withdrawn",
		});
		expect(
			(
				await env.DB.prepare("SELECT status FROM submissions WHERE id = 'wd-sub'").first<{
					status: string;
				}>()
			)?.status,
		).toBe("withdrawn");
		expect(
			(
				await env.DB.prepare(
					"SELECT COUNT(*) AS count FROM agenda_slots WHERE submission_id = 'wd-sub'",
				).first<{ count: number }>()
			)?.count,
		).toBe(0);
		expect(
			(
				await env.DB.prepare(
					"SELECT sequence FROM agenda_calendar_lifecycles WHERE submission_id = 'wd-sub'",
				).first<{ sequence: number }>()
			)?.sequence,
		).toBeGreaterThan(0);
		expect(notifyMocks.notifyCalendarCancellation).toHaveBeenCalledTimes(1);
		const cancelCall = notifyMocks.notifyCalendarCancellation.mock.calls.at(0) as
			| [unknown, { submissionId: string; roomName: string; icsUid: string; sequence: number }]
			| undefined;
		expect(cancelCall?.[1]).toMatchObject({
			submissionId: "wd-sub",
			roomName: "Main",
			icsUid: expect.any(String),
			sequence: expect.any(Number),
		});
	});

	it("restores withdrawn to under_review for organizers only", async () => {
		await env.DB.batch([
			env.DB.prepare(
				`INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at)
         VALUES ('wd-restore-event', 'wd-restore-event', 'Restore Event', 'UTC', 'live', ?, ?)`,
			).bind(now, now),
			env.DB.prepare(
				`INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at)
         VALUES ('wd-restore-form', 'wd-restore-event', 'cfp', 'CFP', 'open', ?, ?)`,
			).bind(now, now),
			env.DB.prepare(
				`INSERT INTO people (id, email, name, created_at)
         VALUES ('wd-restore-person', 'speaker@restore.test', 'Restore Speaker', ?)`,
			).bind(now),
			env.DB.prepare(
				`INSERT INTO submissions (
           id, form_id, event_id, status, submitter_email, submitter_name,
           submitter_person_id, answers_json, created_at, updated_at
         ) VALUES (
           'wd-restore-sub', 'wd-restore-form', 'wd-restore-event', 'withdrawn',
           'speaker@restore.test', 'Restore Speaker', 'wd-restore-person',
           '{"title":"Restore me"}', ?, ?
         )`,
			).bind(now, now),
		]);

		const speakerNoop = await withdrawSubmission(env.DB, {
			submissionId: "wd-restore-sub",
			personId: "wd-restore-person",
		});
		expect(speakerNoop).toEqual({
			ok: true,
			submissionId: "wd-restore-sub",
			status: "withdrawn",
		});
		expect(
			(
				await env.DB.prepare(
					"SELECT status FROM submissions WHERE id = 'wd-restore-sub'",
				).first<{ status: string }>()
			)?.status,
		).toBe("withdrawn");

		authMocks.authorizeWritableEventAdminApi.mockResolvedValueOnce({
			ok: false,
			response: Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
		});
		const denied = await restorePost(
			new Request("https://example.test/restore", { method: "POST" }),
			{
				params: Promise.resolve({
					eventSlug: "wd-restore-event",
					submissionId: "wd-restore-sub",
				}),
			},
		);
		expect(denied.status).toBe(401);

		const restored = await restoreWithdrawnSubmission(env.DB, {
			submissionId: "wd-restore-sub",
			eventId: "wd-restore-event",
		});
		expect(restored).toEqual({
			ok: true,
			submissionId: "wd-restore-sub",
			status: "under_review",
		});

		await env.DB
			.prepare("UPDATE submissions SET status = 'withdrawn', updated_at = ? WHERE id = ?")
			.bind(now, "wd-restore-sub")
			.run();

		authMocks.authorizeWritableEventAdminApi.mockResolvedValueOnce({
			ok: true,
			access: {
				event: {
					id: "wd-restore-event",
					slug: "wd-restore-event",
					name: "Restore Event",
					timezone: "UTC",
					mode: "live",
				},
				account: null,
				membership: null,
			},
		});
		const allowed = await restorePost(
			new Request("https://example.test/restore", { method: "POST" }),
			{
				params: Promise.resolve({
					eventSlug: "wd-restore-event",
					submissionId: "wd-restore-sub",
				}),
			},
		);
		expect(allowed.status).toBe(200);
		expect(await allowed.json()).toMatchObject({
			ok: true,
			status: "under_review",
			submissionId: "wd-restore-sub",
		});
	});
});
