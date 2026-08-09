import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { restoreSessionRevision } from "@/lib/content/revisions";
import { getDb } from "@/lib/db/cloudflare";

export async function POST(request: Request, context: { params: Promise<{ eventSlug: string; sessionId: string }> }) {
	const { eventSlug, sessionId } = await context.params; const db = await getDb(); const auth = await authorizeWritableEventAdminApi(db, eventSlug); if (!auth.ok) return auth.response;
	if (!auth.access.account) return NextResponse.json({ ok: false, error: "Organizer account required" }, { status: 401 });
	const parsed = await readBoundedJson(request, 8 * 1024); if (!parsed.ok || !isJsonObject(parsed.value) || typeof parsed.value.revisionId !== "string") return NextResponse.json({ ok: false, error: parsed.ok ? "revisionId required" : parsed.error }, { status: parsed.ok ? 400 : parsed.status });
	const result = await restoreSessionRevision(db, { eventId: auth.access.event.id, submissionId: sessionId, revisionId: parsed.value.revisionId, editorAccountId: auth.access.account.id, editorName: auth.access.account.name?.trim() || auth.access.account.email });
	return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: result.error }, { status: result.status });
}
