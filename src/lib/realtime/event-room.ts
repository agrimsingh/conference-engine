import { getCloudflareEnv } from "@/lib/db/cloudflare";
import { fetchEventRoomMutation } from "@/lib/realtime/event-room-fetch";

export type EventRoomConfigurationMutation =
	| { action: "event-settings"; input: Record<string, unknown> }
	| { action: "room-update"; id: unknown; name: unknown }
	| { action: "room-delete"; id: unknown };

export async function mutateEventRoomConfiguration(
	eventId: string,
	mutation: EventRoomConfigurationMutation,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
	const env = await getCloudflareEnv();
	if (!env.EVENT_ROOM) return { ok: false, error: "EVENT_ROOM binding unavailable", status: 503 };
	const response = await fetchEventRoomMutation(env.EVENT_ROOM, eventId, new Request("https://event-room/configuration", {
		method: "POST",
		headers: { "content-type": "application/json", "x-ce-event-id": eventId },
		body: JSON.stringify(mutation),
	}));
	let value: unknown;
	try { value = await response.json(); } catch { return { ok: false, error: "Invalid event room response", status: 502 }; }
	if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Invalid event room response", status: 502 };
	const result = value as Record<string, unknown>;
	if (result.ok === true) return { ok: true };
	return { ok: false, error: typeof result.error === "string" ? result.error : "Configuration update failed", status: response.status };
}

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
