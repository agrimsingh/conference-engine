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
	airtable_sync_enabled?: number;
	notify_on_submission_create?: number;
	notify_on_submission_update?: number;
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
	/** Optional JSON section metadata from the form builder (Phase 3). */
	sections_json?: string | null;
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
	section_key?: string | null;
};

export type SubmissionRow = {
	id: string;
	form_id: string;
	event_id: string;
	status: string;
	content_status?: "draft" | "in_review" | "approved";
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
	instructions?: string | null;
	due_at?: number | null;
	form_schema_json?: string | null;
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
	instructions?: string | null;
	due_at?: number | null;
	form_schema_json?: string | null;
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
	form_id?: string | null;
	field_key?: string | null;
	created_at: number;
};

export type DeliverableVersionRow = {
	id: string;
	event_id: string;
	task_id: string;
	asset_id: string;
	version_number: number;
	uploaded_by_person_id: string | null;
	size_bytes: number;
	created_at: number;
};

export type DeliverableCommentRow = {
	id: string;
	event_id: string;
	task_id: string;
	author_kind: "speaker" | "organizer";
	author_person_id: string | null;
	author_account_id: string | null;
	author_name: string;
	body: string;
	created_at: number;
};

export type ContentRevisionRow = {
	id: string;
	event_id: string;
	entity_type: "session" | "speaker";
	entity_id: string;
	revision_number: number;
	snapshot_json: string;
	editor_account_id: string | null;
	editor_name: string;
	restored_from_revision_id: string | null;
	created_at: number;
};

export type SpeakerProfileRow = {
	id: string;
	event_id: string;
	person_id: string;
	display_name: string | null;
	bio: string | null;
	job_title: string | null;
	company: string | null;
	salutation: string | null;
	pronouns: string | null;
	honorific: string | null;
	social_json: string | null;
	headshot_asset_id: string | null;
	logistics_text?: string | null;
	created_at: number;
	updated_at: number;
};

export type PortalResourceRow = {
	id: string;
	event_id: string;
	title: string;
	slug: string;
	resource_type: "rich_text" | "embed";
	content: string;
	embed_url: string | null;
	published: number;
	position: number;
	created_at: number;
	updated_at: number;
};

/**
 * Organizer workflow row. Profile contact fields (job/company/social) are
 * legacy columns; source of truth is speaker_profiles.
 */
export type EventSpeakerProfileRow = {
	id: string;
	event_id: string;
	person_id: string;
	job_title: string | null;
	company: string | null;
	social_json: string | null;
	workflow_status: "invited" | "confirmed" | "declined" | "withdrawn";
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
	open_at: number | null;
	close_at: number | null;
	blind_review: number;
	assignment_cap: number | null;
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
	email: string | null;
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
	criterion_type: "numeric" | "dropdown" | "text";
	options_json: string | null;
};

export type AgendaSlotWithSubmissionRow = AgendaSlotRow & {
	submission_status: string;
	answers_json: string;
	approved_answers_json?: string | null;
	content_approved?: number;
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
	recused_at: number | null;
};
