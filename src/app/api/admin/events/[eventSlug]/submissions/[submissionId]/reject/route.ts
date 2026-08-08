import { NextResponse } from "next/server";
import { isAdminBypass } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { getEventBySlug, getSubmissionById } from "@/lib/db/queries";
import { rejectSubmission } from "@/lib/speakers/reject";

type RouteContext = {
	params: Promise<{ eventSlug: string; submissionId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
	if (!(await isAdminBypass())) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const { eventSlug, submissionId } = await context.params;
	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) {
		return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
	}

	const submission = await getSubmissionById(db, submissionId);
	if (!submission || submission.event_id !== event.id) {
		return NextResponse.json({ ok: false, error: "Submission not found" }, { status: 404 });
	}

	const result = await rejectSubmission(db, submissionId);
	if (!result.ok) {
		return NextResponse.json(
			{ ok: false, error: result.error },
			{ status: result.status ?? 400 },
		);
	}

	return NextResponse.json(result);
}
