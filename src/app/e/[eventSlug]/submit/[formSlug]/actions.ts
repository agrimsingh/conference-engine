"use server";

import { headers } from "next/headers";
import { isCfpOpenNow } from "@/lib/cfp/closes-at";
import { insertSubmission, isSubmissionLimitReachedError, validateSubmissionAnswersWithAssets } from "@/lib/cfp/submit";
import { loadCfpForm } from "@/lib/cfp/load-form";
import { getDb } from "@/lib/db/cloudflare";
import { resolveSubmissionCategory, type AnswerMap } from "@/lib/domain";
import { sendPendingInvitesForSubmission } from "@/lib/speakers/co-speakers";
import { DemoEventWriteError, assertEventWritable } from "@/lib/events/writability";

async function requestOrigin(): Promise<string> {
	const headerList = await headers();
	const host = headerList.get("host") ?? "localhost:3000";
	const proto =
		headerList.get("x-forwarded-proto") ??
		(host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
	return `${proto}://${host}`;
}

export type SubmitActionResult =
	| { ok: true; submissionId: string }
	| { ok: false; errors: string[] };

export async function submitCfpAction(input: {
	eventSlug: string;
	formSlug: string;
	submitterName: string;
	submitterEmail: string;
	answers: AnswerMap;
}): Promise<SubmitActionResult> {
	const db = await getDb();
	const loaded = await loadCfpForm(db, input.eventSlug, input.formSlug, {
		requireOpen: true,
	});
	if (!loaded) {
		return { ok: false, errors: ["CFP form not found or closed"] };
	}
	try {
		assertEventWritable(loaded.event);
	} catch (error) {
		if (error instanceof DemoEventWriteError) return { ok: false, errors: ["This form is read-only"] };
		throw error;
	}

	if (!isCfpOpenNow(loaded.form, Date.now())) {
		return { ok: false, errors: ["CFP is not accepting submissions right now"] };
	}

	const name = input.submitterName.trim();
	const email = input.submitterEmail.trim().toLowerCase();
	if (!name) return { ok: false, errors: ["Your name is required"] };
	if (!email.includes("@")) return { ok: false, errors: ["Valid email required"] };

	const validated = await validateSubmissionAnswersWithAssets(db, {
		eventId: loaded.event.id,
		formId: loaded.form.id,
		fields: loaded.fields,
		answers: input.answers,
	});
	if (!validated.ok) return validated;

	const category = resolveSubmissionCategory(loaded.categoryRoute, validated.visibleAnswers);

	let submissionId: string;
	try {
		submissionId = await insertSubmission(db, {
			eventId: loaded.event.id,
			formId: loaded.form.id,
			submitterEmail: email,
			submitterName: name,
			answers: validated.visibleAnswers,
			speakers: validated.speakers,
			category,
		});
	} catch (error) {
		if (isSubmissionLimitReachedError(error)) {
			return { ok: false, errors: ["This CFP has reached its submission limit."] };
		}
		throw error;
	}

	await sendPendingInvitesForSubmission(db, {
		submissionId,
		origin: await requestOrigin(),
	});

	return { ok: true, submissionId };
}
