import { NextResponse } from "next/server";
import { loadDraftForResume, prepareDraftResumeDelivery } from "@/lib/cfp/drafts";
import { loadCfpForm } from "@/lib/cfp/load-form";
import { getAuthSecret, getDb } from "@/lib/db/cloudflare";
import { getEventById } from "@/lib/db/queries";
import { sendTemplatedEmail } from "@/lib/email/resend";
import { isPlausibleEmail, normalizeEmail } from "@/lib/security/crypto";
import type { AnswerMap } from "@/lib/domain";
import { composeResumeDraftEmail } from "@/lib/cfp/form-copy";
import { consumeFixedWindowRateLimit } from "@/lib/security/rate-limit";
import { validateCfpPayloadBounds } from "@/lib/cfp/submit";
import { readBoundedCfpJson } from "@/lib/cfp/request";
import { DemoEventWriteError, assertEventWritable } from "@/lib/events/writability";
import { isCfpOpenNow } from "@/lib/cfp/closes-at";

type Context = { params: Promise<{ eventSlug: string; formSlug: string }> };
const accepted = () => NextResponse.json({ ok: true }, { status: 202 });

export async function POST(request: Request, context: Context) {
	const { eventSlug, formSlug } = await context.params;
	const parsed = await readBoundedCfpJson(request);
	if (!parsed.ok) return accepted();
	const raw = parsed.value;
	const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
	const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
	const name = typeof body.submitterName === "string" ? body.submitterName.trim().slice(0, 160) : "";
	const answers: AnswerMap = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers) ? body.answers as AnswerMap : {};
	if (validateCfpPayloadBounds(answers)) return accepted();
	const db = await getDb();
	// Resolve public visibility and demo immutability before consuming a shared
	// bucket. A closed form remains intentionally opaque, while a writable open
	// form is the only path that is allowed to affect rate-limit state.
	const loaded = await loadCfpForm(db, eventSlug, formSlug);
	if (!loaded || loaded.form.drafts_enabled === 0 || loaded.form.status !== "open" || !isCfpOpenNow(loaded.form)) return accepted();
	try {
		assertEventWritable(loaded.event);
	} catch (error) {
		if (error instanceof DemoEventWriteError) {
			return NextResponse.json({ ok: false, error: "This form is read-only" }, { status: 403 });
		}
		throw error;
	}
	const secret = await getAuthSecret();
	const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
	const [emailAllowed, ipAllowed] = await Promise.all([
		consumeFixedWindowRateLimit(db, { secret, bucket: "draft-link-email", subject: `email:${email || "invalid"}`, limit: 5, windowMs: 15 * 60_000 }),
		consumeFixedWindowRateLimit(db, { secret, bucket: "draft-link-ip", subject: `ip:${ip}`, limit: 20, windowMs: 15 * 60_000 }),
	]);
	if (!isPlausibleEmail(email) || !emailAllowed || !ipAllowed) return accepted();
	const prepared = await prepareDraftResumeDelivery(db, { secret, eventId: loaded.event.id, formId: loaded.form.id, verifiedEmail: email, submitterName: name, answers });
	const resumeUrl = new URL(`/e/${eventSlug}/submit/${formSlug}`, request.url);
	resumeUrl.searchParams.set("draft", prepared.token);
	const event = await getEventById(db, loaded.event.id);
	const sent = await sendTemplatedEmail(db, {
		eventId: loaded.event.id,
		submissionId: null,
		templateKey: "portal_magic_link",
		toEmail: email,
		context: { eventName: event?.name ?? "conference-engine", submitterName: name || "there", title: loaded.form.title, portalUrl: resumeUrl.toString() },
			override: {
				subject: `Resume your ${loaded.form.title} draft`,
				text: composeResumeDraftEmail(loaded.form.welcome_copy, { eventName: event?.name ?? "conference-engine", submitterName: name || "there", title: loaded.form.title, resumeUrl: resumeUrl.toString() }),
		},
		force: true,
	});
	if (!sent.ok) return accepted();
	return accepted();
}

export async function GET(request: Request, context: Context) {
	const token = new URL(request.url).searchParams.get("token") ?? "";
	const { eventSlug, formSlug } = await context.params;
	const db = await getDb();
	const draft = await loadDraftForResume(db, { secret: await getAuthSecret(), token });
	const loaded = await loadCfpForm(db, eventSlug, formSlug);
	if (!draft || !loaded || draft.eventId !== loaded.event.id || draft.formId !== loaded.form.id || (draft.status !== "submitted" && loaded.form.drafts_enabled !== 1) || loaded.form.status !== "open" || !isCfpOpenNow(loaded.form)) return NextResponse.json({ ok: false, error: "Draft link is invalid, expired, or this CFP is unavailable" }, { status: 404 });
	return NextResponse.json({ ok: true, draft: { id: draft.id, status: draft.status, submitterName: draft.submitterName, submitterEmail: draft.verifiedEmail, answers: draft.answers, submissionId: draft.submissionId } });
}
