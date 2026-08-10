import { beforeEach, describe, expect, it } from "vitest";
import { hmacHash } from "@/lib/security/crypto";
import {
	createToken,
	EVENT_API_TOKEN_PREFIX,
	hashEventApiToken,
	listTokens,
	readBearerToken,
	resolveTokenAccess,
	revokeToken,
	tokenGrantsFullEventAdmin,
} from "./event-api-tokens";

type Row = Record<string, unknown>;

function createMemoryDb(
	seed: { events?: Row[]; accounts?: Row[]; memberships?: Row[] } = {},
) {
	const tokens = new Map<string, Row>();
	const events = new Map((seed.events ?? []).map((row) => [String(row.id), row]));
	const accounts = new Map((seed.accounts ?? []).map((row) => [String(row.id), row]));
	const memberships = new Map(
		(seed.memberships ?? []).map((row) => [
			`${String(row.event_id)}:${String(row.account_id)}`,
			row,
		]),
	);
	const bySlug = new Map(
		[...events.values()].map((row) => [String(row.slug), row]),
	);

	const db = {
		prepare(sql: string) {
			const statement = {
				sql,
				values: [] as unknown[],
				bind(...values: unknown[]) {
					statement.values = values;
					return statement;
				},
				async first<T>() {
					if (sql.includes("FROM events WHERE slug")) {
						return (bySlug.get(String(statement.values[0])) as T) ?? null;
					}
					if (sql.includes("FROM accounts WHERE id")) {
						return (accounts.get(String(statement.values[0])) as T) ?? null;
					}
					if (sql.includes("FROM event_memberships m")) {
						const key = `${String(statement.values[0])}:${String(statement.values[1])}`;
						return (memberships.get(key) as T) ?? null;
					}
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
					if (sql.includes("FROM event_api_tokens") && sql.includes("event_id")) {
						const eventId = String(statement.values[0]);
						const rows = [...tokens.values()]
							.filter((row) => row.event_id === eventId)
							.sort((a, b) => Number(b.created_at) - Number(a.created_at));
						return { results: rows as T[] };
					}
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
					if (sql.includes("SET revoked_at")) {
						const [revokedAt, tokenId, eventId] = statement.values;
						const row = tokens.get(String(tokenId));
						if (!row || row.event_id !== eventId || row.revoked_at != null) {
							return { meta: { changes: 0 } };
						}
						row.revoked_at = revokedAt;
						return { meta: { changes: 1 } };
					}
					if (sql.includes("SET last_used_at")) {
						const [lastUsedAt, tokenId] = statement.values;
						const row = tokens.get(String(tokenId));
						if (!row) return { meta: { changes: 0 } };
						row.last_used_at = lastUsedAt;
						return { meta: { changes: 1 } };
					}
					return { meta: { changes: 0 } };
				},
			};
			return statement;
		},
		_tokens: tokens,
	};

	return db as unknown as D1Database & { _tokens: Map<string, Row> };
}

describe("event api tokens", () => {
	const secret = "test-auth-secret";
	const event = {
		id: "evt_1",
		slug: "aie-sandbox",
		name: "Sandbox",
		timezone: "UTC",
		start_day: null,
		end_day: null,
		mode: "live",
		created_at: 1,
		updated_at: 1,
	};
	const account = {
		id: "acc_1",
		email: "owner@example.com",
		name: "Owner",
		created_at: 1,
		updated_at: 1,
	};
	const membership = {
		id: "mem_1",
		event_id: event.id,
		account_id: account.id,
		role: "admin",
		created_at: 1,
	};

	let db: ReturnType<typeof createMemoryDb>;

	beforeEach(() => {
		db = createMemoryDb({
			events: [event],
			accounts: [account],
			memberships: [membership],
		});
	});

	it("hashes with AUTH_SECRET HMAC like auth challenges", async () => {
		const token = `${EVENT_API_TOKEN_PREFIX}abc`;
		await expect(hashEventApiToken(secret, token)).resolves.toBe(
			await hmacHash(secret, token),
		);
	});

	it("reads Bearer ce_pat_ tokens only", () => {
		expect(readBearerToken("Bearer ce_pat_secret")).toBe("ce_pat_secret");
		expect(readBearerToken("bearer ce_pat_secret")).toBe("ce_pat_secret");
		expect(readBearerToken("Bearer other_token")).toBeNull();
		expect(readBearerToken(null)).toBeNull();
	});

	it("treats * as full event admin", () => {
		expect(tokenGrantsFullEventAdmin('["*"]')).toBe(true);
		expect(tokenGrantsFullEventAdmin('["read"]')).toBe(false);
		expect(tokenGrantsFullEventAdmin("not-json")).toBe(false);
	});

	it("mints once, lists metadata only, and resolves access", async () => {
		const created = await createToken(db, {
			secret,
			eventId: event.id,
			name: "Agent",
			createdByAccountId: account.id,
			now: 100,
			token: `${EVENT_API_TOKEN_PREFIX}unit-test-secret`,
		});
		expect(created.token).toBe(`${EVENT_API_TOKEN_PREFIX}unit-test-secret`);
		expect(created.prefix).toBe("ce_pat_unit-");
		expect(created.token).toContain(created.prefix);

		const listed = await listTokens(db, event.id);
		expect(listed).toHaveLength(1);
		expect(listed[0]).toMatchObject({
			id: created.id,
			name: "Agent",
			prefix: "ce_pat_unit-",
		});
		expect(listed[0]).not.toHaveProperty("token");
		expect(listed[0]).not.toHaveProperty("token_hash");

		const access = await resolveTokenAccess(db, event.slug, created.token, {
			secret,
			now: 200,
		});
		expect(access?.event.id).toBe(event.id);
		expect(access?.account?.id).toBe(account.id);
		expect(access?.membership?.role).toBe("admin");
		expect(db._tokens.get(created.id)?.last_used_at).toBe(200);
	});

	it("rejects revoked tokens and wrong-event hashes", async () => {
		const created = await createToken(db, {
			secret,
			eventId: event.id,
			name: "Agent",
			now: 100,
			token: `${EVENT_API_TOKEN_PREFIX}revoke-me`,
		});
		await expect(
			revokeToken(db, { eventId: event.id, tokenId: created.id, now: 150 }),
		).resolves.toBe(true);

		await expect(
			resolveTokenAccess(db, event.slug, created.token, { secret, now: 200 }),
		).resolves.toBeNull();

		const otherEventDb = createMemoryDb({
			events: [{ ...event, id: "evt_2", slug: "other" }],
		});
		otherEventDb._tokens.set(created.id, {
			...db._tokens.get(created.id)!,
			revoked_at: null,
		});
		await expect(
			resolveTokenAccess(otherEventDb, "other", created.token, {
				secret,
				now: 200,
			}),
		).resolves.toBeNull();
	});

	it("rejects an account-bound token when its membership is missing", async () => {
		const membershiplessDb = createMemoryDb({
			events: [event],
			accounts: [account],
		});
		const created = await createToken(membershiplessDb, {
			secret,
			eventId: event.id,
			name: "Removed organizer",
			createdByAccountId: account.id,
			now: 100,
			token: `${EVENT_API_TOKEN_PREFIX}removed-organizer`,
		});

		await expect(
			resolveTokenAccess(membershiplessDb, event.slug, created.token, {
				secret,
				now: 200,
			}),
		).resolves.toBeNull();
	});

	it("returns the creator's real event membership", async () => {
		const ownerDb = createMemoryDb({
			events: [event],
			accounts: [account],
			memberships: [{ ...membership, role: "owner" }],
		});
		const created = await createToken(ownerDb, {
			secret,
			eventId: event.id,
			name: "Owner",
			createdByAccountId: account.id,
			now: 100,
			token: `${EVENT_API_TOKEN_PREFIX}owner`,
		});

		const access = await resolveTokenAccess(ownerDb, event.slug, created.token, {
			secret,
			now: 200,
		});

		expect(access?.membership).toEqual({ ...membership, role: "owner" });
	});

	it("rejects an account-bound token when its creator account is missing", async () => {
		const missingAccountDb = createMemoryDb({
			events: [event],
			memberships: [membership],
		});
		const created = await createToken(missingAccountDb, {
			secret,
			eventId: event.id,
			name: "Orphan",
			createdByAccountId: account.id,
			now: 100,
			token: `${EVENT_API_TOKEN_PREFIX}orphan`,
		});

		await expect(
			resolveTokenAccess(missingAccountDb, event.slug, created.token, {
				secret,
				now: 200,
			}),
		).resolves.toBeNull();
	});

	it("keeps synthetic admin access for null-creator service tokens", async () => {
		const created = await createToken(db, {
			secret,
			eventId: event.id,
			name: "Service",
			createdByAccountId: null,
			now: 100,
			token: `${EVENT_API_TOKEN_PREFIX}service`,
		});

		const access = await resolveTokenAccess(db, event.slug, created.token, {
			secret,
			now: 200,
		});

		expect(access?.account).toBeNull();
		expect(access?.membership?.role).toBe("admin");
	});
});
