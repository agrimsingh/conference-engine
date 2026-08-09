import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { setSessionContentStatus, updateSessionContent, type ContentStatus } from "@/lib/content/revisions";
import { getDb } from "@/lib/db/cloudflare";

export async function PATCH(request: Request, context: { params: Promise<{ eventSlug: string; sessionId: string }> }) {
	const { eventSlug, sessionId } = await context.params; const db = await getDb(); const auth = await authorizeWritableEventAdminApi(db, eventSlug); if (!auth.ok) return auth.response;
	if (!auth.access.account) return NextResponse.json({ ok: false, error: "Organizer account required" }, { status: 401 });
	const parsed = await readBoundedJson(request, 32 * 1024); if (!parsed.ok || !isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: parsed.ok ? "Expected JSON object" : parsed.error }, { status: parsed.ok ? 400 : parsed.status });
	const editorName = auth.access.account.name?.trim() || auth.access.account.email;
	const result = typeof parsed.value.status === "string"
		? await setSessionContentStatus(db, { eventId: auth.access.event.id, submissionId: sessionId, status: parsed.value.status as ContentStatus })
		: await updateSessionContent(db, { eventId: auth.access.event.id, submissionId: sessionId, editorAccountId: auth.access.account.id, editorName, content: { title: typeof parsed.value.title === "string" ? parsed.value.title : "", abstract: typeof parsed.value.abstract === "string" ? parsed.value.abstract : "" } });
	return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: result.error }, { status: result.status });
}
