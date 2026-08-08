// @ts-nocheck — OpenNext emits .open-next/worker.js after next build; next typecheck runs first.
import { default as handler } from "./.open-next/worker.js";
import { sendTaskReminders } from "./src/lib/email/reminders";
import { verifyRoomTicket } from "./src/lib/security/room-ticket";

export { EventRoom } from "./src/durable-objects/EventRoom";

const ROOM_PATH = /^\/api\/admin\/events\/([^/]+)\/room$/;
const PORTAL_ORIGIN = "https://conference-engine.65labs.org";

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const match = ROOM_PATH.exec(url.pathname);
		const upgrade = request.headers.get("Upgrade");

		if (match && upgrade?.toLowerCase() === "websocket") {
			const eventSlug = match[1];
			if (!eventSlug || !env.AUTH_SECRET) {
				return new Response("Unauthorized", { status: 401 });
			}
			const event = await env.DB.prepare("SELECT id FROM events WHERE slug = ?")
				.bind(eventSlug)
				.first<{ id: string }>();
			if (!event) {
				return new Response("Not found", { status: 404 });
			}
			const ticket = cookieValue(request.headers.get("Cookie"), "ce_room_ticket");
			const verified = ticket ? await verifyRoomTicket(env.AUTH_SECRET, ticket, { eventId: event.id, eventSlug }) : null;
			if (!verified) return new Response("Unauthorized", { status: 401 });
			const membership = await env.DB.prepare(
				"SELECT 1 FROM event_memberships WHERE event_id = ? AND account_id = ?",
			).bind(event.id, verified.accountId).first();
			if (!membership) return new Response("Unauthorized", { status: 401 });

			const stub = env.EVENT_ROOM.getByName(event.id);
			const headers = new Headers(request.headers);
			headers.set("x-ce-room-ticket-nonce", verified.nonce);
			headers.set("x-ce-room-ticket-exp", String(verified.exp));
			return stub.fetch(new Request(request, { headers }));
		}

		return handler.fetch(request, env, ctx);
	},

	async scheduled(event, env, ctx) {
		ctx.waitUntil(
			sendTaskReminders(env, {
				portalBaseUrl: PORTAL_ORIGIN,
			}),
		);
	},
};

function cookieValue(cookieHeader: string | null, name: string): string | null {
	if (!cookieHeader) return null;
	for (const segment of cookieHeader.split(";")) {
		const [key, ...parts] = segment.trim().split("=");
		if (key === name) return parts.join("=") || null;
	}
	return null;
}
