import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getCloudflareEnv, getDb } from "@/lib/db/cloudflare";
import { getActiveEvaluationPlan } from "@/lib/db/queries";
import { listEvaluationPlans } from "@/lib/evaluation/plan";
import { sendOutstandingReviewerReminders } from "@/lib/email/reviewer-reminders";
import { broadcastEventInvalidate } from "@/lib/realtime/event-room";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const event = authorization.access.event;

	let planId: string | undefined;
	const contentType = request.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		const parsed = await readBoundedJson(request, 16 * 1024);
		if (!parsed.ok || !isJsonObject(parsed.value)) {
			return NextResponse.json(
				{ ok: false, error: parsed.ok ? "Expected JSON object" : parsed.error },
				{ status: parsed.ok ? 400 : parsed.status },
			);
		}
		const raw = parsed.value.planId;
		if (raw !== undefined) {
			if (typeof raw !== "string" || !raw.trim()) {
				return NextResponse.json({ ok: false, error: "planId must be a non-empty string" }, { status: 400 });
			}
			planId = raw.trim();
		}
	}

	const plans = await listEvaluationPlans(db, event.id);
	const active = await getActiveEvaluationPlan(db, event.id);
	const plan = (planId ? plans.find((item) => item.id === planId) : null) ?? active ?? null;
	if (!plan) {
		return NextResponse.json({ ok: false, error: "No evaluation plan" }, { status: 404 });
	}

	const env = await getCloudflareEnv();
	const result = await sendOutstandingReviewerReminders(env, {
		eventId: event.id,
		planId: plan.id,
	});
	if (result.configurationError) {
		return NextResponse.json({ ok: false, error: result.configurationError }, { status: 503 });
	}

	const broadcasted =
		result.sent > 0 ? await broadcastEventInvalidate(event.id, "email.reviewer_reminders") : false;
	return NextResponse.json({
		ok: true,
		sent: result.sent,
		skipped: result.skipped,
		planId: plan.id,
		broadcasted,
	});
}
