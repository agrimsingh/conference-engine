import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { bulkLabelSubmissions, BulkLabelValidationError } from "@/lib/evaluation/labels";
import { broadcastEventInvalidate } from "@/lib/realtime/event-room";

type Context = { params: Promise<{ eventSlug: string }> };

export async function POST(request: Request, context: Context) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const parsed = await readBoundedJson(request, 64 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (
		!isJsonObject(parsed.value)
		|| !Array.isArray(parsed.value.submissionIds)
		|| parsed.value.submissionIds.some((id) => typeof id !== "string")
		|| typeof parsed.value.label !== "string"
		|| (parsed.value.action !== "add" && parsed.value.action !== "remove")
	) {
		return NextResponse.json({ ok: false, error: "Expected submissionIds, label, and action add or remove" }, { status: 400 });
	}
	try {
		const result = await bulkLabelSubmissions(db, {
			eventId: authorization.access.event.id,
			submissionIds: parsed.value.submissionIds,
			label: parsed.value.label,
			action: parsed.value.action,
		});
		const broadcasted = await broadcastEventInvalidate(authorization.access.event.id, "review.labels");
		return NextResponse.json({ ok: true, ...result, broadcasted });
	} catch (error) {
		if (error instanceof BulkLabelValidationError) {
			return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
		}
		throw error;
	}
}
