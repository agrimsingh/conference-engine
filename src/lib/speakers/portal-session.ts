import { getAuthSecret, getSessionsKv } from "@/lib/db/cloudflare";
import { hmacSha256, randomToken } from "@/lib/security/crypto";
import type { SubmissionRow } from "@/lib/db/types";

const PORTAL_TTL_SECONDS = 60 * 60 * 24 * 7;
const KV_PREFIX = "portal_session:";

export type PortalSession = {
	email: string;
	personId: string;
	createdAt: number;
};

export function hasPortalEligibility(submissions: readonly SubmissionRow[]): boolean {
	return submissions.length > 0;
}

function sessionKey(token: string): string {
	return `${KV_PREFIX}${token}`;
}

export async function createPortalSession(args: {
	email: string;
	personId: string;
}): Promise<{ token: string; expiresInSeconds: number }> {
	const token = await mintPortalSessionToken();
	await persistPortalSession(token, args);
	return { token, expiresInSeconds: PORTAL_TTL_SECONDS };
}

export async function mintPortalSessionToken(): Promise<string> {
	const secret = await getAuthSecret();
	const random = randomToken(24);
	return `${random}.${(await hmacSha256(secret, random)).slice(0, 16)}`;
}

export async function persistPortalSession(
	token: string,
	args: { email: string; personId: string },
): Promise<void> {
	const kv = await getSessionsKv();
	const session: PortalSession = {
		email: args.email.trim().toLowerCase(),
		personId: args.personId,
		createdAt: Date.now(),
	};

	await kv.put(sessionKey(token), JSON.stringify(session), {
		expirationTtl: PORTAL_TTL_SECONDS,
	});
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
