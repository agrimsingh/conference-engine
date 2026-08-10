import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	headersGet: vi.fn(),
	readOrganizerSessionFromCookie: vi.fn(),
	getOrganizerAccount: vi.fn(),
	getAuthSecret: vi.fn(),
	getCloudflareEnv: vi.fn(),
}));

vi.mock("next/headers", () => ({
	headers: async () => ({ get: mocks.headersGet }),
	cookies: async () => ({ get: () => undefined }),
}));

vi.mock("@/lib/auth/organizer-session", () => ({
	readOrganizerSessionFromCookie: mocks.readOrganizerSessionFromCookie,
	getOrganizerAccount: mocks.getOrganizerAccount,
}));

vi.mock("@/lib/db/cloudflare", () => ({
	getAuthSecret: mocks.getAuthSecret,
	getCloudflareEnv: mocks.getCloudflareEnv,
}));

import { authorizeEventAdminApi } from "./admin";
import { createToken, EVENT_API_TOKEN_PREFIX } from "./event-api-tokens";

type Row = Record<string, unknown>;

function createMemoryDb(seed: { events?: Row[] } = {}) {
	const tokens = new Map<string, Row>();
	const events = new Map((seed.events ?? []).map((row) => [String(row.id), row]));
	const bySlug = new Map(
		[...events.values()].map((row) => [String(row.slug), row]),
	);

	return {
		prepare(sql: string) {
			const statement = {
				values: [] as unknown[],
				bind(...values: unknown[]) {
					statement.values = values;
					return statement;
				},
				async first<T>() {
					if (sql.includes("FROM events WHERE slug")) {
						return (bySlug.get(String(statement.values[0])) as T) ?? null;
					}
					if (sql.includes("FROM accounts WHERE id")) return null;
					if (sql.includes("FROM event_api_tokens WHERE token_hash")) {
						const hash = String(statement.values[0]);
						for (const row of tokens.values()) {
							if (row.token_hash === hash) return row as T;
						}
						return null;
					}
					return null;
				},
				async all<T>() {
					return { results: [] as T[] };
				},
				async run() {
					if (sql.includes("INSERT INTO event_api_tokens")) {
						const [
							id,
							eventId,
							name,
							tokenPrefix,
							tokenHash,
							scopesJson,
							createdByAccountId,
							createdAt,
						] = statement.values;
						tokens.set(String(id), {
							id,
							event_id: eventId,
							name,
							token_prefix: tokenPrefix,
							token_hash: tokenHash,
							scopes_json: scopesJson,
							created_by_account_id: createdByAccountId,
							created_at: createdAt,
							last_used_at: null,
							revoked_at: null,
						});
						return { meta: { changes: 1 } };
					}
					if (sql.includes("SET last_used_at")) {
						return { meta: { changes: 1 } };
					}
					return { meta: { changes: 0 } };
				},
			};
			return statement;
		},
	} as unknown as D1Database;
}

describe("authorizeEventAdminApi bearer PAT", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getCloudflareEnv.mockResolvedValue({
			ADMIN_BYPASS_ENABLED: "0",
			NEXTJS_ENV: "production",
		});
		mocks.getAuthSecret.mockResolvedValue("test-auth-secret");
		mocks.readOrganizerSessionFromCookie.mockResolvedValue(null);
		mocks.getOrganizerAccount.mockResolvedValue(null);
		mocks.headersGet.mockReturnValue(null);
	});

	it("accepts Authorization Bearer ce_pat_ after cookie miss", async () => {
		const db = createMemoryDb({
			events: [
				{
					id: "evt_1",
					slug: "aie-sandbox",
					name: "Sandbox",
					timezone: "UTC",
					start_day: null,
					end_day: null,
					mode: "live",
					created_at: 1,
					updated_at: 1,
				},
			],
		});
		const created = await createToken(db, {
			secret: "test-auth-secret",
			eventId: "evt_1",
			name: "Agent",
			token: `${EVENT_API_TOKEN_PREFIX}bearer-path`,
			now: 1,
		});
		mocks.headersGet.mockImplementation((name: string) =>
			name.toLowerCase() === "authorization" ? `Bearer ${created.token}` : null,
		);

		const access = await authorizeEventAdminApi(db, "aie-sandbox");
		expect(access?.event.slug).toBe("aie-sandbox");
		expect(access?.membership?.role).toBe("admin");
	});

	it("rejects missing bearer", async () => {
		const db = createMemoryDb({
			events: [
				{
					id: "evt_1",
					slug: "aie-sandbox",
					name: "Sandbox",
					timezone: "UTC",
					start_day: null,
					end_day: null,
					mode: "live",
					created_at: 1,
					updated_at: 1,
				},
			],
		});
		await expect(authorizeEventAdminApi(db, "aie-sandbox")).resolves.toBeNull();
	});
});
