import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { addDeliverableComment } from "@/lib/content/deliverables";
import { getDb } from "@/lib/db/cloudflare";

export async function POST(request: Request, context: { params: Promise<{ eventSlug: string; taskId: string }> }) {
	const { eventSlug, taskId } = await context.params;
	const db = await getDb();
	const auth = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!auth.ok) return auth.response;
	if (!auth.access.account) return NextResponse.json({ ok: false, error: "Organizer account required" }, { status: 401 });
	const parsed = await readBoundedJson(request, 8 * 1024);
	if (!parsed.ok || !isJsonObject(parsed.value) || typeof parsed.value.body !== "string") return NextResponse.json({ ok: false, error: parsed.ok ? "Comment body required" : parsed.error }, { status: parsed.ok ? 400 : parsed.status });
	const result = await addDeliverableComment(db, { taskId, eventId: auth.access.event.id, authorKind: "organizer", authorAccountId: auth.access.account.id, authorName: auth.access.account.name?.trim() || auth.access.account.email, body: parsed.value.body });
	return result.ok ? NextResponse.json({ ok: true, comment: result.comment }) : NextResponse.json({ ok: false, error: result.error }, { status: result.status });
}
