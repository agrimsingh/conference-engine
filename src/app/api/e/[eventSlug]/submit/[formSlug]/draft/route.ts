import { NextResponse } from "next/server";
import { createVerifiedDraft, issueDraftResumeToken, loadDraftForResume } from "@/lib/cfp/drafts";
import { loadCfpForm } from "@/lib/cfp/load-form";
import { getAuthSecret, getDb } from "@/lib/db/cloudflare";
import { getEventById } from "@/lib/db/queries";
import { sendTemplatedEmail } from "@/lib/email/resend";
import { isPlausibleEmail, normalizeEmail, randomToken } from "@/lib/security/crypto";
import { consumeFixedWindowRateLimit } from "@/lib/security/rate-limit";

type Context = { params: Promise<{ eventSlug: string; formSlug: string }> };
const accepted = () => NextResponse.json({ ok: true }, { status: 202 });

export async function POST(request: Request, context: Context) {
	const { eventSlug, formSlug } = await context.params;
	let raw: unknown;
	try { raw = await request.json(); } catch { return accepted(); }
	const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
	const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
	const name = typeof body.submitterName === "string" ? body.submitterName.trim().slice(0, 160) : "";
	const db = await getDb();
	const secret = await getAuthSecret();
	const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
	const [emailAllowed, ipAllowed] = await Promise.all([
		consumeFixedWindowRateLimit(db, { secret, bucket: "draft-link-email", subject: `email:${email || "invalid"}`, limit: 5, windowMs: 15 * 60_000 }),
		consumeFixedWindowRateLimit(db, { secret, bucket: "draft-link-ip", subject: `ip:${ip}`, limit: 20, windowMs: 15 * 60_000 }),
	]);
	if (!isPlausibleEmail(email) || !emailAllowed || !ipAllowed) return accepted();
	const loaded = await loadCfpForm(db, eventSlug, formSlug, { requireOpen: true });
	if (!loaded || loaded.form.drafts_enabled === 0) return accepted();
	const draftId = crypto.randomUUID();
	const token = randomToken(32);
	const resumeUrl = new URL(request.url);
	resumeUrl.search = "";
	resumeUrl.searchParams.set("token", token);
	const event = await getEventById(db, loaded.event.id);
	const sent = await sendTemplatedEmail(db, {
		eventId: loaded.event.id,
		submissionId: null,
		templateKey: "portal_magic_link",
		toEmail: email,
		context: { eventName: event?.name ?? "conference-engine", submitterName: name || "there", title: loaded.form.title, portalUrl: resumeUrl.toString() },
		override: { subject: `Resume your ${loaded.form.title} draft`, text: `Hi ${name || "there"},\n\nUse this link to resume your saved proposal:\n${resumeUrl}\n\nIf you did not request this, you can ignore this email.` },
		force: true,
	});
	if (!sent.ok) return accepted();
	await createVerifiedDraft(db, { id: draftId, eventId: loaded.event.id, formId: loaded.form.id, verifiedEmail: email, submitterName: name });
	await issueDraftResumeToken(db, { secret, draftId, token, deliveryVerified: true });
	return accepted();
}

export async function GET(request: Request, context: Context) {
	const token = new URL(request.url).searchParams.get("token") ?? "";
	const { eventSlug, formSlug } = await context.params;
	const db = await getDb();
	const draft = await loadDraftForResume(db, { secret: await getAuthSecret(), token });
	const loaded = await loadCfpForm(db, eventSlug, formSlug);
	if (!draft || !loaded || draft.eventId !== loaded.event.id || draft.formId !== loaded.form.id) return NextResponse.json({ ok: false, error: "Draft link is invalid or expired" }, { status: 404 });
	return NextResponse.json({ ok: true, draft: { id: draft.id, status: draft.status, answers: draft.answers, submissionId: draft.submissionId } });
}
