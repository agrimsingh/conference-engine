import { NextResponse } from "next/server";
import { authorizeEventAdminApi } from "@/lib/auth/admin";
import { getCfpFieldAssetDownload } from "@/lib/assets/cfp-field-download";
import { getDb, getFilesBucket } from "@/lib/db/cloudflare";
import { getAssetById, getSubmissionById } from "@/lib/db/queries";

type RouteContext = {
	params: Promise<{ eventSlug: string; submissionId: string; fieldKey: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	const { eventSlug, submissionId, fieldKey } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access || !access.account || !access.membership) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const files = await getFilesBucket();
	const result = await getCfpFieldAssetDownload({
		getSubmission: (id) => getSubmissionById(db, id),
		getAsset: (id) => getAssetById(db, id),
		getObject: (key) => files.get(key),
	}, {
		eventId: access.event.id,
		submissionId,
		fieldKey,
	});

	return result.ok
		? result.response
		: NextResponse.json({ ok: false, error: "Asset not found" }, { status: result.status });
}
