"use server";

import { isCfpPastClosesAt } from "@/lib/cfp/closes-at";
import { insertSubmission, validateSubmissionAnswers } from "@/lib/cfp/submit";
import { loadCfpForm } from "@/lib/cfp/load-form";
import { getDb } from "@/lib/db/cloudflare";
import { resolveSubmissionCategory, type AnswerMap } from "@/lib/domain";

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

	if (isCfpPastClosesAt(loaded.form, Date.now())) {
		return { ok: false, errors: ["CFP closed"] };
	}

	const name = input.submitterName.trim();
	const email = input.submitterEmail.trim().toLowerCase();
	if (!name) return { ok: false, errors: ["Your name is required"] };
	if (!email.includes("@")) return { ok: false, errors: ["Valid email required"] };

	const validated = validateSubmissionAnswers(loaded.fields, input.answers);
	if (!validated.ok) return validated;

	const category = resolveSubmissionCategory(
		input.formSlug,
		validated.visibleAnswers,
	);

	const submissionId = await insertSubmission(db, {
		eventId: loaded.event.id,
		formId: loaded.form.id,
		submitterEmail: email,
		submitterName: name,
		answers: validated.visibleAnswers,
		speakers: validated.speakers,
		category,
	});

	return { ok: true, submissionId };
}
