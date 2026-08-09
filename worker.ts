// @ts-nocheck — OpenNext emits .open-next/worker.js after next build; next typecheck runs first.
import { default as handler } from "./.open-next/worker.js";
import { syncOptInEventsToAirtable } from "./src/lib/export/airtable-sync";
import { sendDraftReminders } from "./src/lib/email/draft-reminders";
import { sendTaskReminders } from "./src/lib/email/reminders";
import { handleEventRoomUpgrade } from "./src/lib/realtime/room-upgrade";
import { pruneExpiredRateLimitBuckets } from "./src/lib/security/rate-limit";

export { EventRoom } from "./src/durable-objects/EventRoom";

export default {
	async fetch(request, env, ctx) {
		const roomResponse = await handleEventRoomUpgrade(request, env);
		if (roomResponse) return roomResponse;
		return handler.fetch(request, env, ctx);
	},

	async scheduled(event, env, ctx) {
		const now = Date.now();
		ctx.waitUntil(
			sendTaskReminders(env, { now, dueMode: "due_or_overdue" }),
		);
		ctx.waitUntil(
			sendDraftReminders(env, { now }),
		);
		ctx.waitUntil(
			pruneExpiredRateLimitBuckets(env.DB),
		);
		ctx.waitUntil(
			syncOptInEventsToAirtable(env),
		);
	},
};
