import { NextResponse } from "next/server";
import { getCloudflareEnv } from "@/lib/db/cloudflare";

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

export async function requirePublicApiKey(
	request: Request,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
	const env = await getCloudflareEnv();
	const expected = env.PUBLIC_API_KEY?.trim();
	if (!expected) {
		return {
			ok: false,
			response: NextResponse.json(
				{ ok: false, error: "PUBLIC_API_KEY is not configured" },
				{ status: 503 },
			),
		};
	}

	const provided = extractApiKey(request);
	if (!provided || !keysEqual(provided, expected)) {
		return {
			ok: false,
			response: NextResponse.json(
				{ ok: false, error: "Unauthorized" },
				{ status: 401 },
			),
		};
	}

	return { ok: true };
}
