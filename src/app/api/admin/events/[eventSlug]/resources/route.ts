import { NextResponse } from "next/server";
import { authorizeEventAdminApi, authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { createPortalResource, listOrganizerPortalResources, parsePortalResourceInput } from "@/lib/resources/resources";

type Context = { params: Promise<{ eventSlug: string }> };

export async function GET(_request: Request, context: Context) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	return NextResponse.json({ ok: true, resources: await listOrganizerPortalResources(db, access.event.id) });
}

export async function POST(request: Request, context: Context) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const auth = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!auth.ok) return auth.response;
	const body = await readBoundedJson(request, 24 * 1024);
	if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: body.status });
	if (!isJsonObject(body.value)) return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	const parsed = parsePortalResourceInput(body.value);
	if (!parsed.ok) return NextResponse.json(parsed, { status: 400 });
	try {
		return NextResponse.json({ ok: true, resource: await createPortalResource(db, auth.access.event.id, parsed.value) }, { status: 201 });
	} catch (error) {
		if (error instanceof Error && /UNIQUE/.test(error.message)) return NextResponse.json({ ok: false, error: "That resource slug is already in use" }, { status: 409 });
		throw error;
	}
}
