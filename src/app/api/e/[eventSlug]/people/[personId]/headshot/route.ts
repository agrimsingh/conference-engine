import { NextResponse } from "next/server";
import { getPublicHeadshot } from "@/lib/assets/public-headshot";
import { getDb, getFilesBucket } from "@/lib/db/cloudflare";
import { getEventBySlug, resolvePublicHeadshotAsset } from "@/lib/db/queries";

type RouteContext = { params: Promise<{ eventSlug: string; personId: string }> };

export async function GET(_request: Request, context: RouteContext) {
	const { eventSlug, personId } = await context.params;
	if (!personId || personId.length > 128) {
		return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
	}

	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) {
		return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
	}

	const files = await getFilesBucket();
	const result = await getPublicHeadshot(
		{
			resolvePublicHeadshotAsset: (args) =>
				resolvePublicHeadshotAsset(db, args.eventId, args.personId),
			getObject: (key) => files.get(key),
		},
		{ eventId: event.id, personId },
	);

	return result.ok
		? result.response
		: NextResponse.json({ ok: false, error: "Not found" }, { status: result.status });
}
