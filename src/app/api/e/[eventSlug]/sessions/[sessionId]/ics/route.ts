import { NextResponse } from "next/server";
import { getCloudflareEnv, getDb } from "@/lib/db/cloudflare";
import { buildPublicSessionIcs } from "@/lib/sessions/public-ics";

type RouteContext = { params: Promise<{ eventSlug: string; sessionId: string }> };

export async function GET(_request: Request, context: RouteContext) {
	const { eventSlug, sessionId } = await context.params;
	const db = await getDb();
	const env = await getCloudflareEnv();
	const result = await buildPublicSessionIcs(db, {
		eventSlug,
		sessionId,
		organizerEmail: env.RESEND_FROM_EMAIL || "team@65labs.org",
	});
	if (!result.ok) {
		return NextResponse.json({ ok: false, error: "Not found" }, { status: result.status });
	}

	return new NextResponse(result.body, {
		headers: {
			"Content-Type": result.contentType,
			"Content-Disposition": `attachment; filename="${result.filename}"`,
			"Cache-Control": "public, max-age=300",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
