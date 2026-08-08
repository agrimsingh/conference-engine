import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { authorizeEventAdminApi } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	getActiveEvaluationPlan,
	listReviewersForPlan,
} from "@/lib/db/queries";
import {
	createReviewer,
	reviewPathForToken,
} from "@/lib/evaluation/reviewers";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

type Body = {
	name?: unknown;
};

function serializeReviewer(row: {
	id: string;
	name: string;
	token: string;
	created_at: number;
}) {
	return {
		id: row.id,
		name: row.name,
		token: row.token,
		reviewPath: reviewPathForToken(row.token),
		createdAt: row.created_at,
	};
}

export async function GET(_request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}
	const event = access.event;

	const plan = await getActiveEvaluationPlan(db, event.id);
	if (!plan) {
		return NextResponse.json(
			{ ok: false, error: "No active evaluation plan; activate one first" },
			{ status: 409 },
		);
	}

	const reviewers = await listReviewersForPlan(db, plan.id);
	return NextResponse.json({
		ok: true,
		plan: {
			id: plan.id,
			name: plan.name,
			status: plan.status,
			committeeToken: plan.reviewer_token,
			committeeReviewPath: reviewPathForToken(plan.reviewer_token),
		},
		reviewers: reviewers.map(serializeReviewer),
	});
}

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}
	const event = access.event;

	const plan = await getActiveEvaluationPlan(db, event.id);
	if (!plan) {
		return NextResponse.json(
			{ ok: false, error: "No active evaluation plan; activate one first" },
			{ status: 409 },
		);
	}

	const parsed = await readBoundedJson(request, 16 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	const body = parsed.value as Body;

	const name = typeof body.name === "string" ? body.name.trim() : "";
	if (!name) {
		return NextResponse.json(
			{ ok: false, error: "name is required" },
			{ status: 400 },
		);
	}

	const reviewer = await createReviewer(db, { planId: plan.id, name });
	return NextResponse.json({
		ok: true,
		reviewer: serializeReviewer(reviewer),
	});
}
