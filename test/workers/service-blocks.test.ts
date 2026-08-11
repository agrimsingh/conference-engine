import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { createEventWithDefaults } from "@/lib/events/create-event";
import type { AccountRow } from "@/lib/db/types";
import {
	assertCanPublishAgendaVisibility,
	createServiceBlock,
	deleteServiceBlock,
	listServiceBlocks,
} from "@/lib/sessions/service-blocks";
import { isPublicAgendaVisibility } from "@/lib/domain";

const mocks = vi.hoisted(() => ({
	authorizeWritableEventAdminApi: vi.fn(),
	broadcastEventInvalidate: vi.fn(),
}));

vi.mock("@/lib/db/cloudflare", () => ({ getDb: async () => env.DB }));
vi.mock("@/lib/auth/admin", () => ({ authorizeWritableEventAdminApi: mocks.authorizeWritableEventAdminApi }));
vi.mock("@/lib/realtime/event-room", () => ({ broadcastEventInvalidate: mocks.broadcastEventInvalidate }));

import { POST as createServiceBlockRoute, DELETE as deleteServiceBlockRoute } from "@/app/api/admin/events/[eventSlug]/service-blocks/route";

const now = 1_781_100_000_000;
let sequence = 0;

async function event(label: string) {
	sequence += 1;
	const owner: AccountRow = {
		id: `service-owner-${sequence}`,
		email: `service-owner-${sequence}@test.invalid`,
		name: "Owner",
		created_at: now,
		updated_at: now,
	};
	await env.DB
		.prepare("INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
		.bind(owner.id, owner.email, owner.name, now, now)
		.run();
	return createEventWithDefaults(
		env.DB,
		{ name: label, slug: `service-${sequence}`, timezone: "UTC", startDay: "2026-11-01", endDay: "2026-11-02" },
		owner,
	);
}

function eventContext(eventSlug: string) {
	return { params: Promise.resolve({ eventSlug }) };
}

function jsonRequest(url: string, body: Record<string, unknown>, method = "POST"): Request {
	return new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("service blocks", () => {
	it("creates accepted service rows without speakers and lists them", async () => {
		const created = await event("Lunch blocks");
		const lunch = await createServiceBlock(env.DB, {
			eventId: created.eventId,
			input: { title: "Lunch", durationMinutes: 60, agendaVisibility: "public" },
		});
		const row = await env.DB
			.prepare("SELECT status, origin, item_kind, agenda_visibility, answers_json FROM submissions WHERE id = ?")
			.bind(lunch.id)
			.first<{
				status: string;
				origin: string;
				item_kind: string;
				agenda_visibility: string;
				answers_json: string;
			}>();
		expect(row).toMatchObject({
			status: "accepted",
			origin: "manual",
			item_kind: "service",
			agenda_visibility: "public",
		});
		expect(JSON.parse(row!.answers_json)).toMatchObject({ title: "Lunch", duration_minutes: 60 });
		expect(
			await env.DB.prepare("SELECT COUNT(*) AS count FROM submission_speakers WHERE submission_id = ?").bind(lunch.id).first(),
		).toEqual({ count: 0 });
		expect((await listServiceBlocks(env.DB, created.eventId)).map((block) => block.id)).toEqual([lunch.id]);
	});

	it("deletes unplaced service blocks and refuses placed ones", async () => {
		const created = await event("Delete blocks");
		const block = await createServiceBlock(env.DB, {
			eventId: created.eventId,
			input: { title: "Break", durationMinutes: 15, agendaVisibility: "private" },
		});
		expect(await deleteServiceBlock(env.DB, { eventId: created.eventId, submissionId: block.id })).toEqual({ ok: true });
		expect(await env.DB.prepare("SELECT id FROM submissions WHERE id = ?").bind(block.id).first()).toBeNull();

		const placed = await createServiceBlock(env.DB, {
			eventId: created.eventId,
			input: { title: "Registration", durationMinutes: 30, agendaVisibility: "public" },
		});
		await env.DB
			.prepare(
				`INSERT INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at)
         VALUES (?, ?, ?, 'Main Stage', ?, ?, ?, ?, ?)`,
			)
			.bind(`slot-${placed.id}`, created.eventId, placed.id, now, now + 30 * 60_000, `uid-${placed.id}`, now, now)
			.run();
		await env.DB.prepare("UPDATE submissions SET status = 'scheduled', updated_at = ? WHERE id = ?").bind(now, placed.id).run();
		const refused = await deleteServiceBlock(env.DB, { eventId: created.eventId, submissionId: placed.id });
		expect(refused).toMatchObject({ ok: false, status: 409 });
	});

	it("keeps private blocks out of public filters and refuses publish", async () => {
		expect(isPublicAgendaVisibility("private")).toBe(false);
		expect(assertCanPublishAgendaVisibility("private")).toMatchObject({ ok: false });
		const created = await event("Private publish");
		const block = await createServiceBlock(env.DB, {
			eventId: created.eventId,
			input: { title: "Staff lunch", durationMinutes: 45, agendaVisibility: "private" },
		});
		await env.DB
			.prepare(
				`INSERT INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at)
         VALUES (?, ?, ?, 'Main Stage', ?, ?, ?, ?, ?)`,
			)
			.bind(`slot-${block.id}`, created.eventId, block.id, now, now + 45 * 60_000, `uid-${block.id}`, now, now)
			.run();
		await env.DB.prepare("UPDATE submissions SET status = 'scheduled', updated_at = ? WHERE id = ?").bind(now, block.id).run();
		const room = env.EVENT_ROOM.getByName(created.eventId);
		const response = await room.fetch("https://event-room/schedule", {
			method: "PATCH",
			headers: { "content-type": "application/json", "x-ce-event-id": created.eventId },
			body: JSON.stringify({ submissionId: block.id, action: "publish", approveContent: true }),
		});
		expect(response.status).toBe(409);
		const body = (await response.json()) as { ok?: boolean; error?: string };
		expect(body.ok).toBe(false);
		expect(body.error).toMatch(/Private service blocks/i);
		expect(await env.DB.prepare("SELECT status FROM submissions WHERE id = ?").bind(block.id).first()).toEqual({
			status: "scheduled",
		});
	});

	it("admin route creates and deletes through cookie-session auth gate", async () => {
		const created = await event("Route blocks");
		const access = {
			ok: true as const,
			access: {
				event: {
					id: created.eventId,
					slug: created.slug,
					name: "Route blocks",
					timezone: "UTC",
					mode: "live" as const,
					created_at: now,
					updated_at: now,
				},
				account: null,
				membership: null,
			},
		};
		mocks.authorizeWritableEventAdminApi.mockReset();
		mocks.authorizeWritableEventAdminApi.mockResolvedValue(access);
		mocks.broadcastEventInvalidate.mockReset();
		mocks.broadcastEventInvalidate.mockResolvedValue(true);

		const createdResponse = await createServiceBlockRoute(
			jsonRequest(`https://conference.example.test/api/admin/events/${created.slug}/service-blocks`, {
				title: "Coffee",
				durationMinutes: 15,
				agendaVisibility: "public",
			}),
			eventContext(created.slug),
		);
		expect(createdResponse.status).toBe(200);
		const createdBody = (await createdResponse.json()) as { ok?: boolean; submissionId?: string };
		expect(createdBody.ok).toBe(true);
		expect(createdBody.submissionId).toEqual(expect.any(String));

		const deletedResponse = await deleteServiceBlockRoute(
			jsonRequest(
				`https://conference.example.test/api/admin/events/${created.slug}/service-blocks`,
				{ submissionId: createdBody.submissionId },
				"DELETE",
			),
			eventContext(created.slug),
		);
		expect(deletedResponse.status).toBe(200);
		expect(await env.DB.prepare("SELECT id FROM submissions WHERE id = ?").bind(createdBody.submissionId!).first()).toBeNull();
	});
});
