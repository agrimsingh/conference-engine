export type EventRow = {
	id: string;
	slug: string;
	name: string;
	timezone: string;
	created_at: number;
	updated_at: number;
};

export type CfpFormRow = {
	id: string;
	event_id: string;
	slug: string;
	title: string;
	description: string | null;
	status: "draft" | "open" | "closed";
	opens_at: number | null;
	closes_at: number | null;
	created_at: number;
	updated_at: number;
};

export type FormFieldRow = {
	id: string;
	form_id: string;
	key: string;
	label: string;
	field_type: string;
	required: number;
	position: number;
	visibility_rule: string;
	config: string;
	soft_deleted: number;
};

export type SubmissionRow = {
	id: string;
	form_id: string;
	event_id: string;
	status: string;
	answers_json: string;
	submitter_email: string | null;
	submitter_name: string | null;
	created_at: number;
	updated_at: number;
	submitted_at: number | null;
};

export type SubmissionSpeakerRow = {
	id: string;
	submission_id: string;
	person_id: string | null;
	name: string;
	email: string;
	bio: string | null;
	position: number;
};

export type PersonRow = {
	id: string;
	email: string;
	name: string | null;
	created_at: number;
};

export type TaskTemplateRow = {
	id: string;
	event_id: string;
	key: string;
	label: string;
	task_kind: "text" | "file";
	required: number;
	position: number;
};

export type SpeakerTaskRow = {
	id: string;
	event_id: string;
	submission_id: string;
	person_id: string;
	template_key: string;
	status: "pending" | "completed";
	asset_id: string | null;
	text_value: string | null;
	completed_at: number | null;
	created_at: number;
	updated_at: number;
};

export type AssetRow = {
	id: string;
	event_id: string;
	r2_key: string;
	content_type: string | null;
	filename: string | null;
	uploaded_by_person_id: string | null;
	created_at: number;
};

export type SpeakerProfileRow = {
	id: string;
	event_id: string;
	person_id: string;
	display_name: string | null;
	bio: string | null;
	headshot_asset_id: string | null;
	created_at: number;
	updated_at: number;
};

export type EvaluationPlanRow = {
	id: string;
	event_id: string;
	name: string;
	status: "draft" | "active" | "closed";
	reviewer_token: string;
	created_at: number;
	updated_at: number;
};

export type EvaluationScoreRow = {
	id: string;
	plan_id: string;
	submission_id: string;
	score: number;
	comment: string | null;
	scored_by: string;
	created_at: number;
	updated_at: number;
};

export type OutboundMessageRow = {
	id: string;
	event_id: string;
	submission_id: string | null;
	template_key: string;
	to_email: string;
	subject: string;
	status: "sent" | "failed" | "skipped";
	provider_id: string | null;
	error: string | null;
	created_at: number;
};

export type AgendaSlotRow = {
	id: string;
	event_id: string;
	submission_id: string;
	room_name: string;
	starts_at: number;
	ends_at: number;
	ics_uid: string;
	created_at: number;
	updated_at: number;
};
