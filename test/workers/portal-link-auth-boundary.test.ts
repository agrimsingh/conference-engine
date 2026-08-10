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
	getAuthSecret: async () => "portal-link-secret",
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
import { POST as mintPortalLinkRoute } from "@/app/api/admin/events/[eventSlug]/speakers/[personId]/portal-link/route";

const now = 1_780_600_000_000;
const eventId = "portal-link-event";
const eventSlug = "portal-link";
const otherEventId = "portal-link-other-event";
const otherEventSlug = "portal-link-other";
const accountId = "portal-link-account";
const personId = "portal-link-person";

function routeContext(person = personId, slug = eventSlug) {
	return { params: Promise.resolve({ eventSlug: slug, personId: person }) };
}

describe("portal-link mint is session-only", () => {
	beforeEach(async () => {
		state.authorization = null;
		state.cookies.clear();
		state.kv.clear();
		await env.DB.batch([
			env.DB.prepare("DELETE FROM auth_challenges"),
			env.DB.prepare("DELETE FROM event_speaker_profiles WHERE event_id IN (?, ?)").bind(eventId, otherEventId),
			env.DB.prepare("DELETE FROM people WHERE id = ?").bind(personId),
			env.DB.prepare("DELETE FROM event_api_tokens WHERE event_id IN (?, ?)").bind(eventId, otherEventId),
			env.DB.prepare("DELETE FROM event_memberships WHERE event_id IN (?, ?)").bind(eventId, otherEventId),
			env.DB.prepare("DELETE FROM accounts WHERE id = ?").bind(accountId),
			env.DB.prepare("DELETE FROM events WHERE id IN (?, ?)").bind(eventId, otherEventId),
		]);
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES (?, ?, ?, 'UTC', 'live', ?, ?)",
			).bind(eventId, eventSlug, "Portal link", now, now),
			env.DB.prepare(
				"INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES (?, ?, ?, 'UTC', 'live', ?, ?)",
			).bind(otherEventId, otherEventSlug, "Other", now, now),
			env.DB.prepare(
				"INSERT INTO people (id, email, name, created_at) VALUES (?, 'speaker@example.test', 'Speaker', ?)",
			).bind(personId, now),
			env.DB.prepare(
				`INSERT INTO event_speaker_profiles (
					id, event_id, person_id, job_title, company, social_json, workflow_status, created_at, updated_at
				) VALUES ('esp-portal-link', ?, ?, NULL, NULL, NULL, 'invited', ?, ?)`,
			).bind(eventId, personId, now, now),
		]);
	});

	it("rejects a valid Bearer PAT even when it can authorize other admin writes", async () => {
		const pat = await createToken(env.DB, {
			secret: "portal-link-secret",
			eventId,
			name: "Leaked agent",
			now,
		});
		state.authorization = `Bearer ${pat.token}`;

		const general = await authorizeWritableEventAdminApi(env.DB, eventSlug);
		expect(general.ok).toBe(true);

		const response = await mintPortalLinkRoute(
			new Request(
				`https://conference.example.test/api/admin/events/${eventSlug}/speakers/${personId}/portal-link`,
				{ method: "POST" },
			),
			routeContext(),
		);
		expect(response.status).toBe(401);
		const body = (await response.json()) as { error: string };
		expect(body.error).toContain("Organizer session required");

		const challenges = await env.DB.prepare(
			"SELECT COUNT(*) AS total FROM auth_challenges WHERE person_id = ?",
		)
			.bind(personId)
			.first<{ total: number }>();
		expect(challenges?.total).toBe(0);
	});

	it("mints a portal authorize URL for a cookie session with membership", async () => {
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, 'org@example.test', 'Org', ?, ?)",
			).bind(accountId, now, now),
			env.DB.prepare(
				"INSERT INTO event_memberships (id, event_id, account_id, role, created_at) VALUES ('portal-link-membership', ?, ?, 'admin', ?)",
			).bind(eventId, accountId, now),
		]);
		state.kv.set(
			"organizer_session:portal-link-session",
			JSON.stringify({ accountId, email: "org@example.test", createdAt: now }),
		);
		state.cookies.set(ORGANIZER_SESSION_COOKIE, "portal-link-session");

		const response = await mintPortalLinkRoute(
			new Request(
				`https://conference.example.test/api/admin/events/${eventSlug}/speakers/${personId}/portal-link`,
				{ method: "POST" },
			),
			routeContext(),
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			ok: boolean;
			portalUrl: string;
			expiresAt: number;
		};
		expect(body.ok).toBe(true);
		expect(body.portalUrl).toMatch(
			/^https:\/\/conference\.example\.test\/portal\/authorize\?token=[A-Za-z0-9_-]+$/,
		);
		expect(body.expiresAt).toBeGreaterThan(Date.now());

		const challenge = await env.DB.prepare(
			"SELECT kind, person_id, event_id, state FROM auth_challenges WHERE person_id = ?",
		)
			.bind(personId)
			.first<{ kind: string; person_id: string; event_id: string; state: string }>();
		expect(challenge).toEqual({
			kind: "portal_login",
			person_id: personId,
			event_id: eventId,
			state: "active",
		});
	});

	it("does not mint a link for a speaker outside the authorized event", async () => {
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, 'org@example.test', 'Org', ?, ?)",
			).bind(accountId, now, now),
			env.DB.prepare(
				"INSERT INTO event_memberships (id, event_id, account_id, role, created_at) VALUES ('portal-link-other-membership', ?, ?, 'admin', ?)",
			).bind(otherEventId, accountId, now),
		]);
		state.kv.set(
			"organizer_session:portal-link-session",
			JSON.stringify({ accountId, email: "org@example.test", createdAt: now }),
		);
		state.cookies.set(ORGANIZER_SESSION_COOKIE, "portal-link-session");

		const response = await mintPortalLinkRoute(
			new Request(
				`https://conference.example.test/api/admin/events/${otherEventSlug}/speakers/${personId}/portal-link`,
				{ method: "POST" },
			),
			routeContext(personId, otherEventSlug),
		);
		expect(response.status).toBe(404);
		const challenges = await env.DB.prepare(
			"SELECT COUNT(*) AS total FROM auth_challenges WHERE person_id = ?",
		)
			.bind(personId)
			.first<{ total: number }>();
		expect(challenges?.total).toBe(0);
	});
});
