import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { readBoundedJson, isJsonObject } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { broadcastEventInvalidate } from "@/lib/realtime/event-room";
import { commitSessionImport } from "@/lib/sessions/session";

type RouteContext = { params: Promise<{ eventSlug: string }> };

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const json = await readBoundedJson(request, 1024 * 1024);
	if (!json.ok) return NextResponse.json({ ok: false, error: json.error }, { status: json.status });
	if (!isJsonObject(json.value) || typeof json.value.csv !== "string") return NextResponse.json({ ok: false, error: "Expected { csv: string }" }, { status: 400 });
	const result = await commitSessionImport(db, authorization.access.event.id, json.value.csv);
	if (!result.ok) return NextResponse.json(result, { status: result.status ?? 400 });
	const broadcasted = result.created > 0 ? await broadcastEventInvalidate(authorization.access.event.id, "sessions.import") : false;
	return NextResponse.json({ ...result, broadcasted });
}
