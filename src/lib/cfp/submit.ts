import {
	evaluateVisibilityRule,
	validateFieldAnswer,
	type AnswerMap,
	type FormFieldDef,
	type SpeakerAnswer,
} from "@/lib/domain";

export type SubmitInput = {
	answers: AnswerMap;
	submitterEmail: string;
	submitterName: string;
};

export type SubmitValidation =
	| { ok: true; visibleAnswers: AnswerMap; speakers: SpeakerAnswer[] }
	| { ok: false; errors: string[] };

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

export async function insertSubmission(
	db: D1Database,
	args: {
		eventId: string;
		formId: string;
		submitterEmail: string;
		submitterName: string;
		answers: AnswerMap;
		speakers: SpeakerAnswer[];
	},
): Promise<string> {
	const now = Date.now();
	const submissionId = crypto.randomUUID();

	await db
		.prepare(
			`INSERT INTO submissions (
        id, form_id, event_id, status, answers_json,
        submitter_email, submitter_name, created_at, updated_at, submitted_at
      ) VALUES (?, ?, ?, 'submitted', ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			submissionId,
			args.formId,
			args.eventId,
			JSON.stringify(args.answers),
			args.submitterEmail,
			args.submitterName,
			now,
			now,
			now,
		)
		.run();

	const stmts = args.speakers.map((speaker, index) =>
		db
			.prepare(
				`INSERT INTO submission_speakers (
          id, submission_id, person_id, name, email, bio, position
        ) VALUES (?, ?, NULL, ?, ?, ?, ?)`,
			)
			.bind(
				crypto.randomUUID(),
				submissionId,
				speaker.name.trim(),
				speaker.email.trim().toLowerCase(),
				speaker.bio?.trim() ?? null,
				index,
			),
	);

	if (stmts.length) {
		await db.batch(stmts);
	}

	return submissionId;
}
