import { NextResponse } from "next/server";
import { createVerifiedDraft, issueDraftResumeToken, loadDraftForResume, saveDraftForResume, SubmissionNotEditableError } from "@/lib/cfp/drafts";
import { loadCfpForm } from "@/lib/cfp/load-form";
import { getAuthSecret, getDb } from "@/lib/db/cloudflare";
import type { AnswerMap } from "@/lib/domain";
import { validateCfpPayloadBounds } from "@/lib/cfp/submit";
import { readBoundedCfpJson } from "@/lib/cfp/request";
import { isCfpOpenNow } from "@/lib/cfp/closes-at";
import { readPortalSession, readPortalSessionFromCookie } from "@/lib/speakers/portal-session";

type Context = { params: Promise<{ eventSlug: string; formSlug: string }> };
export async function POST(request: Request, context: Context) {
	const { eventSlug, formSlug } = await context.params;
	const parsed = await readBoundedCfpJson(request);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	const raw = parsed.value;
	const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
	const portalToken = typeof body.portalToken === "string" ? body.portalToken : "";
	const draftToken = typeof body.draftToken === "string" ? body.draftToken : "";
	const name = typeof body.submitterName === "string" ? body.submitterName : "";
	const answers = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers) ? body.answers as AnswerMap : {};
	const payloadError = validateCfpPayloadBounds(answers);
	if (payloadError) return NextResponse.json({ ok: false, error: payloadError }, { status: 413 });
	const session = await readPortalSessionFromCookie() ?? await readPortalSession(portalToken);
	if (!session) return NextResponse.json({ ok: false, error: "Invalid portal session" }, { status: 401 });
	const db = await getDb();
	const secret = await getAuthSecret();
	// Resolve both resources before any draft mutation. In particular, a valid
	// portal session must never let a resume token update a draft via another
	// event/form URL or after this CFP stops accepting drafts.
	const draft = draftToken ? await loadDraftForResume(db, { secret, token: draftToken }) : null;
	const loaded = await loadCfpForm(db, eventSlug, formSlug);
	if (!loaded || loaded.form.drafts_enabled !== 1 || loaded.form.status !== "open" || !isCfpOpenNow(loaded.form)) {
		return NextResponse.json({ ok: false, error: "Drafts unavailable" }, { status: 404 });
	}
	if (draftToken) {
		if (!draft || draft.eventId !== loaded.event.id || draft.formId !== loaded.form.id) {
			return NextResponse.json({ ok: false, error: "Draft not found" }, { status: 404 });
		}
		try {
			const saved = await saveDraftForResume(db, { secret, token: draftToken, submitterName: name, answers, verifiedEmail: session.email });
			if (!saved) return NextResponse.json({ ok: false, error: "Draft not found" }, { status: 404 });
			return NextResponse.json({ ok: true, draftId: saved.draftId, token: saved.token });
		} catch (error) {
			if (error instanceof SubmissionNotEditableError) {
				return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
			}
			throw error;
		}
	}
	const draftId = await createVerifiedDraft(db, { eventId: loaded.event.id, formId: loaded.form.id, verifiedEmail: session.email, submitterName: name, answers });
	const token = await issueDraftResumeToken(db, { secret, draftId, deliveryVerified: true });
	return NextResponse.json({ ok: true, draftId, token });
}
