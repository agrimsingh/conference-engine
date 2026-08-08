import { cookies } from "next/headers";
import { getAuthSecret, getSessionsKv } from "@/lib/db/cloudflare";
import { getAccountById } from "@/lib/db/queries";
import type { AccountRow } from "@/lib/db/types";

export const ORGANIZER_SESSION_COOKIE = "ce_organizer_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const SESSION_KV_PREFIX = "organizer_session:";
const LOGIN_KV_PREFIX = "organizer_login:";
const LOGIN_TTL_SECONDS = 60 * 15;

export type OrganizerSession = {
	accountId: string;
	email: string;
	createdAt: number;
};

export type OrganizerLoginToken = {
	accountId: string;
	email: string;
	createdAt: number;
};

function sessionKey(token: string): string {
	return `${SESSION_KV_PREFIX}${token}`;
}

function loginKey(token: string): string {
	return `${LOGIN_KV_PREFIX}${token}`;
}

export async function createOrganizerSession(args: {
	accountId: string;
	email: string;
}): Promise<{ token: string; expiresInSeconds: number }> {
	const kv = await getSessionsKv();
	const secret = await getAuthSecret();
	const token = await mintToken(secret);
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

export async function createOrganizerLoginToken(args: {
	accountId: string;
	email: string;
}): Promise<{ token: string; expiresInSeconds: number }> {
	const kv = await getSessionsKv();
	const secret = await getAuthSecret();
	const token = await mintToken(secret);
	const payload: OrganizerLoginToken = {
		accountId: args.accountId,
		email: args.email.trim().toLowerCase(),
		createdAt: Date.now(),
	};

	await kv.put(loginKey(token), JSON.stringify(payload), {
		expirationTtl: LOGIN_TTL_SECONDS,
	});

	return { token, expiresInSeconds: LOGIN_TTL_SECONDS };
}

export async function consumeOrganizerLoginToken(
	token: string,
): Promise<OrganizerLoginToken | null> {
	if (!token) return null;
	const kv = await getSessionsKv();
	const raw = await kv.get(loginKey(token));
	if (!raw) return null;

	await kv.delete(loginKey(token));

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

async function mintToken(secret: string): Promise<string> {
	const random = crypto.getRandomValues(new Uint8Array(24));
	const randomB64 = bufferToBase64Url(random);
	const sig = await hmacSha256(secret, randomB64);
	return `${randomB64}.${sig.slice(0, 16)}`;
}

async function hmacSha256(secret: string, message: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const mac = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(message),
	);
	return bufferToBase64Url(new Uint8Array(mac));
}

function bufferToBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
