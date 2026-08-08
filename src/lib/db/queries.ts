import type {
	AssetRow,
	CfpFormRow,
	EventRow,
	FormFieldRow,
	PersonRow,
	SpeakerProfileRow,
	SpeakerTaskRow,
	SubmissionRow,
	SubmissionSpeakerRow,
	TaskTemplateRow,
} from "./types";

export async function getEventBySlug(
	db: D1Database,
	slug: string,
): Promise<EventRow | null> {
	return db.prepare("SELECT * FROM events WHERE slug = ?").bind(slug).first<EventRow>();
}

export async function getEventById(
	db: D1Database,
	eventId: string,
): Promise<EventRow | null> {
	return db.prepare("SELECT * FROM events WHERE id = ?").bind(eventId).first<EventRow>();
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

export async function getSubmissionById(
	db: D1Database,
	submissionId: string,
): Promise<SubmissionRow | null> {
	return db
		.prepare("SELECT * FROM submissions WHERE id = ?")
		.bind(submissionId)
		.first<SubmissionRow>();
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

export async function getPersonByEmail(
	db: D1Database,
	email: string,
): Promise<PersonRow | null> {
	return db
		.prepare("SELECT * FROM people WHERE email = ?")
		.bind(email.trim().toLowerCase())
		.first<PersonRow>();
}

export async function getPersonById(
	db: D1Database,
	personId: string,
): Promise<PersonRow | null> {
	return db.prepare("SELECT * FROM people WHERE id = ?").bind(personId).first<PersonRow>();
}

export async function listTasksForPerson(
	db: D1Database,
	personId: string,
): Promise<SpeakerTaskRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM speaker_tasks
       WHERE person_id = ?
       ORDER BY created_at ASC`,
		)
		.bind(personId)
		.all<SpeakerTaskRow>();
	return result.results;
}

export async function listTasksForEvent(
	db: D1Database,
	eventId: string,
): Promise<SpeakerTaskRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM speaker_tasks
       WHERE event_id = ?
       ORDER BY created_at DESC`,
		)
		.bind(eventId)
		.all<SpeakerTaskRow>();
	return result.results;
}

export async function listTasksForSubmission(
	db: D1Database,
	submissionId: string,
): Promise<SpeakerTaskRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM speaker_tasks
       WHERE submission_id = ?
       ORDER BY created_at ASC`,
		)
		.bind(submissionId)
		.all<SpeakerTaskRow>();
	return result.results;
}

export async function getSpeakerTaskById(
	db: D1Database,
	taskId: string,
): Promise<SpeakerTaskRow | null> {
	return db
		.prepare("SELECT * FROM speaker_tasks WHERE id = ?")
		.bind(taskId)
		.first<SpeakerTaskRow>();
}

export async function listTaskTemplatesForEvent(
	db: D1Database,
	eventId: string,
): Promise<TaskTemplateRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM task_templates
       WHERE event_id = ?
       ORDER BY position ASC`,
		)
		.bind(eventId)
		.all<TaskTemplateRow>();
	return result.results;
}

export async function getSpeakerProfile(
	db: D1Database,
	eventId: string,
	personId: string,
): Promise<SpeakerProfileRow | null> {
	return db
		.prepare(
			`SELECT * FROM speaker_profiles
       WHERE event_id = ? AND person_id = ?`,
		)
		.bind(eventId, personId)
		.first<SpeakerProfileRow>();
}

export async function getAssetById(
	db: D1Database,
	assetId: string,
): Promise<AssetRow | null> {
	return db.prepare("SELECT * FROM assets WHERE id = ?").bind(assetId).first<AssetRow>();
}

export async function listAcceptedSubmissionsForPerson(
	db: D1Database,
	personId: string,
): Promise<SubmissionRow[]> {
	const result = await db
		.prepare(
			`SELECT s.*
       FROM submissions s
       INNER JOIN submission_speakers ss ON ss.submission_id = s.id
       WHERE ss.person_id = ? AND s.status = 'accepted'
       ORDER BY s.updated_at DESC`,
		)
		.bind(personId)
		.all<SubmissionRow>();
	return result.results;
}
