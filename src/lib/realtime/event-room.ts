import { getCloudflareEnv } from "@/lib/db/cloudflare";

export async function broadcastEventInvalidate(
	eventId: string,
	reason: string,
): Promise<boolean> {
	try {
		const env = await getCloudflareEnv();
		if (!env.EVENT_ROOM) return false;
		const stub = env.EVENT_ROOM.getByName(eventId);
		const response = await stub.fetch("https://event-room/broadcast", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				type: "invalidate",
				reason,
				eventId,
				at: Date.now(),
			}),
		});
		return response.ok;
	} catch {
		return false;
	}
}
