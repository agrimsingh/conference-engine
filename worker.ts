// @ts-nocheck — OpenNext emits .open-next/worker.js after next build; next typecheck runs first.
import { default as handler } from "./.open-next/worker.js";
import { sendTaskReminders } from "./src/lib/email/reminders";
import { handleEventRoomUpgrade } from "./src/lib/realtime/room-upgrade";

export { EventRoom } from "./src/durable-objects/EventRoom";

const PORTAL_ORIGIN = "https://conference-engine.65labs.org";

export default {
	async fetch(request, env, ctx) {
		const roomResponse = await handleEventRoomUpgrade(request, env);
		if (roomResponse) return roomResponse;
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
