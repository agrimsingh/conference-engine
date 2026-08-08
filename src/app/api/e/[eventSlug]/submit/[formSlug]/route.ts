import { NextResponse } from "next/server";
import { insertSubmission, validateSubmissionAnswers } from "@/lib/cfp/submit";
import { loadCfpForm } from "@/lib/cfp/load-form";
import { getDb } from "@/lib/db/cloudflare";
import type { AnswerMap } from "@/lib/domain";
import { notifySubmissionLifecycle } from "@/lib/email/notify";

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
	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return NextResponse.json({ ok: false, errors: ["Invalid JSON"] }, { status: 400 });
	}

	const submitterName =
		typeof body.submitterName === "string" ? body.submitterName.trim() : "";
	const submitterEmail =
		typeof body.submitterEmail === "string"
			? body.submitterEmail.trim().toLowerCase()
			: "";
	const answers =
		typeof body.answers === "object" && body.answers !== null && !Array.isArray(body.answers)
			? (body.answers as AnswerMap)
			: null;

	if (!submitterName || !submitterEmail.includes("@") || !answers) {
		return NextResponse.json(
			{ ok: false, errors: ["submitterName, submitterEmail, answers required"] },
			{ status: 400 },
		);
	}

	const db = await getDb();
	const loaded = await loadCfpForm(db, eventSlug, formSlug, { requireOpen: true });
	if (!loaded) {
		return NextResponse.json(
			{ ok: false, errors: ["CFP form not found or closed"] },
			{ status: 404 },
		);
	}

	const validated = validateSubmissionAnswers(loaded.fields, answers);
	if (!validated.ok) {
		return NextResponse.json(validated, { status: 400 });
	}

	const submissionId = await insertSubmission(db, {
		eventId: loaded.event.id,
		formId: loaded.form.id,
		submitterEmail,
		submitterName,
		answers: validated.visibleAnswers,
		speakers: validated.speakers,
	});

	const email = await notifySubmissionLifecycle(db, {
		submissionId,
		templateKey: "submission_received",
	});

	return NextResponse.json({ ok: true, submissionId, email });
}
