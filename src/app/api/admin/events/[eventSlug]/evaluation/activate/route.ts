import { NextResponse } from "next/server";
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

	let body: Body = {};
	try {
		body = (await request.json()) as Body;
	} catch {
		body = {};
	}

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
