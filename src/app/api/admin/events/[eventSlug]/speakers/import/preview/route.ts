import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { previewSpeakerRosterCsv } from "@/lib/speakers/roster";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;

	const parsed = await readBoundedJson(request, 512 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value) || typeof parsed.value.csv !== "string") {
		return NextResponse.json({ ok: false, error: "Expected { csv }" }, { status: 400 });
	}
	if (parsed.value.csv.length > 512 * 1024) {
		return NextResponse.json({ ok: false, error: "CSV is too large" }, { status: 413 });
	}

	const preview = await previewSpeakerRosterCsv(db, {
		eventId: authorization.access.event.id,
		csv: parsed.value.csv,
	});
	if (!preview.ok) return NextResponse.json(preview, { status: 400 });
	return NextResponse.json(preview);
}
