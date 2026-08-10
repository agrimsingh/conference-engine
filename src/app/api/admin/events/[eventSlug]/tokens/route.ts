import { NextResponse } from "next/server";
import {
	authorizeSessionWritableEventAdminApi,
	resolveSessionEventAdminAccess,
} from "@/lib/auth/admin";
import { createToken, listTokens, revokeToken } from "@/lib/auth/event-api-tokens";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getAuthSecret, getDb } from "@/lib/db/cloudflare";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await resolveSessionEventAdminAccess(db, eventSlug);
	if (!access) {
		return NextResponse.json(
			{ ok: false, error: "Organizer session required. API tokens cannot manage tokens." },
			{ status: 401 },
		);
	}

	const tokens = await listTokens(db, access.event.id);
	return NextResponse.json({
		ok: true,
		tokens: tokens
			.filter((token) => token.revokedAt == null)
			.map((token) => ({
				id: token.id,
				name: token.name,
				prefix: token.prefix,
				scopes: token.scopes,
				createdAt: token.createdAt,
				lastUsedAt: token.lastUsedAt,
				createdByAccountId: token.createdByAccountId,
			})),
	});
}

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeSessionWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const access = authorization.access;

	const parsed = await readBoundedJson(request, 16 * 1024);
	if (!parsed.ok) {
		return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	}
	if (!isJsonObject(parsed.value)) {
		return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	}

	const name = typeof parsed.value.name === "string" ? parsed.value.name.trim() : "";
	if (!name) {
		return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
	}

	const created = await createToken(db, {
		secret: await getAuthSecret(),
		eventId: access.event.id,
		name,
		createdByAccountId: access.account?.id ?? null,
	});

	return NextResponse.json({
		ok: true,
		token: {
			id: created.id,
			name: created.name,
			prefix: created.prefix,
			token: created.token,
			createdAt: created.createdAt,
		},
	});
}

export async function DELETE(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeSessionWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const access = authorization.access;

	const parsed = await readBoundedJson(request, 16 * 1024);
	if (!parsed.ok) {
		return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	}
	if (!isJsonObject(parsed.value)) {
		return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	}

	const tokenId =
		typeof parsed.value.tokenId === "string" ? parsed.value.tokenId.trim() : "";
	if (!tokenId) {
		return NextResponse.json({ ok: false, error: "tokenId required" }, { status: 400 });
	}

	const revoked = await revokeToken(db, {
		eventId: access.event.id,
		tokenId,
	});
	if (!revoked) {
		return NextResponse.json({ ok: false, error: "Token not found" }, { status: 404 });
	}
	return NextResponse.json({ ok: true });
}
