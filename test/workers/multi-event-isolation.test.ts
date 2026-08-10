import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
	listAdminSubmissionsPage,
	listSubmissionsForEvent,
} from "@/lib/db/queries";
import type { AccountRow } from "@/lib/db/types";
import { createEventWithDefaults } from "@/lib/events/create-event";
import { createSession } from "@/lib/sessions/session";
import { listEventSpeakerRoster } from "@/lib/speakers/roster";
import {
	FORWARD_SUMMIT_2028,
	createForwardSummit2028,
} from "@/lib/events/forward-summit-2028";

const now = 1_787_100_000_000;

describe("CFP-17/18 multi-event isolation", () => {
	it("creates Forward Summit 2028 beside a populated event with empty scoped lists", async () => {
		const owner: AccountRow = {
			id: "multi-event-owner",
			email: "multi-event-owner@test.invalid",
			name: "Multi Event Owner",
			created_at: now,
			updated_at: now,
		};
		await env.DB.prepare(
			"INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		)
			.bind(owner.id, owner.email, owner.name, now, now)
			.run();

		const first = await createEventWithDefaults(
			env.DB,
			{
				name: "DevFlow Conf 2027",
				slug: "devflow-conf-2027",
				timezone: "America/Los_Angeles",
				startDay: "2027-05-12",
				endDay: "2027-05-14",
			},
			owner,
		);

		const cfpForm = await env.DB.prepare(
			"SELECT id FROM cfp_forms WHERE event_id = ? AND slug = 'cfp'",
		)
			.bind(first.eventId)
			.first<{ id: string }>();
		expect(cfpForm).toBeTruthy();

		await env.DB.batch([
			env.DB.prepare(
				`INSERT INTO people (id, email, name, created_at)
				 VALUES ('multi-event-person', 'speaker@devflow.test', 'DevFlow Speaker', ?)`,
			).bind(now),
			env.DB.prepare(
				`INSERT INTO submissions (
					id, form_id, event_id, status, answers_json, submitter_email, submitter_name,
					submitter_person_id, origin, created_at, updated_at, submitted_at
				) VALUES (
					'multi-event-submission', ?, ?, 'submitted', ?,
					'speaker@devflow.test', 'DevFlow Speaker', 'multi-event-person', 'cfp', ?, ?, ?
				)`,
			).bind(
				cfpForm!.id,
				first.eventId,
				JSON.stringify({ title: "Scoped talk", abstract: "Stays in event one" }),
				now,
				now,
				now,
			),
			env.DB.prepare(
				`INSERT INTO submission_speakers (
					id, submission_id, person_id, name, email, bio, position, status
				) VALUES (
					'multi-event-speaker', 'multi-event-submission', 'multi-event-person',
					'DevFlow Speaker', 'speaker@devflow.test', NULL, 0, 'confirmed'
				)`,
			),
		]);

		const session = await createSession(env.DB, {
			eventId: first.eventId,
			origin: "manual",
			input: {
				title: "Booked session",
				speakers: [
					{
						name: "DevFlow Speaker",
						email: "speaker@devflow.test",
					},
				],
			},
		});
		expect(session.id).toBeTruthy();

		const second = await createForwardSummit2028(env.DB, owner);
		expect(second.slug).toBe(FORWARD_SUMMIT_2028.slug);

		const owned = await env.DB.prepare(
			`SELECT e.name, e.slug
			 FROM events e
			 INNER JOIN event_memberships m ON m.event_id = e.id
			 WHERE m.account_id = ?
			 ORDER BY e.name ASC`,
		)
			.bind(owner.id)
			.all<{ name: string; slug: string }>();
		expect(owned.results).toEqual([
			{ name: "DevFlow Conf 2027", slug: "devflow-conf-2027" },
			{ name: FORWARD_SUMMIT_2028.name, slug: FORWARD_SUMMIT_2028.slug },
		]);

		const firstSubmissions = await listSubmissionsForEvent(env.DB, first.eventId);
		const secondSubmissions = await listSubmissionsForEvent(env.DB, second.eventId);
		expect(firstSubmissions.map((row) => row.id).sort()).toEqual(
			["multi-event-submission", session.id].sort(),
		);
		expect(secondSubmissions).toEqual([]);

		const firstPage = await listAdminSubmissionsPage(env.DB, first.eventId, {
			category: "all",
			label: "all",
			status: "all",
			query: "",
			sort: "newest",
			page: 1,
			pageSize: 25,
			queue: "all",
		});
		const secondPage = await listAdminSubmissionsPage(env.DB, second.eventId, {
			category: "all",
			label: "all",
			status: "all",
			query: "",
			sort: "newest",
			page: 1,
			pageSize: 25,
			queue: "all",
		});
		expect(firstPage.total).toBeGreaterThanOrEqual(2);
		expect(secondPage.total).toBe(0);
		expect(secondPage.rows).toEqual([]);

		const firstSessions = firstSubmissions.filter(
			(row) => row.origin && row.origin !== "cfp",
		);
		const secondSessions = secondSubmissions.filter(
			(row) => row.origin && row.origin !== "cfp",
		);
		expect(firstSessions.map((row) => row.id)).toContain(session.id);
		expect(secondSessions).toEqual([]);

		const firstSpeakers = await listEventSpeakerRoster(env.DB, first.eventId);
		const secondSpeakers = await listEventSpeakerRoster(env.DB, second.eventId);
		expect(firstSpeakers.some((speaker) => speaker.email === "speaker@devflow.test")).toBe(
			true,
		);
		expect(secondSpeakers).toEqual([]);
	});
});
