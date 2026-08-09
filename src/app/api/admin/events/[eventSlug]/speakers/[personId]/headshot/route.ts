import { NextResponse } from "next/server";
import { authorizeEventAdminApi } from "@/lib/auth/admin";
import { getDb, getFilesBucket } from "@/lib/db/cloudflare";
import { resolveSpeakerHeadshot } from "@/lib/speakers/headshot";

export async function GET(_request: Request, context: { params: Promise<{ eventSlug: string; personId: string }> }) {
	const { eventSlug, personId } = await context.params;
	const db = await getDb(); const auth = await authorizeEventAdminApi(db, eventSlug);
	if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	const asset = await resolveSpeakerHeadshot(db, { eventId: auth.event.id, personId });
	if (!asset) return NextResponse.json({ ok: false, error: "Headshot not found" }, { status: 404 });
	const object = await (await getFilesBucket()).get(asset.r2_key);
	if (!object) return NextResponse.json({ ok: false, error: "Headshot not found" }, { status: 404 });
	return new Response(object.body, { headers: { "content-type": asset.content_type || "application/octet-stream", "content-disposition": `inline; filename="${(asset.filename || "headshot").replace(/["\\]/g, "_")}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
