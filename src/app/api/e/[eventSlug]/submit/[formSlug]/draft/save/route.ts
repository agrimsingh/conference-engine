import { NextResponse } from "next/server";
import { loadDraftForResume, saveDraftForResume, SubmissionNotEditableError } from "@/lib/cfp/drafts";
import { loadCfpForm } from "@/lib/cfp/load-form";
import { getAuthSecret, getDb } from "@/lib/db/cloudflare";
import { validateCfpPayloadBounds } from "@/lib/cfp/submit";
import { readBoundedCfpJson } from "@/lib/cfp/request";
import type { AnswerMap } from "@/lib/domain";
import { DemoEventWriteError, assertEventWritable } from "@/lib/events/writability";
import { isCfpOpenNow } from "@/lib/cfp/closes-at";
import { consumeFixedWindowRateLimit } from "@/lib/security/rate-limit";

type Context = { params: Promise<{ eventSlug: string; formSlug: string }> };
export async function PUT(request: Request, context: Context) {
	const parsed = await readBoundedCfpJson(request);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	const raw = parsed.value;
	const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
	const token = typeof body.token === "string" ? body.token : "";
	const submitterName = typeof body.submitterName === "string" ? body.submitterName : "";
	const answers = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers) ? body.answers as AnswerMap : null;
	if (!token || !answers) return NextResponse.json({ ok: false, error: "token and answers required" }, { status: 400 });
	const payloadError = validateCfpPayloadBounds(answers);
	if (payloadError) return NextResponse.json({ ok: false, error: payloadError }, { status: 413 });
	const db = await getDb();
	const secret = await getAuthSecret();
	const draft = await loadDraftForResume(db, { secret, token });
	const { eventSlug, formSlug } = await context.params;
	const loaded = await loadCfpForm(db, eventSlug, formSlug);
	if (!draft || !loaded || draft.eventId !== loaded.event.id || draft.formId !== loaded.form.id || loaded.form.drafts_enabled !== 1 || loaded.form.status !== "open" || !isCfpOpenNow(loaded.form)) return NextResponse.json({ ok: false, error: "Draft link is invalid, expired, or this CFP is unavailable" }, { status: 404 });
	try {
		assertEventWritable(loaded.event);
	} catch (error) {
		if (error instanceof DemoEventWriteError) return NextResponse.json({ ok: false, error: "This form is read-only" }, { status: 403 });
		throw error;
	}
	const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
	const [draftAllowed, ipAllowed] = await Promise.all([
		consumeFixedWindowRateLimit(db, { secret, bucket: "draft-save-draft", subject: `${eventSlug}:${formSlug}:draft:${draft.id}`, limit: 180, windowMs: 15 * 60_000 }),
		consumeFixedWindowRateLimit(db, { secret, bucket: "draft-save-ip", subject: `${eventSlug}:${formSlug}:ip:${ip}`, limit: 60, windowMs: 15 * 60_000 }),
	]);
	if (!draftAllowed || !ipAllowed) {
		return NextResponse.json({ ok: false, error: "Too many draft saves. Please wait a moment and try again." }, { status: 429 });
	}
	try {
		const saved = await saveDraftForResume(db, { secret, token, submitterName, answers });
		if (!saved) return NextResponse.json({ ok: false, error: "Draft link is invalid or expired" }, { status: 404 });
		return NextResponse.json({ ok: true, draftId: saved.draftId, token: saved.token });
	} catch (error) {
		if (error instanceof SubmissionNotEditableError) {
			return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
		}
		throw error;
	}
}
