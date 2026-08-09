import { NextResponse } from "next/server";
import { authorizeEventAdminApi, authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { readBoundedJson, isJsonObject } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { getSubmissionById } from "@/lib/db/queries";
import { broadcastEventInvalidate } from "@/lib/realtime/event-room";
import { cloneSession } from "@/lib/sessions/session";

type RouteContext = { params: Promise<{ eventSlug: string }> };

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const target = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!target.ok) return target.response;
	const json = await readBoundedJson(request, 16 * 1024);
	if (!json.ok) return NextResponse.json({ ok: false, error: json.error }, { status: json.status });
	if (!isJsonObject(json.value) || typeof json.value.sourceSubmissionId !== "string" || json.value.sourceSubmissionId.length > 128) return NextResponse.json({ ok: false, error: "Expected { sourceSubmissionId: string }" }, { status: 400 });
	const source = await getSubmissionById(db, json.value.sourceSubmissionId);
	if (!source) return NextResponse.json({ ok: false, error: "Source session not found" }, { status: 404 });
	// Reading source content across an event boundary requires access to that
	// source tenant as well as write access to the target event.
	if (source.event_id !== target.access.event.id) {
		const sourceEvent = await db.prepare("SELECT slug FROM events WHERE id = ?").bind(source.event_id).first<{ slug: string }>();
		const sourceAccess = sourceEvent ? await authorizeEventAdminApi(db, sourceEvent.slug) : null;
		if (!sourceAccess) return NextResponse.json({ ok: false, error: "Source session is outside your accessible events" }, { status: 404 });
	}
	try {
		const cloned = await cloneSession(db, { targetEventId: target.access.event.id, sourceSubmissionId: source.id });
		const broadcasted = await broadcastEventInvalidate(target.access.event.id, "sessions.clone");
		return NextResponse.json({ ok: true, sessionId: cloned.id, lineage: { parentSubmissionId: source.id, rootSubmissionId: source.lineage_root_submission_id ?? source.id, sourceEventId: source.event_id }, broadcasted });
	} catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not clone session" }, { status: 400 }); }
}
