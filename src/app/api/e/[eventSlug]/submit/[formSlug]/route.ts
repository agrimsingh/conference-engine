import { NextResponse } from "next/server";
import { isCfpOpenNow } from "@/lib/cfp/closes-at";
import { insertSubmission, isSubmissionLimitReachedError, validateCfpPayloadBounds, validateSubmissionAnswersWithAssets, validateSubmitterIdentity } from "@/lib/cfp/submit";
import { isJsonObject, readBoundedCfpJson } from "@/lib/cfp/request";
import { loadCfpForm } from "@/lib/cfp/load-form";
import { getAuthSecret, getCloudflareEnv, getDb } from "@/lib/db/cloudflare";
import { resolveSubmissionCategory, type AnswerMap } from "@/lib/domain";
import { notifyOrganizersOfSubmission, notifySubmissionLifecycle } from "@/lib/email/notify";
import { sendPendingInvitesForSubmission } from "@/lib/speakers/co-speakers";
import { confirmationCopyOverride } from "@/lib/cfp/form-copy";
import { consumeFixedWindowRateLimit } from "@/lib/security/rate-limit";
import { DemoEventWriteError, assertEventWritable } from "@/lib/events/writability";
import { absoluteAppUrl } from "@/lib/email/templates";

type RouteContext = {
	params: Promise<{ eventSlug: string; formSlug: string }>;
};

type Body = {
	submitterName?: unknown;
	submitterEmail?: unknown;
	answers?: unknown;
};

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug, formSlug } = await context.params;
	const parsed = await readBoundedCfpJson(request);
	if (!parsed.ok) return NextResponse.json({ ok: false, errors: [parsed.error] }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) {
		return NextResponse.json({ ok: false, errors: ["Expected JSON object"] }, { status: 400 });
	}
	const body = parsed.value as Body;

	const identity = validateSubmitterIdentity({
		name: typeof body.submitterName === "string" ? body.submitterName : "",
		email: typeof body.submitterEmail === "string" ? body.submitterEmail : "",
	});
	const answers =
		typeof body.answers === "object" && body.answers !== null && !Array.isArray(body.answers)
			? (body.answers as AnswerMap)
			: null;

	if (!identity.ok || !answers) {
		return NextResponse.json(
			{ ok: false, errors: identity.ok ? ["answers required"] : identity.errors },
			{ status: 400 },
		);
	}
	const payloadError = validateCfpPayloadBounds(answers);
	if (payloadError) return NextResponse.json({ ok: false, errors: [payloadError] }, { status: 413 });
	const { name: submitterName, email: submitterEmail } = identity;

	const db = await getDb();
	const loaded = await loadCfpForm(db, eventSlug, formSlug, { requireOpen: true });
	if (!loaded) {
		return NextResponse.json(
			{ ok: false, errors: ["CFP form not found or closed"] },
			{ status: 404 },
		);
	}
	try {
		assertEventWritable(loaded.event);
	} catch (error) {
		if (error instanceof DemoEventWriteError) {
			return NextResponse.json({ ok: false, errors: ["This form is read-only"] }, { status: 403 });
		}
		throw error;
	}

	const now = Date.now();
	if (!isCfpOpenNow(loaded.form, now)) {
		return NextResponse.json(
			{ ok: false, errors: ["CFP is not accepting submissions right now"] },
			{ status: 403 },
		);
	}
	const secret = await getAuthSecret();
	const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
	const [emailAllowed, ipAllowed] = await Promise.all([
		consumeFixedWindowRateLimit(db, { secret, bucket: "cfp-submit-email", subject: `${eventSlug}:${formSlug}:email:${submitterEmail}`, limit: 5, windowMs: 15 * 60_000 }),
		consumeFixedWindowRateLimit(db, { secret, bucket: "cfp-submit-ip", subject: `${eventSlug}:${formSlug}:ip:${ip}`, limit: 20, windowMs: 15 * 60_000 }),
	]);
	if (!emailAllowed || !ipAllowed) return NextResponse.json({ ok: false, errors: ["Too many submission attempts. Please wait a few minutes and try again."] }, { status: 429 });

	const validated = await validateSubmissionAnswersWithAssets(db, {
		eventId: loaded.event.id,
		formId: loaded.form.id,
		fields: loaded.fields,
		answers,
	});
	if (!validated.ok) {
		return NextResponse.json(validated, { status: 400 });
	}

	const category = resolveSubmissionCategory(loaded.categoryRoute, validated.visibleAnswers);
	const appOrigin = (await getCloudflareEnv()).APP_ORIGIN;
	const portalUrl = absoluteAppUrl(appOrigin, "/portal");

	let submissionId: string;
	try {
		submissionId = await insertSubmission(db, {
			eventId: loaded.event.id,
			formId: loaded.form.id,
			submitterEmail,
			submitterName,
			answers: validated.visibleAnswers,
			speakers: validated.speakers,
			category,
			formRevisionId: loaded.revisionId,
		});
	} catch (error) {
		if (isSubmissionLimitReachedError(error)) {
			return NextResponse.json({ ok: false, errors: ["This CFP has reached its submission limit."] }, { status: 409 });
		}
		throw error;
	}

	const [email] = await Promise.all([
		notifySubmissionLifecycle(db, {
			submissionId,
			templateKey: "submission_received",
			portalUrl,
			override: confirmationCopyOverride(loaded.form.confirmation_copy, { eventName: loaded.event.name, submitterName, title: typeof validated.visibleAnswers.title === "string" ? validated.visibleAnswers.title : "your proposal", portalUrl }),
		}),
		notifyOrganizersOfSubmission(db, { submissionId, kind: "created", origin: appOrigin }),
	]);

	const coSpeakerInvites = await sendPendingInvitesForSubmission(db, {
		submissionId,
		origin: appOrigin,
	});

	return NextResponse.json({
		ok: true,
		submissionId,
		email,
		coSpeakerInvites: coSpeakerInvites.map((invite) =>
			invite.ok
				? { ok: true, speakerId: invite.speakerId, emailStatus: invite.email.status }
				: { ok: false, error: invite.error },
		),
	});
}
