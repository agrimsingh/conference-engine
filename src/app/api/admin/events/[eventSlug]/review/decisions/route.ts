import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { bulkDecideSubmissions, BulkDecisionValidationError, parseBulkDecisionEmail } from "@/lib/evaluation/decisions";
import { broadcastEventInvalidate } from "@/lib/realtime/event-room";

type Context = { params: Promise<{ eventSlug: string }> };

export async function POST(request: Request, context: Context) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const parsed = await readBoundedJson(request, 64 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value) || !Array.isArray(parsed.value.submissionIds) || parsed.value.submissionIds.some((id) => typeof id !== "string") || (parsed.value.action !== "accept" && parsed.value.action !== "reject")) {
		return NextResponse.json({ ok: false, error: "Expected submissionIds and action accept or reject" }, { status: 400 });
	}
	try {
		const email = parseBulkDecisionEmail(parsed.value.email);
		const result = await bulkDecideSubmissions(db, {
			eventId: authorization.access.event.id,
			submissionIds: parsed.value.submissionIds,
			action: parsed.value.action,
			email,
		});
		const broadcasted = result.succeeded > 0
			? await broadcastEventInvalidate(authorization.access.event.id, "tasks.decide")
			: false;
		return NextResponse.json({ ok: result.failed === 0, partial: result.succeeded > 0 && result.failed > 0, ...(result.failed ? { error: `${result.failed} selected submission${result.failed === 1 ? "" : "s"} could not be decided; see outcomes.` } : {}), ...result, broadcasted }, { status: result.failed === 0 ? 200 : 207 });
	} catch (error) {
		if (error instanceof BulkDecisionValidationError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
		throw error;
	}
}
