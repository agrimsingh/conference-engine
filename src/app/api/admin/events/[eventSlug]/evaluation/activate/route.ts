import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { authorizeEventAdminApi } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { activateEvaluationPlan } from "@/lib/evaluation/plan";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

type Body = {
	name?: unknown;
};

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}
	const event = access.event;

	const parsed = await readBoundedJson(request, 16 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	const body = parsed.value as Body;

	const name = typeof body.name === "string" ? body.name : undefined;
	const result = await activateEvaluationPlan(db, {
		eventId: event.id,
		name,
	});

	if (!result.ok) {
		return NextResponse.json(
			{ ok: false, error: result.error },
			{ status: result.status },
		);
	}

	return NextResponse.json({
		ok: true,
		created: result.created,
		plan: {
			id: result.plan.id,
			name: result.plan.name,
			status: result.plan.status,
			reviewerToken: result.plan.reviewer_token,
			reviewPath: `/review?token=${result.plan.reviewer_token}`,
		},
	});
}
