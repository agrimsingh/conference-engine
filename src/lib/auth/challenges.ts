import { hmacHash, randomToken } from "@/lib/security/crypto";

const ORGANIZER_TTL_MS = 15 * 60_000;
const PORTAL_TTL_MS = 15 * 60_000;

export type AuthChallengeKind = "organizer_login" | "event_invite" | "portal_login";
export type AuthChallenge = {
	kind: AuthChallengeKind;
	accountId: string | null;
	personId: string | null;
	eventId: string | null;
};

export async function createAuthChallenge(
	db: D1Database,
	args: {
		secret: string;
		kind: AuthChallengeKind;
		accountId?: string | null;
		personId?: string | null;
		eventId?: string | null;
		token?: string;
		now?: number;
	},
): Promise<{ token: string; tokenHash: string; expiresAt: number }> {
	const token = args.token ?? randomToken(32);
	const tokenHash = await hmacHash(args.secret, token);
	const now = args.now ?? Date.now();
	const expiresAt = now + (args.kind === "portal_login" ? PORTAL_TTL_MS : ORGANIZER_TTL_MS);
	await db.prepare(
		`INSERT INTO auth_challenges (
       token_hash, kind, account_id, person_id, event_id, state, expires_at, created_at
     ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
	).bind(tokenHash, args.kind, args.accountId ?? null, args.personId ?? null, args.eventId ?? null, expiresAt, now).run();
	return { token, tokenHash, expiresAt };
}

export async function failAuthChallenge(
	db: D1Database,
	args: { tokenHash: string; reason: string; now?: number },
): Promise<void> {
	await db.prepare(
		`UPDATE auth_challenges
     SET state = 'failed', failure_reason = ?
     WHERE token_hash = ? AND state = 'active'`,
	).bind(args.reason.slice(0, 1_000), args.tokenHash).run();
}

/** Atomic one-time challenge consumption. Replays and expired challenges fail. */
export async function consumeAuthChallenge(
	db: D1Database,
	args: { secret: string; token: string; kind: AuthChallengeKind; now?: number },
): Promise<AuthChallenge | null> {
	if (!args.token) return null;
	const tokenHash = await hmacHash(args.secret, args.token);
	const now = args.now ?? Date.now();
	const row = await db.prepare(
		`UPDATE auth_challenges
     SET state = 'consumed', consumed_at = ?
     WHERE token_hash = ? AND kind = ? AND state = 'active' AND expires_at >= ?
     RETURNING kind, account_id, person_id, event_id`,
	).bind(now, tokenHash, args.kind, now).first<{
		kind: AuthChallengeKind;
		account_id: string | null;
		person_id: string | null;
		event_id: string | null;
	}>();
	if (!row) return null;
	return { kind: row.kind, accountId: row.account_id, personId: row.person_id, eventId: row.event_id };
}

export async function hashAuthChallengeToken(secret: string, token: string): Promise<string> {
	return hmacHash(secret, token);
}
