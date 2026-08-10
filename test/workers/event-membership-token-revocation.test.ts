import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/cloudflare", () => ({
	getAuthSecret: async () => env.AUTH_SECRET,
	getDb: async () => env.DB,
	getCloudflareEnv: async () => env,
}));

import { GET as getSpeakers } from "@/app/api/v1/events/[eventSlug]/speakers/route";
import {
	createToken,
	resolveTokenAccess,
} from "@/lib/auth/event-api-tokens";
import { removeEventMembership } from "@/lib/db/queries";
import { createEventWithDefaults } from "@/lib/events/create-event";

const now = 1_786_200_000_000;

describe("event membership token revocation", () => {
	it("revokes account-bound event tokens when membership is removed", async () => {
		const event = await createEventWithDefaults(
			env.DB,
			{
				name: "Membership token revocation",
				slug: "membership-token-revocation",
				timezone: "UTC",
				startDay: "2026-12-03",
				endDay: "2026-12-03",
			},
			null,
		);
		await env.DB.batch([
			env.DB
				.prepare(
					"INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
				)
				.bind(
					"membership-token-account",
					"membership-token@test.invalid",
					"Removed organizer",
					now,
					now,
				),
			env.DB
				.prepare(
					"INSERT INTO event_memberships (id, event_id, account_id, role, created_at) VALUES (?, ?, ?, 'admin', ?)",
				)
				.bind(
					"membership-token-membership",
					event.eventId,
					"membership-token-account",
					now,
				),
		]);
		const created = await createToken(env.DB, {
			secret: env.AUTH_SECRET,
			eventId: event.eventId,
			name: "Removed organizer token",
			createdByAccountId: "membership-token-account",
			now,
			token: "ce_pat_membership-removal",
		});

		await expect(
			resolveTokenAccess(env.DB, event.slug, created.token, {
				secret: env.AUTH_SECRET,
				now,
			}),
		).resolves.toMatchObject({ event: { id: event.eventId } });

		await expect(
			removeEventMembership(env.DB, {
				eventId: event.eventId,
				accountId: "membership-token-account",
			}),
		).resolves.toBe(true);
		const token = await env.DB
			.prepare("SELECT revoked_at FROM event_api_tokens WHERE id = ?")
			.bind(created.id)
			.first<{ revoked_at: number | null }>();

		expect(token?.revoked_at).toEqual(expect.any(Number));
		await expect(
			resolveTokenAccess(env.DB, event.slug, created.token, {
				secret: env.AUTH_SECRET,
				now: now + 1,
			}),
		).resolves.toBeNull();

		const response = await getSpeakers(
			new Request(
				`https://conference.example.test/api/v1/events/${event.slug}/speakers`,
				{ headers: { authorization: `Bearer ${created.token}` } },
			),
			{ params: Promise.resolve({ eventSlug: event.slug }) },
		);
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			ok: false,
			error: "Unauthorized",
		});
	});
});
