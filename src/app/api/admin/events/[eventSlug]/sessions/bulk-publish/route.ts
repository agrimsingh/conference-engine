import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { readBoundedJson, isJsonObject } from "@/lib/cfp/request";
import { getCloudflareEnv, getDb } from "@/lib/db/cloudflare";
import { fetchEventRoomMutation } from "@/lib/realtime/event-room-fetch";

type RouteContext = { params: Promise<{ eventSlug: string }> };

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const json = await readBoundedJson(request, 32 * 1024);
	if (!json.ok) return NextResponse.json({ ok: false, error: json.error }, { status: json.status });
	if (!isJsonObject(json.value) || (json.value.action !== "publish" && json.value.action !== "unpublish") || !Array.isArray(json.value.sessionIds) || json.value.sessionIds.some((id) => typeof id !== "string" || id.length > 128) || ("approveContent" in json.value && typeof json.value.approveContent !== "boolean")) return NextResponse.json({ ok: false, error: "Expected { action: publish|unpublish, sessionIds: string[], approveContent?: boolean }" }, { status: 400 });
	const env = await getCloudflareEnv();
	if (!env.EVENT_ROOM) return NextResponse.json({ ok: false, error: "EVENT_ROOM binding unavailable" }, { status: 503 });
	const response = await fetchEventRoomMutation(env.EVENT_ROOM, authorization.access.event.id, new Request("https://event-room/bulk-publication", {
		method: "POST",
		headers: { "content-type": "application/json", "x-ce-event-id": authorization.access.event.id },
		body: JSON.stringify({ action: json.value.action, sessionIds: json.value.sessionIds, approveContent: json.value.approveContent === true }),
	}));
	let result: unknown;
	try { result = await response.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid event room response" }, { status: 502 }); }
	if (!result || typeof result !== "object" || Array.isArray(result)) return NextResponse.json({ ok: false, error: "Invalid event room response" }, { status: 502 });
	const value = result as Record<string, unknown>;
	return NextResponse.json(value, { status: response.status });
}
