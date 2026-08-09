import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { getActiveEvaluationPlan } from "@/lib/db/queries";
import { getEvaluationPlanForEvent } from "@/lib/evaluation/plan";
import { AssignmentValidationError, setBulkSubmissionReviewers } from "@/lib/evaluation/assignments";
import { broadcastEventInvalidate } from "@/lib/realtime/event-room";

type Context = { params: Promise<{ eventSlug: string }> };

function ids(value: unknown): string[] | null {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
	return value;
}

export async function POST(request: Request, context: Context) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const parsed = await readBoundedJson(request, 64 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	const requestedPlanId = typeof parsed.value.planId === "string" ? parsed.value.planId : null;
	const plan = requestedPlanId
		? await getEvaluationPlanForEvent(db, { eventId: authorization.access.event.id, planId: requestedPlanId })
		: await getActiveEvaluationPlan(db, authorization.access.event.id);
	if (!plan) return NextResponse.json({ ok: false, error: "No active evaluation plan; activate one first" }, { status: 409 });
	if (plan.status !== "active") return NextResponse.json({ ok: false, error: "Review round must be active before assigning" }, { status: 409 });
	const submissionIds = ids(parsed.value.submissionIds);
	const reviewerIds = ids(parsed.value.reviewerIds);
	if (!submissionIds || !reviewerIds) return NextResponse.json({ ok: false, error: "submissionIds and reviewerIds must be arrays of strings" }, { status: 400 });
	try {
		const result = await setBulkSubmissionReviewers(db, { planId: plan.id, submissionIds, reviewerIds });
		const broadcasted = await broadcastEventInvalidate(authorization.access.event.id, "review.assignments");
		return NextResponse.json({ ok: true, ...result, broadcasted });
	} catch (error) {
		if (error instanceof AssignmentValidationError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
		throw error;
	}
}
