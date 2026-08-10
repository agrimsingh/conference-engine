import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createToken,
	EVENT_API_TOKEN_PREFIX,
	listTokens,
	resolveTokenAccess,
	revokeToken,
} from "@/lib/auth/event-api-tokens";

const now = 1_780_400_000_000;
const eventId = "pat-d1-event";
const eventSlug = "pat-d1";

describe("event api tokens on D1", () => {
	beforeEach(async () => {
		await env.DB.batch([
			env.DB.prepare("DELETE FROM event_api_tokens WHERE event_id = ?").bind(eventId),
			env.DB.prepare("DELETE FROM events WHERE id = ?").bind(eventId),
		]);
		await env.DB.prepare(
			"INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES (?, ?, ?, 'UTC', 'live', ?, ?)",
		)
			.bind(eventId, eventSlug, "PAT D1", now, now)
			.run();
	});

	it("mints hash-only rows and resolves/revokes against local D1", async () => {
		const created = await createToken(env.DB, {
			secret: env.AUTH_SECRET,
			eventId,
			name: "Worker agent",
			now,
			token: `${EVENT_API_TOKEN_PREFIX}d1-proof-secret`,
		});

		const stored = await env.DB.prepare(
			"SELECT token_hash, token_prefix, revoked_at FROM event_api_tokens WHERE id = ?",
		)
			.bind(created.id)
			.first<{ token_hash: string; token_prefix: string; revoked_at: number | null }>();
		expect(stored?.token_prefix).toBe(created.prefix);
		expect(stored?.token_hash).not.toBe(created.token);
		expect(stored?.revoked_at).toBeNull();

		const listed = await listTokens(env.DB, eventId);
		expect(listed).toHaveLength(1);
		expect(listed[0]).not.toHaveProperty("token");

		const access = await resolveTokenAccess(env.DB, eventSlug, created.token, {
			secret: env.AUTH_SECRET,
			now: now + 1,
		});
		expect(access?.event.id).toBe(eventId);
		expect(access?.membership?.role).toBe("admin");

		const touched = await env.DB.prepare(
			"SELECT last_used_at FROM event_api_tokens WHERE id = ?",
		)
			.bind(created.id)
			.first<{ last_used_at: number | null }>();
		expect(touched?.last_used_at).toBe(now + 1);

		await expect(
			revokeToken(env.DB, { eventId, tokenId: created.id, now: now + 2 }),
		).resolves.toBe(true);
		await expect(
			resolveTokenAccess(env.DB, eventSlug, created.token, {
				secret: env.AUTH_SECRET,
				now: now + 3,
			}),
		).resolves.toBeNull();
	});
});
