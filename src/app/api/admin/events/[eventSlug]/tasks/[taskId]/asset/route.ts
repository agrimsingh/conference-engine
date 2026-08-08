import { NextResponse } from "next/server";
import { authorizeEventAdminApi } from "@/lib/auth/admin";
import { getDb, getFilesBucket } from "@/lib/db/cloudflare";
import { getAssetById, getSpeakerTaskById } from "@/lib/db/queries";
import { getOrganizerAssetDownload } from "@/lib/assets/organizer-download";

type RouteContext = { params: Promise<{ eventSlug: string; taskId: string }> };

export async function GET(_request: Request, context: RouteContext) {
	const { eventSlug, taskId } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access || !access.account || !access.membership) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}
	const files = await getFilesBucket();
	const result = await getOrganizerAssetDownload({
		getTask: (id) => getSpeakerTaskById(db, id),
		getAsset: (id) => getAssetById(db, id),
		getObject: (key) => files.get(key),
	}, { eventId: access.event.id, taskId });
	return result.ok ? result.response : NextResponse.json({ ok: false, error: "Asset not found" }, { status: result.status });
}
