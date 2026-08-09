import { NextResponse } from "next/server";
import { isAdminBypass } from "@/lib/auth/admin";
import { getCfpFieldAssetDownload } from "@/lib/assets/cfp-field-download";
import { authorizeReviewSubmissionAccess } from "@/lib/cfp/review-submission-access";
import { getDb, getFilesBucket } from "@/lib/db/cloudflare";
import { getAssetById, getEventBySlug, getSubmissionById } from "@/lib/db/queries";

type RouteContext = {
	params: Promise<{ submissionId: string; fieldKey: string }>;
};

export async function GET(request: Request, context: RouteContext) {
	const { submissionId, fieldKey } = await context.params;
	const url = new URL(request.url);
	const token = url.searchParams.get("token")?.trim() ?? "";
	const eventSlug = url.searchParams.get("eventSlug")?.trim() ?? "";

	const db = await getDb();
	let adminCommitteeEventId: string | undefined;
	if (!token && (await isAdminBypass())) {
		if (!eventSlug) {
			return NextResponse.json({ ok: false, error: "token or eventSlug required for admin download" }, { status: 400 });
		}
		const event = await getEventBySlug(db, eventSlug);
		if (!event) {
			return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
		}
		adminCommitteeEventId = event.id;
	}

	const access = await authorizeReviewSubmissionAccess(db, {
		token,
		submissionId,
		adminCommitteeEventId,
	});
	if (!access.ok) {
		return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
	}

	const files = await getFilesBucket();
	const result = await getCfpFieldAssetDownload({
		getSubmission: (id) => getSubmissionById(db, id),
		getAsset: (id) => getAssetById(db, id),
		getObject: (key) => files.get(key),
	}, {
		eventId: access.eventId,
		submissionId,
		fieldKey,
	});

	return result.ok
		? result.response
		: NextResponse.json({ ok: false, error: "Asset not found" }, { status: result.status });
}
