import { NextResponse } from "next/server";
import { authorizeSessionWritableEventAdminApi } from "@/lib/auth/admin";
import { mintPortalSignInLink } from "@/lib/auth/mint-portal-link";
import { getAuthSecret, getDb } from "@/lib/db/cloudflare";
import { listEventSpeakerRoster } from "@/lib/speakers/roster";

type RouteContext = {
	params: Promise<{ eventSlug: string; personId: string }>;
};

/**
 * Admin cookie-session only: mint a speaker portal magic link for clipboard.
 * Bearer PATs cannot mint one-time sign-in links.
 */
export async function POST(request: Request, context: RouteContext) {
	const { eventSlug, personId } = await context.params;
	const db = await getDb();
	const auth = await authorizeSessionWritableEventAdminApi(db, eventSlug);
	if (!auth.ok) return auth.response;

	const speaker = (await listEventSpeakerRoster(db, auth.access.event.id)).find(
		(row) => row.personId === personId,
	);
	if (!speaker) {
		return NextResponse.json({ ok: false, error: "Speaker not found" }, { status: 404 });
	}

	const minted = await mintPortalSignInLink(db, {
		secret: await getAuthSecret(),
		personId,
		eventId: auth.access.event.id,
		origin: new URL(request.url).origin,
	});

	return NextResponse.json({
		ok: true,
		portalUrl: minted.portalUrl,
		expiresAt: minted.expiresAt,
	});
}
