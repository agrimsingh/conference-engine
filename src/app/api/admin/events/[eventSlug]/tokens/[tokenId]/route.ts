import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { revokeToken } from "@/lib/auth/event-api-tokens";
import { getDb } from "@/lib/db/cloudflare";

type RouteContext = {
	params: Promise<{ eventSlug: string; tokenId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
	const { eventSlug, tokenId } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;

	const revoked = await revokeToken(db, {
		eventId: authorization.access.event.id,
		tokenId: tokenId.trim(),
	});
	if (!revoked) {
		return NextResponse.json({ ok: false, error: "Token not found" }, { status: 404 });
	}
	return NextResponse.json({ ok: true });
}
