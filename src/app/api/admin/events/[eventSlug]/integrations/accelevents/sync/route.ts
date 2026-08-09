import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getCloudflareEnv, getDb } from "@/lib/db/cloudflare";
import { syncAcceleventsEvent } from "@/lib/integrations/accelevents/sync";

type RouteContext = { params: Promise<{ eventSlug: string }> };

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const parsed = await readBoundedJson(request, 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: "Expected a JSON object" }, { status: 400 });
	if (parsed.value.dryRun !== undefined && typeof parsed.value.dryRun !== "boolean") {
		return NextResponse.json({ ok: false, error: "dryRun must be a boolean" }, { status: 400 });
	}
	if (parsed.value.dryRun === false && parsed.value.confirmed !== true) {
		return NextResponse.json({ ok: false, error: "A reviewed preview is required before pushing Accelevents changes" }, { status: 400 });
	}
	const env = await getCloudflareEnv();
	if (!env.AUTH_SECRET) return NextResponse.json({ ok: false, error: "AUTH_SECRET is required to read Accelevents credentials" }, { status: 503 });
	const result = await syncAcceleventsEvent(db, {
		eventId: authorization.access.event.id,
		eventSlug: authorization.access.event.slug,
		appOrigin: env.APP_ORIGIN,
		timezone: authorization.access.event.timezone,
		secret: env.AUTH_SECRET,
		dryRun: parsed.value.dryRun !== false,
	});
	if (!result.configured) return NextResponse.json({ ok: false, error: "Configure Accelevents before running a sync" }, { status: 409 });
	return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
