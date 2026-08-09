import { NextResponse } from "next/server";
import { authorizeEventAdminApi } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { loadSubmissionExportForSlug } from "@/lib/export/submissions-csv";
import { submissionsToXlsx } from "@/lib/export/submissions-xlsx";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const loaded = await loadSubmissionExportForSlug(db, eventSlug);
	if (!loaded.ok) {
		return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
	}

	const xlsx = submissionsToXlsx(loaded.rows);
	const filename = `${loaded.eventSlug}-submissions.xlsx`;
	const body = new Uint8Array(xlsx.byteLength);
	body.set(xlsx);
	return new NextResponse(body, {
		status: 200,
		headers: {
			"Content-Type":
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			"Content-Disposition": `attachment; filename="${filename}"`,
			"Cache-Control": "no-store",
		},
	});
}
