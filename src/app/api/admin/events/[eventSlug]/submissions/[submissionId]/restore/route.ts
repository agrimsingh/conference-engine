import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { broadcastEventInvalidate } from "@/lib/realtime/event-room";
import { restoreWithdrawnSubmission } from "@/lib/speakers/restore-withdrawn";

type RouteContext = {
	params: Promise<{ eventSlug: string; submissionId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
	const { eventSlug, submissionId } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;

	const result = await restoreWithdrawnSubmission(db, {
		submissionId,
		eventId: authorization.access.event.id,
	});
	if (!result.ok) {
		return NextResponse.json(
			{ ok: false, error: result.error },
			{ status: result.status },
		);
	}

	const broadcasted = await broadcastEventInvalidate(
		authorization.access.event.id,
		"submissions.restore",
	);
	return NextResponse.json({ ...result, broadcasted });
}
