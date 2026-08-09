import { NextResponse } from "next/server";
import { deliverableDownloadHeaders, resolveDeliverableVersion } from "@/lib/content/deliverables";
import { getDb, getFilesBucket } from "@/lib/db/cloudflare";
import { readPortalSessionFromCookie } from "@/lib/speakers/portal-session";

export async function GET(_request: Request, context: { params: Promise<{ taskId: string; versionId: string }> }) {
	const session = await readPortalSessionFromCookie();
	if (!session) return NextResponse.json({ ok: false, error: "Invalid or expired token" }, { status: 401 });
	const { taskId, versionId } = await context.params;
	const db = await getDb();
	const resolved = await resolveDeliverableVersion(db, { versionId, personId: session.personId });
	if (!resolved || resolved.version.task_id !== taskId) return NextResponse.json({ ok: false, error: "Version not found" }, { status: 404 });
	const object = await (await getFilesBucket()).get(resolved.asset.r2_key);
	if (!object) return NextResponse.json({ ok: false, error: "Version not found" }, { status: 404 });
	return new Response(object.body, { headers: deliverableDownloadHeaders(resolved.asset) });
}
