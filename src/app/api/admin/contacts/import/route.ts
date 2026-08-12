import { NextResponse } from "next/server";
import { authorizeContactsApi } from "@/lib/contacts/auth";
import { getDb } from "@/lib/db/cloudflare";

/** Direct CSV writes moved to preview → commit. */
export async function POST() {
	const db = await getDb();
	const auth = await authorizeContactsApi(db);
	if (!auth.ok) return auth.response;

	return NextResponse.json(
		{
			ok: false,
			error:
				"Preview the CSV first, then commit. Use POST /api/admin/contacts/import/preview and POST /api/admin/contacts/import/commit.",
		},
		{ status: 410 },
	);
}
