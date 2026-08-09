import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getCloudflareEnv, getDb } from "@/lib/db/cloudflare";
import {
	getAirtableSyncEnabled,
	setAirtableSyncEnabled,
} from "@/lib/export/airtable-sync";
import { resolveAirtableConfig, AIRTABLE_NOT_CONFIGURED_ERROR } from "@/lib/export/airtable";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;

	const enabled = await getAirtableSyncEnabled(db, authorization.access.event.id);
	const configured = resolveAirtableConfig(await getCloudflareEnv()) !== null;

	return NextResponse.json({
		ok: true,
		enabled,
		configured,
	});
}

export async function PATCH(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;

	const parsed = await readBoundedJson(request, 1024);
	if (!parsed.ok) {
		return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	}
	if (!isJsonObject(parsed.value) || typeof parsed.value.enabled !== "boolean") {
		return NextResponse.json({ ok: false, error: "enabled must be a boolean" }, { status: 400 });
	}

	if (parsed.value.enabled) {
		if (!resolveAirtableConfig(await getCloudflareEnv())) {
			return NextResponse.json(
				{ ok: false, error: AIRTABLE_NOT_CONFIGURED_ERROR },
				{ status: 503 },
			);
		}
	}

	await setAirtableSyncEnabled(db, authorization.access.event.id, parsed.value.enabled);
	return NextResponse.json({ ok: true, enabled: parsed.value.enabled });
}
