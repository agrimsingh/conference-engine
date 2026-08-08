import { NextResponse } from "next/server";
import { finalizeDraft, loadDraftForResume } from "@/lib/cfp/drafts";
import { isCfpPastClosesAt } from "@/lib/cfp/closes-at";
import { validateSubmissionAnswers } from "@/lib/cfp/submit";
import { loadCfpForm } from "@/lib/cfp/load-form";
import { getAuthSecret, getDb } from "@/lib/db/cloudflare";
import { resolveSubmissionCategory, type AnswerMap } from "@/lib/domain";

type Context = { params: Promise<{ eventSlug: string; formSlug: string }> };
export async function POST(request: Request, context: Context) {
	const { eventSlug, formSlug } = await context.params;
	let raw: unknown;
	try { raw = await request.json(); } catch { return NextResponse.json({ ok: false, errors: ["Invalid JSON"] }, { status: 400 }); }
	const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
	const token = typeof body.token === "string" ? body.token : "";
	const name = typeof body.submitterName === "string" ? body.submitterName.trim() : "";
	const answers = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers) ? body.answers as AnswerMap : null;
	if (!token || !name || !answers) return NextResponse.json({ ok: false, errors: ["token, submitterName, answers required"] }, { status: 400 });
	const db = await getDb();
	const secret = await getAuthSecret();
	const draft = await loadDraftForResume(db, { secret, token });
	const loaded = await loadCfpForm(db, eventSlug, formSlug, { requireOpen: true });
	if (!draft || !loaded || draft.eventId !== loaded.event.id || draft.formId !== loaded.form.id || isCfpPastClosesAt(loaded.form, Date.now())) return NextResponse.json({ ok: false, errors: ["CFP form not found or closed"] }, { status: 404 });
	const validated = validateSubmissionAnswers(loaded.fields, answers);
	if (!validated.ok) return NextResponse.json(validated, { status: 400 });
	const result = await finalizeDraft(db, { secret, draftId: draft.id, token, submitterName: name, answers: validated.visibleAnswers, speakers: validated.speakers, category: resolveSubmissionCategory(formSlug, validated.visibleAnswers) });
	return NextResponse.json({ ok: true, submissionId: result.submissionId, replay: result.replay });
}
