import { NextResponse } from "next/server";
import { authorizeEventAdminApi, authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { createEvaluationPlan, EvaluationPlanValidationError, listEvaluationPlans } from "@/lib/evaluation/plan";

type Context = { params: Promise<{ eventSlug: string }> };

export async function GET(_request: Request, context: Context) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	return NextResponse.json({ ok: true, plans: (await listEvaluationPlans(db, access.event.id)).map(serializePlan) });
}

export async function POST(request: Request, context: Context) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const parsed = await readBoundedJson(request, 16 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value) || typeof parsed.value.name !== "string") return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
	try {
		const plan = await createEvaluationPlan(db, { eventId: authorization.access.event.id, name: parsed.value.name });
		return NextResponse.json({ ok: true, plan: serializePlan(plan) }, { status: 201 });
	} catch (error) {
		if (error instanceof EvaluationPlanValidationError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
		throw error;
	}
}

function serializePlan(plan: { id: string; event_id: string; name: string; status: string; created_at: number; updated_at: number }) {
	return { id: plan.id, eventId: plan.event_id, name: plan.name, status: plan.status, createdAt: plan.created_at, updatedAt: plan.updated_at };
}
