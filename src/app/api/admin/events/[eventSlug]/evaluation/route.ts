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
	for (const key of ["openAt", "closeAt", "assignmentCap"] as const) if (parsed.value[key] !== undefined && parsed.value[key] !== null && typeof parsed.value[key] !== "number") return NextResponse.json({ ok: false, error: `${key} must be a number or null` }, { status: 400 });
	if (parsed.value.blindReview !== undefined && typeof parsed.value.blindReview !== "boolean") return NextResponse.json({ ok: false, error: "blindReview must be boolean" }, { status: 400 });
	try {
		const body = parsed.value;
		const plan = await createEvaluationPlan(db, {
			eventId: authorization.access.event.id,
			name: body.name as string,
			openAt: optionalNumber(body.openAt),
			closeAt: optionalNumber(body.closeAt),
			blindReview: body.blindReview === true,
			assignmentCap: optionalNumber(body.assignmentCap),
		});
		return NextResponse.json({ ok: true, plan: serializePlan(plan) }, { status: 201 });
	} catch (error) {
		if (error instanceof EvaluationPlanValidationError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
		throw error;
	}
}

function serializePlan(plan: { id: string; event_id: string; name: string; status: string; open_at: number | null; close_at: number | null; blind_review: number; assignment_cap: number | null; created_at: number; updated_at: number }) {
	return { id: plan.id, eventId: plan.event_id, name: plan.name, status: plan.status, openAt: plan.open_at, closeAt: plan.close_at, blindReview: plan.blind_review === 1, assignmentCap: plan.assignment_cap, createdAt: plan.created_at, updatedAt: plan.updated_at };
}

function optionalNumber(value: unknown): number | null | undefined {
	return value === null ? null : typeof value === "number" ? value : undefined;
}
