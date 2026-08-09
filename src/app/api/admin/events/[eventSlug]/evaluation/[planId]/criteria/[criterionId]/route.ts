import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { deleteCriterion, EvaluationPlanValidationError, getEvaluationPlanForEvent, updateCriterion } from "@/lib/evaluation/plan";

type Context = { params: Promise<{ eventSlug: string; planId: string; criterionId: string }> };

export async function PATCH(request: Request, context: Context) {
	const { eventSlug, planId, criterionId } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	if (!await getEvaluationPlanForEvent(db, { eventId: authorization.access.event.id, planId })) return NextResponse.json({ ok: false, error: "Evaluation plan not found" }, { status: 404 });
	const parsed = await readBoundedJson(request, 16 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	const body = parsed.value;
	for (const key of ["label", "description"]) if (body[key] !== undefined && typeof body[key] !== "string" && !(key === "description" && body[key] === null)) return NextResponse.json({ ok: false, error: `${key} must be a string` }, { status: 400 });
	for (const key of ["weight", "scaleMin", "scaleMax", "position"]) if (body[key] !== undefined && typeof body[key] !== "number") return NextResponse.json({ ok: false, error: `${key} must be a number` }, { status: 400 });
	try {
		const criterion = await updateCriterion(db, { planId, criterionId, label: body.label as string | undefined, description: body.description as string | null | undefined, weight: body.weight as number | undefined, scaleMin: body.scaleMin as number | undefined, scaleMax: body.scaleMax as number | undefined, position: body.position as number | undefined });
		return NextResponse.json({ ok: true, criterion });
	} catch (error) {
		if (error instanceof EvaluationPlanValidationError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
		throw error;
	}
}

export async function DELETE(_request: Request, context: Context) {
	const { eventSlug, planId, criterionId } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	if (!await getEvaluationPlanForEvent(db, { eventId: authorization.access.event.id, planId })) return NextResponse.json({ ok: false, error: "Evaluation plan not found" }, { status: 404 });
	try {
		await deleteCriterion(db, { planId, criterionId });
		return NextResponse.json({ ok: true });
	} catch (error) {
		if (error instanceof EvaluationPlanValidationError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
		throw error;
	}
}
