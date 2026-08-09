import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/cloudflare";
import { buildPublicScheduleJson } from "@/lib/schedule/public-json";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const payload = await buildPublicScheduleJson(db, eventSlug);
	if (!payload) {
		return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
	}

	return NextResponse.json(payload, {
		headers: {
			"Cache-Control": "public, max-age=60, stale-while-revalidate=300",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
