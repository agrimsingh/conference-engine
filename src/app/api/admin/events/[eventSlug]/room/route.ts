import { NextResponse } from "next/server";
import { authorizeEventAdminApi } from "@/lib/auth/admin";
import { getAuthSecret, getDb } from "@/lib/db/cloudflare";
import { mintRoomTicket } from "@/lib/security/room-ticket";

type RouteContext = { params: Promise<{ eventSlug: string }> };

/** A normal authenticated request mints a short-lived cookie; upgrades go to Worker. */
export async function GET(request: Request, context: RouteContext) {
	if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
		return NextResponse.json({ ok: false, error: "Request a room ticket before upgrading" }, { status: 401 });
	}
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	// A local bypass without a verified organizer account cannot mint a credential.
	if (!access || !access.account || !access.membership) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}
	const ticket = await mintRoomTicket(await getAuthSecret(), {
		eventId: access.event.id,
		eventSlug: access.event.slug,
		accountId: access.account.id,
	});
	const response = NextResponse.json({ ok: true, expiresAt: ticket.ticket.exp });
	response.cookies.set("ce_room_ticket", ticket.token, {
		httpOnly: true,
		secure: true,
		sameSite: "strict",
		path: `/api/admin/events/${access.event.slug}/room`,
		maxAge: 60,
	});
	return response;
}
