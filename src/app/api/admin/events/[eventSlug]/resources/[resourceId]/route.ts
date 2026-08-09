import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { deletePortalResource, parsePortalResourceInput, updatePortalResource } from "@/lib/resources/resources";

type Context = { params: Promise<{ eventSlug: string; resourceId: string }> };

export async function PATCH(request: Request, context: Context) {
	const { eventSlug, resourceId } = await context.params;
	const db = await getDb();
	const auth = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!auth.ok) return auth.response;
	const body = await readBoundedJson(request, 24 * 1024);
	if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: body.status });
	if (!isJsonObject(body.value)) return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	const parsed = parsePortalResourceInput(body.value);
	if (!parsed.ok) return NextResponse.json(parsed, { status: 400 });
	try {
		const resource = await updatePortalResource(db, auth.access.event.id, resourceId, parsed.value);
		return resource ? NextResponse.json({ ok: true, resource }) : NextResponse.json({ ok: false, error: "Resource not found" }, { status: 404 });
	} catch (error) {
		if (error instanceof Error && /UNIQUE/.test(error.message)) return NextResponse.json({ ok: false, error: "That resource slug is already in use" }, { status: 409 });
		throw error;
	}
}

export async function DELETE(_request: Request, context: Context) {
	const { eventSlug, resourceId } = await context.params;
	const db = await getDb();
	const auth = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!auth.ok) return auth.response;
	return (await deletePortalResource(db, auth.access.event.id, resourceId)) ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "Resource not found" }, { status: 404 });
}
