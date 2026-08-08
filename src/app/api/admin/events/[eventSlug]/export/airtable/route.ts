import { NextResponse } from "next/server";
import { authorizeEventAdminApi } from "@/lib/auth/admin";
import { getCloudflareEnv, getDb } from "@/lib/db/cloudflare";
import {
	AIRTABLE_NOT_CONFIGURED_ERROR,
	pushSubmissionsToAirtable,
	resolveAirtableConfig,
} from "@/lib/export/airtable";
import { loadSubmissionExportForSlug } from "@/lib/export/submissions-csv";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
	const env = await getCloudflareEnv();
	const config = resolveAirtableConfig(env);
	if (!config) {
		return NextResponse.json(
			{ ok: false, error: AIRTABLE_NOT_CONFIGURED_ERROR },
			{ status: 503 },
		);
	}

	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const loaded = await loadSubmissionExportForSlug(db, eventSlug);
	if (!loaded.ok) {
		return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
	}

	const result = await pushSubmissionsToAirtable(config, loaded.rows);
	if (!result.ok) {
		return NextResponse.json(
			{ ok: false, error: result.error },
			{ status: result.status },
		);
	}

	return NextResponse.json({
		ok: true,
		created: result.created,
		total: loaded.rows.length,
	});
}
