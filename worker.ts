// @ts-nocheck — OpenNext emits .open-next/worker.js after next build; next typecheck runs first.
import { default as handler } from "./.open-next/worker.js";

export { EventRoom } from "./src/durable-objects/EventRoom";

const ROOM_PATH = /^\/api\/admin\/events\/([^/]+)\/room$/;

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const match = ROOM_PATH.exec(url.pathname);
		const upgrade = request.headers.get("Upgrade");

		if (match && upgrade?.toLowerCase() === "websocket") {
			const cookie = request.headers.get("Cookie") ?? "";
			if (!cookie.split(";").some((part) => part.trim() === "ce_admin_bypass=1")) {
				return new Response("Unauthorized", { status: 401 });
			}

			const eventSlug = match[1];
			if (!eventSlug) {
				return new Response("Not found", { status: 404 });
			}

			const event = await env.DB.prepare("SELECT id FROM events WHERE slug = ?")
				.bind(eventSlug)
				.first();
			if (!event) {
				return new Response("Not found", { status: 404 });
			}

			const stub = env.EVENT_ROOM.getByName(event.id);
			return stub.fetch(request);
		}

		return handler.fetch(request, env, ctx);
	},
};
