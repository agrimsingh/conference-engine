CREATE TABLE cfp_form_revisions (
	id TEXT PRIMARY KEY NOT NULL,
	form_id TEXT NOT NULL,
	revision INTEGER NOT NULL,
	snapshot_json TEXT NOT NULL,
	published_at INTEGER NOT NULL,
	published_by_account_id TEXT,
	UNIQUE (form_id, revision)
);
CREATE INDEX cfp_form_revisions_by_form ON cfp_form_revisions (form_id, revision);

ALTER TABLE cfp_forms ADD COLUMN published_revision_id TEXT;
ALTER TABLE submissions ADD COLUMN form_revision_id TEXT;
ALTER TABLE submission_drafts ADD COLUMN form_revision_id TEXT;

CREATE TABLE speaker_handoffs (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL,
	submission_id TEXT NOT NULL,
	speaker_person_id TEXT NOT NULL,
	manager_email TEXT NOT NULL COLLATE NOCASE,
	manager_name TEXT,
	manager_person_id TEXT,
	token_hash TEXT NOT NULL UNIQUE,
	status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
	created_at INTEGER NOT NULL,
	resolved_at INTEGER
);
CREATE INDEX speaker_handoffs_by_speaker ON speaker_handoffs (speaker_person_id, status);
CREATE INDEX speaker_handoffs_by_manager ON speaker_handoffs (manager_person_id, status);
CREATE INDEX speaker_handoffs_by_submission ON speaker_handoffs (submission_id);

CREATE TABLE agenda_slot_acks (
	submission_id TEXT NOT NULL,
	person_id TEXT NOT NULL,
	sequence INTEGER NOT NULL,
	acknowledged_at INTEGER NOT NULL,
	PRIMARY KEY (submission_id, person_id)
);

ALTER TABLE agenda_slots ADD COLUMN ack_required INTEGER NOT NULL DEFAULT 0;
