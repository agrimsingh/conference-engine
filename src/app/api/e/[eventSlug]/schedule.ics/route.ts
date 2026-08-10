import { NextResponse } from "next/server";
import { getCloudflareEnv, getDb } from "@/lib/db/cloudflare";
import { buildPublicScheduleIcs } from "@/lib/schedule/public-schedule-ics";

type RouteContext = { params: Promise<{ eventSlug: string }> };

export async function GET(_request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const env = await getCloudflareEnv();
	const result = await buildPublicScheduleIcs(db, {
		eventSlug,
		organizerEmail: env.RESEND_FROM_EMAIL || "team@65labs.org",
	});
	if (!result.ok) {
		return NextResponse.json({ ok: false, error: "Not found" }, { status: result.status });
	}

	return new NextResponse(result.body, {
		headers: {
			"Content-Type": result.contentType,
			"Content-Disposition": `attachment; filename="${result.filename}"`,
			"Cache-Control": "public, max-age=60",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
