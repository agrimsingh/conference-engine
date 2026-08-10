import { NextResponse } from "next/server";
import { EVENT_API_TOKEN_PREFIX, resolveTokenAccess } from "@/lib/auth/event-api-tokens";
import {
	getAuthSecret,
	getCloudflareEnv,
	getDb,
} from "@/lib/db/cloudflare";

function extractApiKey(request: Request): string | null {
	const headerKey = request.headers.get("x-api-key")?.trim();
	if (headerKey) return headerKey;

	const auth = request.headers.get("authorization");
	if (!auth) return null;
	const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
	return match?.[1]?.trim() || null;
}

function keysEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i += 1) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

function unauthorized(): { ok: false; response: NextResponse } {
	return {
		ok: false,
		response: NextResponse.json(
			{ ok: false, error: "Unauthorized" },
			{ status: 401 },
		),
	};
}

export async function requireV1ReadAccess(
	request: Request,
	eventSlug: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
	const provided = extractApiKey(request);
	if (!provided) return unauthorized();

	if (provided.startsWith(EVENT_API_TOKEN_PREFIX)) {
		const [db, secret] = await Promise.all([getDb(), getAuthSecret()]);
		const access = await resolveTokenAccess(db, eventSlug, provided, { secret });
		return access ? { ok: true } : unauthorized();
	}

	const env = await getCloudflareEnv() as CloudflareEnv & {
		PUBLIC_API_KEY_CROSS_EVENT?: string;
	};
	const expected = env.PUBLIC_API_KEY?.trim();
	const crossEventEnabled = /^(1|true|yes)$/i.test(
		env.PUBLIC_API_KEY_CROSS_EVENT?.trim() ?? "",
	);
	if (
		!expected ||
		!crossEventEnabled ||
		!keysEqual(provided, expected)
	) {
		return unauthorized();
	}

	return { ok: true };
}
