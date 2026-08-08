import { NextResponse } from "next/server";
import { isAdminBypass } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	loadSubmissionExportForSlug,
	submissionsToCsv,
} from "@/lib/export/submissions-csv";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	if (!(await isAdminBypass())) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const { eventSlug } = await context.params;
	const db = await getDb();
	const loaded = await loadSubmissionExportForSlug(db, eventSlug);
	if (!loaded.ok) {
		return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
	}

	const csv = submissionsToCsv(loaded.rows);
	const filename = `${loaded.eventSlug}-submissions.csv`;
	return new NextResponse(csv, {
		status: 200,
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="${filename}"`,
			"Cache-Control": "no-store",
		},
	});
}
