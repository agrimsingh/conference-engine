export type AccountRow = {
	id: string;
	email: string;
	name: string;
	created_at: number;
	updated_at: number;
};

export type EventMembershipRow = {
	id: string;
	event_id: string;
	account_id: string;
	role: "owner" | "admin";
	created_at: number;
};

export type EventRow = {
	id: string;
	slug: string;
	name: string;
	timezone: string;
	/** Civil event boundaries used to seed schedule navigation when no slots exist. */
	start_day: string | null;
	end_day: string | null;
	mode?: "live" | "demo";
	track_conflict_policy?: "hard" | "allow";
	day_start_minutes?: number;
	day_end_minutes?: number;
	slot_duration_minutes?: number;
	archived_at?: number | null;
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
	/** Optional JSON category route, configured per form by an organizer. */
	category_routing_json?: string | null;
	welcome_copy: string | null;
	confirmation_copy: string | null;
	reminder_copy: string | null;
	thank_you_copy?: string | null;
	min_speakers: number;
	max_speakers: number;
	drafts_enabled: number;
	submission_limit: number;
	kind?: "public" | "system";
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
	/** Schedule track label; NULL → Uncategorized */
	category: string | null;
	submitter_email: string | null;
	submitter_name: string | null;
	submitter_person_id: string | null;
	origin?: "cfp" | "manual" | "invited" | "imported" | "cloned";
	/** Explicit source chain for an organizer-created copy. */
	lineage_parent_submission_id?: string | null;
	lineage_root_submission_id?: string | null;
	lineage_source_event_id?: string | null;
	/** Stable CSV-row fingerprint; unique only inside its event. */
	import_key?: string | null;
	video_url?: string | null;
	google_doc_url?: string | null;
	supporting_url?: string | null;
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
	status: "pending" | "confirmed" | "declined" | "removed";
	invited_at: number | null;
	confirmed_at: number | null;
	added_after_acceptance: number;
	confirm_token_hash: string | null;
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
	soft_deleted?: number;
	created_at?: number;
	updated_at?: number;
};

export type SpeakerTaskRow = {
	id: string;
	event_id: string;
	submission_id: string;
	person_id: string;
	template_key: string;
	template_label?: string;
	template_task_kind?: "text" | "file";
	template_required?: number;
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
	reviewer_id: string | null;
	created_at: number;
	updated_at: number;
};

export type ReviewerRow = {
	id: string;
	plan_id: string;
	name: string;
	token: string;
	created_at: number;
};

export type SubmissionLabelRow = {
	id: string;
	submission_id: string;
	label: string;
	created_at: number;
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
	room_id: string | null;
	track_id?: string | null;
	room_name: string;
	starts_at: number;
	ends_at: number;
	ics_uid: string;
	created_at: number;
	updated_at: number;
};

export type EventRoomRow = {
	id: string;
	event_id: string;
	name: string;
	position: number;
	soft_deleted?: number;
	created_at: number;
	updated_at?: number;
};

export type AgendaTrackRow = {
	id: string;
	event_id: string;
	name: string;
	slug: string;
	position: number;
	soft_deleted: number;
	created_at: number;
	updated_at: number;
};

export type EvaluationCriterionRow = {
	id: string;
	plan_id: string;
	label: string;
	description: string | null;
	weight: number;
	scale_min: number;
	scale_max: number;
	position: number;
	soft_deleted: number;
	created_at: number;
	updated_at: number;
};

export type AgendaSlotWithSubmissionRow = AgendaSlotRow & {
	submission_status: string;
	answers_json: string;
	category: string | null;
	submitter_name: string | null;
	submitter_email: string | null;
	video_url?: string | null;
	google_doc_url?: string | null;
	supporting_url?: string | null;
};

export type ReviewAssignmentRow = {
	id: string;
	plan_id: string;
	reviewer_id: string;
	submission_id: string;
	created_at: number;
};
