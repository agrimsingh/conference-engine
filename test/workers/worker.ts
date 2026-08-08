import { EventRoom } from "@/durable-objects/EventRoom";
import { handleEventRoomUpgrade } from "@/lib/realtime/room-upgrade";

export { EventRoom };

export default {
	async fetch(request: Request, env: Pick<CloudflareEnv, "AUTH_SECRET" | "DB" | "EVENT_ROOM">): Promise<Response> {
		return (await handleEventRoomUpgrade(request, env)) ?? new Response("Not found", { status: 404 });
	},
};
