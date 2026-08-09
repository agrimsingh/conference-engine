import { NextResponse } from "next/server";
import { authorizeEventAdminApi } from "@/lib/auth/admin";
import { getDb, getFilesBucket } from "@/lib/db/cloudflare";
import { exportSubmissionUploadsForSlug } from "@/lib/export/submission-uploads-zip";

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

	const result = await exportSubmissionUploadsForSlug(
		db,
		await getFilesBucket(),
		eventSlug,
	);
	if (!result.ok) {
		return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
	}

	const body = new Uint8Array(result.body.byteLength);
	body.set(result.body);
	const filename = `${result.eventSlug}-submission-uploads.zip`;
	return new Response(body.buffer, {
		headers: {
			"Content-Type": "application/zip",
			"Content-Disposition": `attachment; filename="${filename}"`,
			"Cache-Control": "private, no-store",
			"X-Content-Type-Options": "nosniff",
			"X-Upload-Count": String(result.count),
		},
	});
}
