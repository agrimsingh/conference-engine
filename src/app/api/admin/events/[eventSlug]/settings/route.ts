import { NextResponse } from "next/server";
import { authorizeEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { loadEventConfiguration } from "@/lib/events/configuration";
import { requireWritableEventBySlug } from "@/lib/events/writability";
import { mutateEventRoomConfiguration } from "@/lib/realtime/event-room";

type Context = { params: Promise<{ eventSlug: string }> };
function denied(error: unknown) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Update failed" }, { status: error instanceof Error && "status" in error && typeof error.status === "number" ? error.status : 400 }); }

export async function GET(_request: Request, context: Context) {
	const { eventSlug } = await context.params; const db = await getDb(); const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	return NextResponse.json({ ok: true, configuration: await loadEventConfiguration(db, access.event.id) });
}
export async function PATCH(request: Request, context: Context) {
	const { eventSlug } = await context.params; const db = await getDb(); const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	try { await requireWritableEventBySlug(db, eventSlug); } catch (error) { return denied(error); }
	const parsed = await readBoundedJson(request, 16 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	const result = await mutateEventRoomConfiguration(access.event.id, { action: "event-settings", input: parsed.value });
	return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json(result, { status: result.status });
}
