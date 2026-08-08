import { NextResponse } from "next/server";
import { finalizeDraft, loadDraftForResume } from "@/lib/cfp/drafts";
import { isCfpPastClosesAt } from "@/lib/cfp/closes-at";
import { isSubmissionLimitReachedError, validateCfpPayloadBounds, validateSubmissionAnswers } from "@/lib/cfp/submit";
import { loadCfpForm } from "@/lib/cfp/load-form";
import { getAuthSecret, getDb } from "@/lib/db/cloudflare";
import { resolveSubmissionCategory, type AnswerMap } from "@/lib/domain";
import { notifySubmissionLifecycle } from "@/lib/email/notify";
import { sendPendingInvitesForSubmission } from "@/lib/speakers/co-speakers";
import { confirmationCopyOverride } from "@/lib/cfp/form-copy";
import { repairSubmissionDelivery } from "@/lib/cfp/delivery";
import { readBoundedCfpJson } from "@/lib/cfp/request";

type Context = { params: Promise<{ eventSlug: string; formSlug: string }> };
export async function POST(request: Request, context: Context) {
	const { eventSlug, formSlug } = await context.params;
	const parsed = await readBoundedCfpJson(request);
	if (!parsed.ok) return NextResponse.json({ ok: false, errors: [parsed.error] }, { status: parsed.status });
	const raw = parsed.value;
	const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
	const token = typeof body.token === "string" ? body.token : "";
	const name = typeof body.submitterName === "string" ? body.submitterName.trim() : "";
	const answers = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers) ? body.answers as AnswerMap : null;
	if (!token || !name || !answers) return NextResponse.json({ ok: false, errors: ["token, submitterName, answers required"] }, { status: 400 });
	const payloadError = validateCfpPayloadBounds(answers);
	if (payloadError) return NextResponse.json({ ok: false, errors: [payloadError] }, { status: 413 });
	const db = await getDb();
	const secret = await getAuthSecret();
	const draft = await loadDraftForResume(db, { secret, token });
	const loaded = await loadCfpForm(db, eventSlug, formSlug, { requireOpen: true });
	if (!draft || !loaded || draft.eventId !== loaded.event.id || draft.formId !== loaded.form.id || isCfpPastClosesAt(loaded.form, Date.now())) return NextResponse.json({ ok: false, errors: ["CFP form not found or closed"] }, { status: 404 });
	const validated = validateSubmissionAnswers(loaded.fields, answers);
	if (!validated.ok) return NextResponse.json(validated, { status: 400 });
	let result: Awaited<ReturnType<typeof finalizeDraft>>;
	try {
		result = await finalizeDraft(db, { secret, draftId: draft.id, token, submitterName: name, answers: validated.visibleAnswers, speakers: validated.speakers, category: resolveSubmissionCategory(formSlug, validated.visibleAnswers) });
	} catch (error) {
		if (isSubmissionLimitReachedError(error)) {
			return NextResponse.json({ ok: false, errors: ["This CFP has reached its submission limit."] }, { status: 409 });
		}
		throw error;
	}
	await repairSubmissionDelivery({
		notify: () => notifySubmissionLifecycle(db, {
				submissionId: result.submissionId,
				templateKey: "submission_received",
				override: confirmationCopyOverride(loaded.form.confirmation_copy, { eventName: loaded.event.name, submitterName: name, title: typeof validated.visibleAnswers.title === "string" ? validated.visibleAnswers.title : "your proposal" }),
			}),
		inviteCoSpeakers: () => sendPendingInvitesForSubmission(db, { submissionId: result.submissionId, origin: new URL(request.url).origin }),
	});
	return NextResponse.json({ ok: true, submissionId: result.submissionId, replay: result.replay });
}
