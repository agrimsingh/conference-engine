import type {
	CfpFormRow,
	EventRow,
	FormFieldRow,
	SubmissionRow,
	SubmissionSpeakerRow,
} from "./types";

export async function getEventBySlug(
	db: D1Database,
	slug: string,
): Promise<EventRow | null> {
	return db.prepare("SELECT * FROM events WHERE slug = ?").bind(slug).first<EventRow>();
}

export async function getOpenForm(
	db: D1Database,
	eventId: string,
	formSlug: string,
): Promise<CfpFormRow | null> {
	return db
		.prepare(
			`SELECT * FROM cfp_forms
       WHERE event_id = ? AND slug = ? AND status = 'open'`,
		)
		.bind(eventId, formSlug)
		.first<CfpFormRow>();
}

export async function getFormBySlug(
	db: D1Database,
	eventId: string,
	formSlug: string,
): Promise<CfpFormRow | null> {
	return db
		.prepare(`SELECT * FROM cfp_forms WHERE event_id = ? AND slug = ?`)
		.bind(eventId, formSlug)
		.first<CfpFormRow>();
}

export async function listFormFields(
	db: D1Database,
	formId: string,
): Promise<FormFieldRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM form_fields
       WHERE form_id = ? AND soft_deleted = 0
       ORDER BY position ASC`,
		)
		.bind(formId)
		.all<FormFieldRow>();
	return result.results;
}

export async function listSubmissionsForEvent(
	db: D1Database,
	eventId: string,
): Promise<SubmissionRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM submissions
       WHERE event_id = ?
       ORDER BY created_at DESC`,
		)
		.bind(eventId)
		.all<SubmissionRow>();
	return result.results;
}

export async function listSpeakersForSubmission(
	db: D1Database,
	submissionId: string,
): Promise<SubmissionSpeakerRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM submission_speakers
       WHERE submission_id = ?
       ORDER BY position ASC`,
		)
		.bind(submissionId)
		.all<SubmissionSpeakerRow>();
	return result.results;
}
