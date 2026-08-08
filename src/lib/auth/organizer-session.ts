import { cookies } from "next/headers";
import { getSessionsKv } from "@/lib/db/cloudflare";
import { getAccountById } from "@/lib/db/queries";
import type { AccountRow } from "@/lib/db/types";
import { randomToken } from "@/lib/security/crypto";

export const ORGANIZER_SESSION_COOKIE = "ce_organizer_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const SESSION_KV_PREFIX = "organizer_session:";

export type OrganizerSession = {
	accountId: string;
	email: string;
	createdAt: number;
};

function sessionKey(token: string): string {
	return `${SESSION_KV_PREFIX}${token}`;
}

export async function createOrganizerSession(args: {
	accountId: string;
	email: string;
}): Promise<{ token: string; expiresInSeconds: number }> {
	const kv = await getSessionsKv();
	const token = randomToken(32);
	const session: OrganizerSession = {
		accountId: args.accountId,
		email: args.email.trim().toLowerCase(),
		createdAt: Date.now(),
	};

	await kv.put(sessionKey(token), JSON.stringify(session), {
		expirationTtl: SESSION_TTL_SECONDS,
	});

	return { token, expiresInSeconds: SESSION_TTL_SECONDS };
}

export async function readOrganizerSession(
	token: string,
): Promise<OrganizerSession | null> {
	if (!token) return null;
	const kv = await getSessionsKv();
	const raw = await kv.get(sessionKey(token));
	if (!raw) return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}

	if (
		typeof parsed !== "object" ||
		parsed === null ||
		!("accountId" in parsed) ||
		!("email" in parsed) ||
		typeof (parsed as { accountId: unknown }).accountId !== "string" ||
		typeof (parsed as { email: unknown }).email !== "string"
	) {
		return null;
	}

	const record = parsed as {
		accountId: string;
		email: string;
		createdAt?: unknown;
	};
	const createdAt = typeof record.createdAt === "number" ? record.createdAt : 0;

	return { accountId: record.accountId, email: record.email, createdAt };
}

export async function readOrganizerSessionFromCookie(): Promise<OrganizerSession | null> {
	const jar = await cookies();
	const token = jar.get(ORGANIZER_SESSION_COOKIE)?.value;
	if (!token) return null;
	return readOrganizerSession(token);
}

export async function setOrganizerSessionCookie(token: string): Promise<void> {
	const jar = await cookies();
	const secure = process.env.NODE_ENV === "production";
	jar.set(ORGANIZER_SESSION_COOKIE, token, {
		httpOnly: true,
		secure,
		sameSite: "lax",
		path: "/",
		maxAge: SESSION_TTL_SECONDS,
	});
}

export async function clearOrganizerSession(): Promise<void> {
	const jar = await cookies();
	const token = jar.get(ORGANIZER_SESSION_COOKIE)?.value;
	if (token) {
		const kv = await getSessionsKv();
		await kv.delete(sessionKey(token));
	}
	jar.delete(ORGANIZER_SESSION_COOKIE);
}

export async function getOrganizerAccount(
	db: D1Database,
	session: OrganizerSession,
): Promise<AccountRow | null> {
	return getAccountById(db, session.accountId);
}
