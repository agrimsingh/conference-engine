import { getAuthSecret, getSessionsKv } from "@/lib/db/cloudflare";

const PORTAL_TTL_SECONDS = 60 * 60 * 24 * 7;
const KV_PREFIX = "portal_session:";

export type PortalSession = {
	email: string;
	personId: string;
	createdAt: number;
};

function sessionKey(token: string): string {
	return `${KV_PREFIX}${token}`;
}

export async function createPortalSession(args: {
	email: string;
	personId: string;
}): Promise<{ token: string; expiresInSeconds: number }> {
	const kv = await getSessionsKv();
	const secret = await getAuthSecret();
	const token = await mintToken(secret);
	const session: PortalSession = {
		email: args.email.trim().toLowerCase(),
		personId: args.personId,
		createdAt: Date.now(),
	};

	await kv.put(sessionKey(token), JSON.stringify(session), {
		expirationTtl: PORTAL_TTL_SECONDS,
	});

	return { token, expiresInSeconds: PORTAL_TTL_SECONDS };
}

export async function readPortalSession(
	token: string,
): Promise<PortalSession | null> {
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
		!("email" in parsed) ||
		!("personId" in parsed) ||
		typeof (parsed as { email: unknown }).email !== "string" ||
		typeof (parsed as { personId: unknown }).personId !== "string"
	) {
		return null;
	}

	const record = parsed as {
		email: string;
		personId: string;
		createdAt?: unknown;
	};
	const createdAt = typeof record.createdAt === "number" ? record.createdAt : 0;

	return { email: record.email, personId: record.personId, createdAt };
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
