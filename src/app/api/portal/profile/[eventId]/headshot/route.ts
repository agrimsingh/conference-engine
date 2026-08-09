import { NextResponse } from "next/server";
import { getDb, getFilesBucket } from "@/lib/db/cloudflare";
import { resolveSpeakerHeadshot } from "@/lib/speakers/headshot";
import { readPortalSessionFromCookie } from "@/lib/speakers/portal-session";

export async function GET(_request: Request, context: { params: Promise<{ eventId: string }> }) {
	const session = await readPortalSessionFromCookie();
	if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	const { eventId } = await context.params;
	const asset = await resolveSpeakerHeadshot(await getDb(), { eventId, personId: session.personId });
	if (!asset) return NextResponse.json({ ok: false, error: "Headshot not found" }, { status: 404 });
	const object = await (await getFilesBucket()).get(asset.r2_key);
	if (!object) return NextResponse.json({ ok: false, error: "Headshot not found" }, { status: 404 });
	return new Response(object.body, { headers: { "content-type": asset.content_type || "application/octet-stream", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
