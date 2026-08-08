import {
	evaluateVisibilityRule,
	validateFieldAnswer,
	type AnswerMap,
	type CategoryLabel,
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
		category?: CategoryLabel | null;
	},
): Promise<string> {
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
