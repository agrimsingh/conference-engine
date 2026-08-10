import {
	getAccountById,
	getEventBySlug,
	getEventMembership,
} from "@/lib/db/queries";
import type { AccountRow, EventMembershipRow, EventRow } from "@/lib/db/types";
import { hmacHash, randomToken } from "@/lib/security/crypto";

export const EVENT_API_TOKEN_PREFIX = "ce_pat_";
const DISPLAY_PREFIX_LENGTH = 12;
const DEFAULT_SCOPES_JSON = '["*"]';

export type EventApiTokenScope = "*";

export type EventApiTokenRow = {
	id: string;
	event_id: string;
	name: string;
	token_prefix: string;
	token_hash: string;
	scopes_json: string;
	created_by_account_id: string | null;
	created_at: number;
	last_used_at: number | null;
	revoked_at: number | null;
};

export type EventApiTokenPublic = {
	id: string;
	name: string;
	prefix: string;
	scopes: EventApiTokenScope[];
	createdAt: number;
	lastUsedAt: number | null;
	revokedAt: number | null;
	createdByAccountId: string | null;
};

export type CreatedEventApiToken = EventApiTokenPublic & {
	token: string;
};

export type TokenResolvedAccess = {
	event: EventRow;
	account: AccountRow | null;
	membership: EventMembershipRow | null;
};

function parseScope(entry: string): EventApiTokenScope | null {
	switch (entry) {
		case "*":
			return "*";
		default:
			return null;
	}
}

function parseScopes(scopesJson: string): EventApiTokenScope[] | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(scopesJson);
	} catch {
		return null;
	}
	if (!Array.isArray(parsed)) return null;
	const scopes: EventApiTokenScope[] = [];
	for (const entry of parsed) {
		if (typeof entry !== "string") return null;
		const scope = parseScope(entry);
		if (!scope) return null;
		scopes.push(scope);
	}
	return scopes;
}

export function tokenGrantsFullEventAdmin(scopesJson: string): boolean {
	const scopes = parseScopes(scopesJson);
	if (!scopes) return false;
	return scopes.includes("*");
}

export async function hashEventApiToken(secret: string, token: string): Promise<string> {
	return hmacHash(secret, token);
}

export function readBearerToken(authorizationHeader: string | null): string | null {
	if (!authorizationHeader) return null;
	const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim());
	if (!match) return null;
	const token = match[1] ?? "";
	if (!token.startsWith(EVENT_API_TOKEN_PREFIX)) return null;
	return token;
}

function toPublic(row: EventApiTokenRow): EventApiTokenPublic {
	const scopes = parseScopes(row.scopes_json) ?? ["*"];
	return {
		id: row.id,
		name: row.name,
		prefix: row.token_prefix,
		scopes,
		createdAt: row.created_at,
		lastUsedAt: row.last_used_at,
		revokedAt: row.revoked_at,
		createdByAccountId: row.created_by_account_id,
	};
}

function syntheticMembership(
	eventId: string,
	tokenId: string,
	createdAt: number,
	accountId: string | null,
): EventMembershipRow {
	return {
		id: `pat:${tokenId}`,
		event_id: eventId,
		account_id: accountId ?? `pat:${tokenId}`,
		role: "admin",
		created_at: createdAt,
	};
}

export async function createToken(
	db: D1Database,
	args: {
		secret: string;
		eventId: string;
		name: string;
		createdByAccountId?: string | null;
		now?: number;
		token?: string;
	},
): Promise<CreatedEventApiToken> {
	const name = args.name.trim();
	if (!name) {
		throw new Error("name is required");
	}
	const now = args.now ?? Date.now();
	const plaintext = args.token ?? `${EVENT_API_TOKEN_PREFIX}${randomToken(32)}`;
	if (!plaintext.startsWith(EVENT_API_TOKEN_PREFIX)) {
		throw new Error("token must use ce_pat_ prefix");
	}
	const tokenHash = await hashEventApiToken(args.secret, plaintext);
	const id = crypto.randomUUID();
	const tokenPrefix = plaintext.slice(0, DISPLAY_PREFIX_LENGTH);
	await db
		.prepare(
			`INSERT INTO event_api_tokens (
				id, event_id, name, token_prefix, token_hash, scopes_json,
				created_by_account_id, created_at, last_used_at, revoked_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
		)
		.bind(
			id,
			args.eventId,
			name,
			tokenPrefix,
			tokenHash,
			DEFAULT_SCOPES_JSON,
			args.createdByAccountId ?? null,
			now,
		)
		.run();

	return {
		id,
		name,
		prefix: tokenPrefix,
		scopes: ["*"],
		createdAt: now,
		lastUsedAt: null,
		revokedAt: null,
		createdByAccountId: args.createdByAccountId ?? null,
		token: plaintext,
	};
}

export async function listTokens(
	db: D1Database,
	eventId: string,
): Promise<EventApiTokenPublic[]> {
	const result = await db
		.prepare(
			`SELECT * FROM event_api_tokens
			 WHERE event_id = ?
			 ORDER BY created_at DESC`,
		)
		.bind(eventId)
		.all<EventApiTokenRow>();
	return result.results.map(toPublic);
}

export async function revokeToken(
	db: D1Database,
	args: { eventId: string; tokenId: string; now?: number },
): Promise<boolean> {
	const now = args.now ?? Date.now();
	const result = await db
		.prepare(
			`UPDATE event_api_tokens
			 SET revoked_at = ?
			 WHERE id = ? AND event_id = ? AND revoked_at IS NULL`,
		)
		.bind(now, args.tokenId, args.eventId)
		.run();
	return (result.meta.changes ?? 0) > 0;
}

async function touchLastUsed(db: D1Database, tokenId: string, now: number): Promise<void> {
	try {
		await db
			.prepare(`UPDATE event_api_tokens SET last_used_at = ? WHERE id = ?`)
			.bind(now, tokenId)
			.run();
	} catch {
		// best-effort; auth must still succeed
	}
}

export async function resolveTokenAccess(
	db: D1Database,
	eventSlug: string,
	rawToken: string,
	args?: { secret: string; now?: number },
): Promise<TokenResolvedAccess | null> {
	if (!rawToken.startsWith(EVENT_API_TOKEN_PREFIX)) return null;
	const secret = args?.secret;
	if (!secret) return null;
	const now = args?.now ?? Date.now();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) return null;

	const tokenHash = await hashEventApiToken(secret, rawToken);
	const row = await db
		.prepare(`SELECT * FROM event_api_tokens WHERE token_hash = ?`)
		.bind(tokenHash)
		.first<EventApiTokenRow>();
	if (!row) return null;
	if (row.event_id !== event.id) return null;
	if (row.revoked_at != null) return null;
	if (!tokenGrantsFullEventAdmin(row.scopes_json)) return null;

	if (row.created_by_account_id) {
		const membership = await getEventMembership(
			db,
			event.id,
			row.created_by_account_id,
		);
		if (!membership) return null;
		const account = await getAccountById(db, row.created_by_account_id);
		if (!account) return null;

		void touchLastUsed(db, row.id, now);

		return { event, account, membership };
	}

	void touchLastUsed(db, row.id, now);

	return {
		event,
		account: null,
		membership: syntheticMembership(event.id, row.id, row.created_at, null),
	};
}
