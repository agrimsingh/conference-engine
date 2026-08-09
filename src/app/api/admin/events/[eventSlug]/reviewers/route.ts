import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { authorizeEventAdminApi, authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	getActiveEvaluationPlan,
} from "@/lib/db/queries";
import {
	createReviewer,
	listPlanReviewers,
	regenerateReviewerToken,
	revokeReviewer,
	ReviewerValidationError,
	reviewPathForToken,
	sendReviewerInviteEmail,
} from "@/lib/evaluation/reviewers";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

type Body = {
	name?: unknown;
	email?: unknown;
	action?: unknown;
	reviewerId?: unknown;
};

function serializeReviewer(row: {
	id: string;
	name: string;
	email?: string | null;
	created_at: number;
	revoked_at?: number | null;
}) {
	return {
		id: row.id,
		name: row.name,
		email: row.email ?? null,
		createdAt: row.created_at,
		revokedAt: row.revoked_at ?? null,
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

	const reviewers = await listPlanReviewers(db, plan.id);
	return NextResponse.json({
		ok: true,
		plan: {
			id: plan.id,
			name: plan.name,
			status: plan.status,
		},
		reviewers: reviewers.map(serializeReviewer),
	});
}

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const event = authorization.access.event;

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

	try {
		const issued = await createReviewer(db, {
			planId: plan.id,
			name,
			email: typeof body.email === "string" || body.email === null ? body.email : undefined,
		});
		const email = await sendReviewerInviteEmail(db, {
			event,
			reviewer: issued.reviewer,
			token: issued.token,
			origin: new URL(request.url).origin,
		});
		return NextResponse.json({
			ok: true,
			reviewer: { ...serializeReviewer(issued.reviewer), reviewPath: reviewPathForToken(issued.token) },
			emailStatus: email ? email.status : null,
		});
	} catch (error) {
		if (error instanceof ReviewerValidationError) {
			return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
		}
		throw error;
	}
}

export async function PATCH(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const plan = await getActiveEvaluationPlan(db, authorization.access.event.id);
	if (!plan) return NextResponse.json({ ok: false, error: "No active evaluation plan; activate one first" }, { status: 409 });
	const parsed = await readBoundedJson(request, 16 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	const body = parsed.value as Body;
	if (typeof body.reviewerId !== "string" || !body.reviewerId.trim() || (body.action !== "regenerate" && body.action !== "revoke")) {
		return NextResponse.json({ ok: false, error: "Expected reviewerId and action regenerate or revoke" }, { status: 400 });
	}
	try {
		if (body.action === "revoke") {
			const result = await revokeReviewer(db, { planId: plan.id, reviewerId: body.reviewerId });
			return NextResponse.json({ ok: true, reviewer: serializeReviewer(result) });
		}
		const result = await regenerateReviewerToken(db, {
			planId: plan.id,
			reviewerId: body.reviewerId,
			email: typeof body.email === "string" || body.email === null ? body.email : undefined,
		});
		const email = await sendReviewerInviteEmail(db, {
			event: authorization.access.event,
			reviewer: result.reviewer,
			token: result.token,
			origin: new URL(request.url).origin,
		});
		return NextResponse.json({
			ok: true,
			reviewer: { ...serializeReviewer(result.reviewer), reviewPath: reviewPathForToken(result.token) },
			emailStatus: email ? email.status : null,
		});
	} catch (error) {
		if (error instanceof ReviewerValidationError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
		throw error;
	}
}
