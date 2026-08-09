import { verifyCfpFieldUpload } from "@/lib/cfp/file-upload";
import {
	evaluateVisibilityRule,
	validateFieldAnswer,
	type AnswerMap,
	type CategoryLabel,
	type FormFieldDef,
	type SpeakerAnswer,
} from "@/lib/domain";
import { isPlausibleEmail, normalizeEmail } from "@/lib/security/crypto";
import { requireWritableEventById } from "@/lib/events/writability";

export type SubmitInput = {
	answers: AnswerMap;
	submitterEmail: string;
	submitterName: string;
};

export type SubmitValidation =
	| { ok: true; visibleAnswers: AnswerMap; speakers: SpeakerAnswer[] }
	| { ok: false; errors: string[] };

export const MAX_CFP_REQUEST_BYTES = 256 * 1024;
export const MAX_CFP_ANSWERS_BYTES = 192 * 1024;

/** Bounds storage and validation work even when a client supplies unknown keys. */
export function validateCfpPayloadBounds(answers: AnswerMap): string | null {
	let serialized: string;
	try {
		serialized = JSON.stringify(answers);
	} catch {
		return "answers must be serializable";
	}
	if (new TextEncoder().encode(serialized).byteLength > MAX_CFP_ANSWERS_BYTES) {
		return "answers payload is too large";
	}
	if (Object.keys(answers).length > 100) return "answers has too many fields";
	return null;
}

/** D1's trigger is the authority for a concurrent submission limit. */
export function isSubmissionLimitReachedError(error: unknown): boolean {
	return (
		error instanceof Error &&
		error.message.toLowerCase().includes("submission limit reached")
	);
}

export function validateSubmitterIdentity(input: { name: string; email: string }): { ok: true; name: string; email: string } | { ok: false; errors: string[] } {
	const name = input.name.trim();
	const email = normalizeEmail(input.email);
	const errors: string[] = [];
	if (!name || name.length > 160) errors.push("Enter a name between 1 and 160 characters.");
	if (!isPlausibleEmail(email)) errors.push("Enter a valid email address.");
	return errors.length ? { ok: false, errors } : { ok: true, name, email };
}

export function validateSubmissionAnswers(
	fields: FormFieldDef[],
	answers: AnswerMap,
): SubmitValidation {
	const errors: string[] = [];
	const visibleAnswers: AnswerMap = {};
	let speakers: SpeakerAnswer[] = [];

	for (const field of fields) {
		const visible = evaluateVisibilityRule(field.visibilityRule, answers);
		if (!visible) continue;

		const answer = answers[field.key];
		const err = validateFieldAnswer(field, answer);
		if (err) errors.push(err);
		else visibleAnswers[field.key] = answer;

		if (field.fieldType === "speaker_block" && Array.isArray(answer)) {
			speakers = answer as SpeakerAnswer[];
		}
	}

	if (!speakers.length) {
		errors.push("At least one speaker is required");
	}

	if (errors.length) return { ok: false, errors };
	return { ok: true, visibleAnswers, speakers };
}

export async function validateSubmissionAnswersWithAssets(
	db: D1Database,
	args: {
		eventId: string;
		formId: string;
		fields: FormFieldDef[];
		answers: AnswerMap;
	},
): Promise<SubmitValidation> {
	const validated = validateSubmissionAnswers(args.fields, args.answers);
	if (!validated.ok) return validated;

	for (const field of args.fields) {
		if (field.config.kind !== "file_upload") continue;
		if (!evaluateVisibilityRule(field.visibilityRule, args.answers)) continue;
		const answer = validated.visibleAnswers[field.key];
		const err = await verifyCfpFieldUpload(db, {
			eventId: args.eventId,
			formId: args.formId,
			fieldKey: field.key,
			answer,
		});
		if (err) return { ok: false, errors: [err] };
	}

	return validated;
}

export async function insertSubmission(
	db: D1Database,
	args: {
		eventId: string;
		formId: string;
		submitterEmail: string;
		submitterName: string;
		answers: AnswerMap;
		speakers: SpeakerAnswer[];
		category?: CategoryLabel | null;
	},
): Promise<string> {
	await requireWritableEventById(db, args.eventId);
	const now = Date.now();
	const submissionId = crypto.randomUUID();
	const submitterEmail = args.submitterEmail.trim().toLowerCase();
	const principals = new Map<string, string>();
	principals.set(submitterEmail, args.submitterName.trim());
	for (const speaker of args.speakers) {
		const email = speaker.email.trim().toLowerCase();
		if (email) principals.set(email, speaker.name.trim());
	}
	const personStatements = [...principals.entries()].map(([email, name]) =>
		db.prepare(
			`INSERT INTO people (id, email, name, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET name = CASE
         WHEN people.name IS NULL OR people.name = '' THEN excluded.name
         ELSE people.name END`,
		).bind(crypto.randomUUID(), email, name || null, now),
	);

	const submissionStatement = db.prepare(
			`INSERT INTO submissions (
		id, form_id, event_id, status, answers_json, category,
		submitter_email, submitter_name, submitter_person_id, created_at, updated_at, submitted_at
	  ) VALUES (?, ?, ?, 'submitted', ?, ?, ?, ?,
	    (SELECT id FROM people WHERE email = ?), ?, ?, ?)`,
		)
		.bind(
			submissionId,
			args.formId,
			args.eventId,
			JSON.stringify(args.answers),
			args.category ?? null,
			submitterEmail,
			args.submitterName,
			submitterEmail,
			now,
			now,
			now,
		);

	const stmts = args.speakers.map((speaker, index) => {
		const email = speaker.email.trim().toLowerCase();
		// The primary submitter is confirmed by the act of submitting;
		// everyone else starts pending until they confirm via invite link.
		const status = index === 0 || email === submitterEmail ? "confirmed" : "pending";
		return db
			.prepare(
			`INSERT INTO submission_speakers (
          id, submission_id, person_id, name, email, bio, position,
          status, invited_at, confirmed_at, added_after_acceptance, confirm_token_hash
		) VALUES (?, ?, (SELECT id FROM people WHERE email = ?), ?, ?, ?, ?, ?, NULL, ?, 0, NULL)`,
			)
			.bind(
				crypto.randomUUID(),
				submissionId,
				email,
				speaker.name.trim(),
				email,
				speaker.bio?.trim() ?? null,
				index,
				status,
				status === "confirmed" ? now : null,
			);
	});

	await db.batch([...personStatements, submissionStatement, ...stmts]);

	return submissionId;
}
