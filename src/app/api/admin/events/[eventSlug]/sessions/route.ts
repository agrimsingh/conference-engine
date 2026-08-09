import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { readBoundedJson, isJsonObject } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { broadcastEventInvalidate } from "@/lib/realtime/event-room";
import { createSession, type SessionInput, type SessionOrigin } from "@/lib/sessions/session";

type RouteContext = { params: Promise<{ eventSlug: string }> };

function parseBody(raw: unknown): { origin: SessionOrigin; input: SessionInput } | null {
	if (!isJsonObject(raw) || !isJsonObject(raw.input)) return null;
	if (raw.origin !== "manual" && raw.origin !== "invited") return null;
	return { origin: raw.origin, input: raw.input as SessionInput };
}

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const json = await readBoundedJson(request, 64 * 1024);
	if (!json.ok) return NextResponse.json({ ok: false, error: json.error }, { status: json.status });
	const body = parseBody(json.value);
	if (!body) return NextResponse.json({ ok: false, error: "Expected { origin: manual|invited, input: { title, abstract?, speakers?, videoUrl?, googleDocUrl?, supportingUrl? } }" }, { status: 400 });
	try {
		const session = await createSession(db, { eventId: authorization.access.event.id, ...body });
		const broadcasted = await broadcastEventInvalidate(authorization.access.event.id, "sessions.create");
		return NextResponse.json({ ok: true, sessionId: session.id, origin: body.origin, broadcasted });
	} catch (error) {
		return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not create session" }, { status: error instanceof Error && "status" in error && typeof error.status === "number" ? error.status : 400 });
	}
}
