import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getCloudflareEnv, getDb } from "@/lib/db/cloudflare";

export async function PATCH(request: Request, context: { params: Promise<{ eventSlug: string; sessionId: string }> }) {
	const { eventSlug, sessionId } = await context.params; const db = await getDb(); const auth = await authorizeWritableEventAdminApi(db, eventSlug); if (!auth.ok) return auth.response;
	if (!auth.access.account) return NextResponse.json({ ok: false, error: "Organizer account required" }, { status: 401 });
	const parsed = await readBoundedJson(request, 32 * 1024); if (!parsed.ok || !isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: parsed.ok ? "Expected JSON object" : parsed.error }, { status: parsed.ok ? 400 : parsed.status });
	const editorName = auth.access.account.name?.trim() || auth.access.account.email;
	const env = await getCloudflareEnv();
	if (!env.EVENT_ROOM) return NextResponse.json({ ok: false, error: "EVENT_ROOM binding unavailable" }, { status: 503 });
	const mutation = typeof parsed.value.status === "string"
		? { action: "status", submissionId: sessionId, status: parsed.value.status }
		: { action: "update", submissionId: sessionId, editorAccountId: auth.access.account.id, editorName, title: typeof parsed.value.title === "string" ? parsed.value.title : "", abstract: typeof parsed.value.abstract === "string" ? parsed.value.abstract : "" };
	const response = await env.EVENT_ROOM.getByName(auth.access.event.id).fetch("https://event-room/session-content", { method: "POST", headers: { "content-type": "application/json", "x-ce-event-id": auth.access.event.id }, body: JSON.stringify(mutation) });
	const result: unknown = await response.json();
	if (!result || typeof result !== "object" || Array.isArray(result)) return NextResponse.json({ ok: false, error: "Invalid event room response" }, { status: 502 });
	return NextResponse.json(result, { status: response.status });
}
