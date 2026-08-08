import { verifyRoomTicket } from "@/lib/security/room-ticket";

const ROOM_PATH = /^\/api\/admin\/events\/([^/]+)\/room$/;

type RoomUpgradeEnv = Pick<CloudflareEnv, "AUTH_SECRET" | "DB" | "EVENT_ROOM">;

/** Handles only authenticated EventRoom WebSocket upgrades; callers own all other routes. */
export async function handleEventRoomUpgrade(request: Request, env: RoomUpgradeEnv): Promise<Response | null> {
	const match = ROOM_PATH.exec(new URL(request.url).pathname);
	if (!match || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return null;

	const eventSlug = match[1];
	if (!eventSlug || !env.AUTH_SECRET) return new Response("Unauthorized", { status: 401 });
	const event = await env.DB.prepare("SELECT id FROM events WHERE slug = ?")
		.bind(eventSlug)
		.first<{ id: string }>();
	if (!event) return new Response("Not found", { status: 404 });

	const ticket = cookieValue(request.headers.get("Cookie"), "ce_room_ticket");
	const verified = ticket
		? await verifyRoomTicket(env.AUTH_SECRET, ticket, { eventId: event.id, eventSlug })
		: null;
	if (!verified) return new Response("Unauthorized", { status: 401 });
	const membership = await env.DB.prepare(
		"SELECT 1 FROM event_memberships WHERE event_id = ? AND account_id = ?",
	).bind(event.id, verified.accountId).first();
	if (!membership) return new Response("Unauthorized", { status: 401 });

	const headers = new Headers(request.headers);
	headers.set("x-ce-room-ticket-nonce", verified.nonce);
	headers.set("x-ce-room-ticket-exp", String(verified.exp));
	return env.EVENT_ROOM.getByName(event.id).fetch(new Request(request, { headers }));
}

function cookieValue(cookieHeader: string | null, name: string): string | null {
	if (!cookieHeader) return null;
	for (const segment of cookieHeader.split(";")) {
		const [key, ...parts] = segment.trim().split("=");
		if (key === name) return parts.join("=") || null;
	}
	return null;
}
