import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { readBoundedJson, isJsonObject } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { previewSessionImport } from "@/lib/sessions/session";

type RouteContext = { params: Promise<{ eventSlug: string }> };

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const json = await readBoundedJson(request, 1024 * 1024);
	if (!json.ok) return NextResponse.json({ ok: false, error: json.error }, { status: json.status });
	if (!isJsonObject(json.value) || typeof json.value.csv !== "string") return NextResponse.json({ ok: false, error: "Expected { csv: string }" }, { status: 400 });
	const preview = await previewSessionImport(db, authorization.access.event.id, json.value.csv);
	return NextResponse.json(preview, { status: preview.ok ? 200 : 400 });
}
