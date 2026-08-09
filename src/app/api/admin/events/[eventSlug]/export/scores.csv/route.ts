import { NextResponse } from "next/server";
import { authorizeEventAdminApi } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { loadReviewScoresExportForSlug, reviewScoresToCsv } from "@/lib/export/review-scores-csv";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const planId = new URL(request.url).searchParams.get("plan");
	const loaded = await loadReviewScoresExportForSlug(db, eventSlug, planId);
	if (!loaded.ok) {
		const error = loaded.error === "not_found" ? "Event not found" : "No evaluation plan";
		return NextResponse.json({ ok: false, error }, { status: 404 });
	}

	const csv = reviewScoresToCsv(loaded.data);
	const filename = `${loaded.data.eventSlug}-review-scores.csv`;
	return new NextResponse(csv, {
		status: 200,
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="${filename}"`,
			"Cache-Control": "no-store",
		},
	});
}
