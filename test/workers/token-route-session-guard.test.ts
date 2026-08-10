import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	authorization: null as string | null,
	cookies: new Map<string, string>(),
	kv: new Map<string, string>(),
}));

vi.mock("next/navigation", () => ({
	redirect: (url: string) => {
		throw new Error(`unexpected redirect to ${url}`);
	},
	notFound: () => {
		throw new Error("unexpected notFound");
	},
}));

vi.mock("next/headers", () => ({
	headers: async () =>
		new Headers(state.authorization ? { authorization: state.authorization } : {}),
	cookies: async () => ({
		get: (name: string) => {
			const value = state.cookies.get(name);
			return value === undefined ? undefined : { name, value };
		},
	}),
}));

vi.mock("@/lib/db/cloudflare", () => ({
	getDb: async () => env.DB,
	getAuthSecret: async () => "token-guard-secret",
	getCloudflareEnv: async () => ({}),
	getSessionsKv: async () => ({
		get: async (key: string) => state.kv.get(key) ?? null,
		put: async (key: string, value: string) => {
			state.kv.set(key, value);
		},
		delete: async (key: string) => {
			state.kv.delete(key);
		},
	}),
}));

import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { createToken } from "@/lib/auth/event-api-tokens";
import { ORGANIZER_SESSION_COOKIE } from "@/lib/auth/organizer-session";
import {
	DELETE as revokeTokenBodyRoute,
	GET as listTokensRoute,
	POST as mintTokenRoute,
} from "@/app/api/admin/events/[eventSlug]/tokens/route";
import { DELETE as revokeTokenByIdRoute } from "@/app/api/admin/events/[eventSlug]/tokens/[tokenId]/route";

const now = 1_780_500_000_000;
const eventId = "token-guard-event";
const eventSlug = "token-guard";
const accountId = "token-guard-account";

function routeContext(): { params: Promise<{ eventSlug: string }> } {
	return { params: Promise.resolve({ eventSlug }) };
}

function jsonRequest(method: string, body: Record<string, unknown>): Request {
	return new Request(`https://conference.example.test/api/admin/events/${eventSlug}/tokens`, {
		method,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

async function mintPat(name: string): Promise<{ id: string; token: string }> {
	const created = await createToken(env.DB, {
		secret: "token-guard-secret",
		eventId,
		name,
		now,
	});
	return { id: created.id, token: created.token };
}

describe("token routes reject Bearer PATs", () => {
	beforeEach(async () => {
		state.authorization = null;
		state.cookies.clear();
		state.kv.clear();
		await env.DB.batch([
			env.DB.prepare("DELETE FROM event_api_tokens WHERE event_id = ?").bind(eventId),
			env.DB.prepare("DELETE FROM event_memberships WHERE event_id = ?").bind(eventId),
			env.DB.prepare("DELETE FROM accounts WHERE id = ?").bind(accountId),
			env.DB.prepare("DELETE FROM events WHERE id = ?").bind(eventId),
		]);
		await env.DB.prepare(
			"INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES (?, ?, ?, 'UTC', 'live', ?, ?)",
		)
			.bind(eventId, eventSlug, "Token guard", now, now)
			.run();
	});

	it("a valid PAT authorizes normal admin writes but cannot list, mint, or revoke tokens", async () => {
		const pat = await mintPat("Leaked agent token");
		state.authorization = `Bearer ${pat.token}`;

		// Sanity: the same credential works on the general admin path.
		const general = await authorizeWritableEventAdminApi(env.DB, eventSlug);
		expect(general.ok).toBe(true);

		const listResponse = await listTokensRoute(
			new Request(`https://conference.example.test/api/admin/events/${eventSlug}/tokens`),
			routeContext(),
		);
		expect(listResponse.status).toBe(401);

		const mintResponse = await mintTokenRoute(
			jsonRequest("POST", { name: "successor" }),
			routeContext(),
		);
		expect(mintResponse.status).toBe(401);
		const mintBody = (await mintResponse.json()) as { error: string };
		expect(mintBody.error).toContain("Organizer session required");

		const revokeResponse = await revokeTokenBodyRoute(
			jsonRequest("DELETE", { tokenId: pat.id }),
			routeContext(),
		);
		expect(revokeResponse.status).toBe(401);

		const revokeByIdResponse = await revokeTokenByIdRoute(
			new Request(
				`https://conference.example.test/api/admin/events/${eventSlug}/tokens/${pat.id}`,
				{ method: "DELETE" },
			),
			{ params: Promise.resolve({ eventSlug, tokenId: pat.id }) },
		);
		expect(revokeByIdResponse.status).toBe(401);

		// Nothing was minted or revoked by the PAT.
		const rows = await env.DB.prepare(
			"SELECT COUNT(*) AS total, SUM(CASE WHEN revoked_at IS NOT NULL THEN 1 ELSE 0 END) AS revoked FROM event_api_tokens WHERE event_id = ?",
		)
			.bind(eventId)
			.first<{ total: number; revoked: number }>();
		expect(rows).toEqual({ total: 1, revoked: 0 });
	});

	it("a cookie session with membership can still mint and revoke tokens", async () => {
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, 'guard@example.test', 'Guard', ?, ?)",
			).bind(accountId, now, now),
			env.DB.prepare(
				"INSERT INTO event_memberships (id, event_id, account_id, role, created_at) VALUES ('token-guard-membership', ?, ?, 'admin', ?)",
			).bind(eventId, accountId, now),
		]);
		state.kv.set(
			"organizer_session:guard-session-token",
			JSON.stringify({ accountId, email: "guard@example.test", createdAt: now }),
		);
		state.cookies.set(ORGANIZER_SESSION_COOKIE, "guard-session-token");

		const mintResponse = await mintTokenRoute(
			jsonRequest("POST", { name: "Session-minted" }),
			routeContext(),
		);
		expect(mintResponse.status).toBe(200);
		const mintBody = (await mintResponse.json()) as {
			ok: boolean;
			token: { id: string; token: string };
		};
		expect(mintBody.ok).toBe(true);
		expect(mintBody.token.token).toMatch(/^ce_pat_/);

		const revokeResponse = await revokeTokenByIdRoute(
			new Request(
				`https://conference.example.test/api/admin/events/${eventSlug}/tokens/${mintBody.token.id}`,
				{ method: "DELETE" },
			),
			{ params: Promise.resolve({ eventSlug, tokenId: mintBody.token.id }) },
		);
		expect(revokeResponse.status).toBe(200);
	});
});
