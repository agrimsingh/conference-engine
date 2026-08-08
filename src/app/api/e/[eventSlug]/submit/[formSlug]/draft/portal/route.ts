import { NextResponse } from "next/server";
import { createVerifiedDraft, issueDraftResumeToken, saveDraftForResume } from "@/lib/cfp/drafts";
import { loadCfpForm } from "@/lib/cfp/load-form";
import { getAuthSecret, getDb } from "@/lib/db/cloudflare";
import type { AnswerMap } from "@/lib/domain";
import { readPortalSession } from "@/lib/speakers/portal-session";

type Context = { params: Promise<{ eventSlug: string; formSlug: string }> };
export async function POST(request: Request, context: Context) {
	const { eventSlug, formSlug } = await context.params;
	let raw: unknown;
	try { raw = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }
	const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
	const portalToken = typeof body.portalToken === "string" ? body.portalToken : "";
	const draftToken = typeof body.draftToken === "string" ? body.draftToken : "";
	const name = typeof body.submitterName === "string" ? body.submitterName : "";
	const answers = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers) ? body.answers as AnswerMap : {};
	const session = await readPortalSession(portalToken);
	if (!session) return NextResponse.json({ ok: false, error: "Invalid portal session" }, { status: 401 });
	const db = await getDb();
	const secret = await getAuthSecret();
	if (draftToken) {
		const saved = await saveDraftForResume(db, { secret, token: draftToken, submitterName: name, answers, verifiedEmail: session.email });
		if (!saved) return NextResponse.json({ ok: false, error: "Draft not found" }, { status: 404 });
		return NextResponse.json({ ok: true, draftId: saved.draftId, token: saved.token });
	}
	const loaded = await loadCfpForm(db, eventSlug, formSlug, { requireOpen: true });
	if (!loaded || loaded.form.drafts_enabled === 0) return NextResponse.json({ ok: false, error: "Drafts unavailable" }, { status: 404 });
	const draftId = await createVerifiedDraft(db, { eventId: loaded.event.id, formId: loaded.form.id, verifiedEmail: session.email, submitterName: name, answers });
	const token = await issueDraftResumeToken(db, { secret, draftId, deliveryVerified: true });
	return NextResponse.json({ ok: true, draftId, token });
}
