import { NextResponse } from "next/server";
import { authorizeEventAdminApi, authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { deleteDraftEvaluationPlan, EvaluationPlanValidationError, getEvaluationPlanForEvent, listCriteria, updateEvaluationPlan } from "@/lib/evaluation/plan";

type Context = { params: Promise<{ eventSlug: string; planId: string }> };

export async function GET(_request: Request, context: Context) {
	const { eventSlug, planId } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	const plan = await getEvaluationPlanForEvent(db, { eventId: access.event.id, planId });
	if (!plan) return NextResponse.json({ ok: false, error: "Evaluation plan not found" }, { status: 404 });
	return NextResponse.json({ ok: true, plan: serializePlan(plan), criteria: await listCriteria(db, plan.id) });
}

export async function PATCH(request: Request, context: Context) {
	const { eventSlug, planId } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const parsed = await readBoundedJson(request, 16 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	const { name, status, openAt, closeAt, blindReview, assignmentCap } = parsed.value;
	if (name !== undefined && typeof name !== "string") return NextResponse.json({ ok: false, error: "name must be a string" }, { status: 400 });
	if (status !== undefined && status !== "draft" && status !== "closed") return NextResponse.json({ ok: false, error: "status must be draft or closed" }, { status: 400 });
	for (const [key, value] of Object.entries({ openAt, closeAt, assignmentCap })) if (value !== undefined && value !== null && typeof value !== "number") return NextResponse.json({ ok: false, error: `${key} must be a number or null` }, { status: 400 });
	if (blindReview !== undefined && typeof blindReview !== "boolean") return NextResponse.json({ ok: false, error: "blindReview must be boolean" }, { status: 400 });
	try {
		const plan = await updateEvaluationPlan(db, { eventId: authorization.access.event.id, planId, name, status, openAt: openAt as number | null | undefined, closeAt: closeAt as number | null | undefined, blindReview: blindReview as boolean | undefined, assignmentCap: assignmentCap as number | null | undefined });
		return NextResponse.json({ ok: true, plan: serializePlan(plan) });
	} catch (error) {
		if (error instanceof EvaluationPlanValidationError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
		throw error;
	}
}

function serializePlan(plan: { id: string; event_id: string; name: string; status: string; open_at: number | null; close_at: number | null; blind_review: number; assignment_cap: number | null; created_at: number; updated_at: number }) {
	return { id: plan.id, eventId: plan.event_id, name: plan.name, status: plan.status, openAt: plan.open_at, closeAt: plan.close_at, blindReview: plan.blind_review === 1, assignmentCap: plan.assignment_cap, createdAt: plan.created_at, updatedAt: plan.updated_at };
}

export async function DELETE(_request: Request, context: Context) {
	const { eventSlug, planId } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	try {
		await deleteDraftEvaluationPlan(db, { eventId: authorization.access.event.id, planId });
		return NextResponse.json({ ok: true });
	} catch (error) {
		if (error instanceof EvaluationPlanValidationError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
		throw error;
	}
}
