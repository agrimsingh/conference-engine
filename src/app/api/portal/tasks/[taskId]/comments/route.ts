import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { addDeliverableComment } from "@/lib/content/deliverables";
import { getDb } from "@/lib/db/cloudflare";
import { readPortalSessionFromCookie } from "@/lib/speakers/portal-session";

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
	const session = await readPortalSessionFromCookie();
	if (!session) return NextResponse.json({ ok: false, error: "Invalid or expired token" }, { status: 401 });
	const parsed = await readBoundedJson(request, 8 * 1024);
	if (!parsed.ok || !isJsonObject(parsed.value) || typeof parsed.value.body !== "string") return NextResponse.json({ ok: false, error: parsed.ok ? "Comment body required" : parsed.error }, { status: parsed.ok ? 400 : parsed.status });
	const { taskId } = await context.params;
	const db = await getDb();
	const person = await db.prepare("SELECT name, email FROM people WHERE id = ?").bind(session.personId).first<{ name: string | null; email: string }>();
	const result = await addDeliverableComment(db, { taskId, personId: session.personId, authorKind: "speaker", authorPersonId: session.personId, authorName: person?.name?.trim() || person?.email || session.email, body: parsed.value.body });
	return result.ok ? NextResponse.json({ ok: true, comment: result.comment }) : NextResponse.json({ ok: false, error: result.error }, { status: result.status });
}
