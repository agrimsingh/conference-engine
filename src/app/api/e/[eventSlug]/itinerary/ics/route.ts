import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/cloudflare";
import { buildPublicItineraryIcs } from "@/lib/schedule/public-itinerary-ics";

type RouteContext = { params: Promise<{ eventSlug: string }> };

export async function POST(request: Request, context: RouteContext) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
	}
	if (
		typeof body !== "object" ||
		body === null ||
		!("sessionIds" in body) ||
		!Array.isArray(body.sessionIds) ||
		body.sessionIds.length === 0 ||
		body.sessionIds.length > 100 ||
		body.sessionIds.some((id) => typeof id !== "string" || id.length === 0 || id.length > 200)
	) {
		return NextResponse.json({ ok: false, error: "Choose at least one session" }, { status: 400 });
	}

	const { eventSlug } = await context.params;
	const result = await buildPublicItineraryIcs(await getDb(), {
		eventSlug,
		sessionIds: body.sessionIds,
	});
	if (!result.ok) {
		return NextResponse.json(
			{ ok: false, error: result.status === 404 ? "Selected session not found" : "Invalid selection" },
			{ status: result.status },
		);
	}

	return new NextResponse(result.body, {
		headers: {
			"Content-Type": result.contentType,
			"Content-Disposition": `attachment; filename="${result.filename}"`,
			"Cache-Control": "private, no-store",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
