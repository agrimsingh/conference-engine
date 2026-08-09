import { NextResponse } from "next/server";
import { authorizeEventAdminApi } from "@/lib/auth/admin";
import { deliverableDownloadHeaders, resolveDeliverableVersion } from "@/lib/content/deliverables";
import { getDb, getFilesBucket } from "@/lib/db/cloudflare";

export async function GET(_request: Request, context: { params: Promise<{ eventSlug: string; taskId: string; versionId: string }> }) {
	const { eventSlug, taskId, versionId } = await context.params;
	const db = await getDb();
	const auth = await authorizeEventAdminApi(db, eventSlug);
	if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	const resolved = await resolveDeliverableVersion(db, { versionId, eventId: auth.event.id });
	if (!resolved || resolved.version.task_id !== taskId) return NextResponse.json({ ok: false, error: "Version not found" }, { status: 404 });
	const object = await (await getFilesBucket()).get(resolved.asset.r2_key);
	if (!object) return NextResponse.json({ ok: false, error: "Version not found" }, { status: 404 });
	return new Response(object.body, { headers: deliverableDownloadHeaders(resolved.asset) });
}
