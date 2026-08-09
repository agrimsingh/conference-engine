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
	const { name, status } = parsed.value;
	if (name !== undefined && typeof name !== "string") return NextResponse.json({ ok: false, error: "name must be a string" }, { status: 400 });
	if (status !== undefined && status !== "draft" && status !== "closed") return NextResponse.json({ ok: false, error: "status must be draft or closed" }, { status: 400 });
	try {
		const plan = await updateEvaluationPlan(db, { eventId: authorization.access.event.id, planId, name, status });
		return NextResponse.json({ ok: true, plan: serializePlan(plan) });
	} catch (error) {
		if (error instanceof EvaluationPlanValidationError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
		throw error;
	}
}

function serializePlan(plan: { id: string; event_id: string; name: string; status: string; created_at: number; updated_at: number }) {
	return { id: plan.id, eventId: plan.event_id, name: plan.name, status: plan.status, createdAt: plan.created_at, updatedAt: plan.updated_at };
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
