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
