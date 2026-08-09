import { NextResponse } from "next/server";
import { authorizeEventAdminApi } from "@/lib/auth/admin";
import { loadCockpitSnapshot } from "@/lib/cockpit/snapshot";
import { getDb } from "@/lib/db/cloudflare";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const snapshot = await loadCockpitSnapshot(db, access.event);
	return NextResponse.json({ ok: true, snapshot });
}
