import { NextResponse } from "next/server";
import { authorizeEventAdminApi, authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { createCriterion, EvaluationPlanValidationError, getEvaluationPlanForEvent, listCriteria } from "@/lib/evaluation/plan";

type Context = { params: Promise<{ eventSlug: string; planId: string }> };

export async function GET(_request: Request, context: Context) {
	const { eventSlug, planId } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	const plan = await getEvaluationPlanForEvent(db, { eventId: access.event.id, planId });
	if (!plan) return NextResponse.json({ ok: false, error: "Evaluation plan not found" }, { status: 404 });
	return NextResponse.json({ ok: true, criteria: await listCriteria(db, plan.id) });
}

export async function POST(request: Request, context: Context) {
	const { eventSlug, planId } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	if (!await getEvaluationPlanForEvent(db, { eventId: authorization.access.event.id, planId })) return NextResponse.json({ ok: false, error: "Evaluation plan not found" }, { status: 404 });
	const parsed = await readBoundedJson(request, 16 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value) || typeof parsed.value.label !== "string" || typeof parsed.value.weight !== "number") return NextResponse.json({ ok: false, error: "label and numeric weight are required" }, { status: 400 });
	const body = parsed.value;
	if (body.description !== undefined && typeof body.description !== "string") return NextResponse.json({ ok: false, error: "description must be a string" }, { status: 400 });
	if (body.scaleMin !== undefined && typeof body.scaleMin !== "number") return NextResponse.json({ ok: false, error: "scaleMin must be a number" }, { status: 400 });
	if (body.scaleMax !== undefined && typeof body.scaleMax !== "number") return NextResponse.json({ ok: false, error: "scaleMax must be a number" }, { status: 400 });
	try {
		const criterion = await createCriterion(db, { planId, label: body.label as string, description: body.description as string | undefined, weight: body.weight as number, scaleMin: body.scaleMin as number | undefined, scaleMax: body.scaleMax as number | undefined });
		return NextResponse.json({ ok: true, criterion }, { status: 201 });
	} catch (error) {
		if (error instanceof EvaluationPlanValidationError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
		throw error;
	}
}
