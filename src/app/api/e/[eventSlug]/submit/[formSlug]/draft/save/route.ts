import { NextResponse } from "next/server";
import { saveDraftForResume } from "@/lib/cfp/drafts";
import { loadDraftForResume } from "@/lib/cfp/drafts";
import { loadCfpForm } from "@/lib/cfp/load-form";
import { getAuthSecret, getDb } from "@/lib/db/cloudflare";
import type { AnswerMap } from "@/lib/domain";

type Context = { params: Promise<{ eventSlug: string; formSlug: string }> };
export async function PUT(request: Request, context: Context) {
	let raw: unknown;
	try { raw = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }
	const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
	const token = typeof body.token === "string" ? body.token : "";
	const submitterName = typeof body.submitterName === "string" ? body.submitterName : "";
	const answers = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers) ? body.answers as AnswerMap : null;
	if (!token || !answers) return NextResponse.json({ ok: false, error: "token and answers required" }, { status: 400 });
	const db = await getDb();
	const secret = await getAuthSecret();
	const draft = await loadDraftForResume(db, { secret, token });
	const { eventSlug, formSlug } = await context.params;
	const loaded = await loadCfpForm(db, eventSlug, formSlug);
	if (!draft || !loaded || draft.eventId !== loaded.event.id || draft.formId !== loaded.form.id) return NextResponse.json({ ok: false, error: "Draft link is invalid or expired" }, { status: 404 });
	const saved = await saveDraftForResume(db, { secret, token, submitterName, answers });
	if (!saved) return NextResponse.json({ ok: false, error: "Draft link is invalid or expired" }, { status: 404 });
	return NextResponse.json({ ok: true, draftId: saved.draftId, token: saved.token });
}
