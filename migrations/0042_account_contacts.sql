-- Account-scoped Speaker CRM. Lives above event speaker rosters and the
-- event-only 0036 speaker_crm_* overlay. Contacts are keyed by organizer
-- account and visible across every event that account owns.

CREATE TABLE account_contacts (
	id TEXT PRIMARY KEY NOT NULL,
	account_id TEXT NOT NULL REFERENCES accounts (id),
	email TEXT NOT NULL,
	name TEXT NOT NULL,
	title TEXT,
	company TEXT,
	bio TEXT,
	notes TEXT,
	custom_fields_json TEXT NOT NULL DEFAULT '{}',
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX account_contacts_by_account_email
	ON account_contacts (account_id, email COLLATE NOCASE);
CREATE INDEX account_contacts_by_account_name
	ON account_contacts (account_id, name COLLATE NOCASE);
CREATE INDEX account_contacts_by_account_company
	ON account_contacts (account_id, company COLLATE NOCASE);

CREATE TABLE account_contact_tags (
	account_id TEXT NOT NULL REFERENCES accounts (id),
	contact_id TEXT NOT NULL REFERENCES account_contacts (id) ON DELETE CASCADE,
	tag TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (contact_id, tag)
);
CREATE INDEX account_contact_tags_by_account_tag
	ON account_contact_tags (account_id, tag COLLATE NOCASE);

CREATE TABLE account_contact_activities (
	id TEXT PRIMARY KEY NOT NULL,
	contact_id TEXT NOT NULL REFERENCES account_contacts (id) ON DELETE CASCADE,
	kind TEXT NOT NULL CHECK (kind IN ('note', 'email', 'stage', 'merge', 'system')),
	body TEXT NOT NULL,
	author_account_id TEXT REFERENCES accounts (id),
	occurred_at INTEGER NOT NULL
);
CREATE INDEX account_contact_activities_by_contact
	ON account_contact_activities (contact_id, occurred_at DESC);

CREATE TABLE account_contact_pipeline (
	contact_id TEXT PRIMARY KEY NOT NULL REFERENCES account_contacts (id) ON DELETE CASCADE,
	stage TEXT NOT NULL CHECK (
		stage IN ('research', 'outreach', 'negotiating', 'confirmed', 'declined')
	),
	updated_at INTEGER NOT NULL
);
CREATE INDEX account_contact_pipeline_by_stage
	ON account_contact_pipeline (stage, updated_at DESC);

CREATE TABLE account_contact_stage_history (
	id TEXT PRIMARY KEY NOT NULL,
	contact_id TEXT NOT NULL REFERENCES account_contacts (id) ON DELETE CASCADE,
	from_stage TEXT CHECK (
		from_stage IS NULL OR from_stage IN ('research', 'outreach', 'negotiating', 'confirmed', 'declined')
	),
	to_stage TEXT NOT NULL CHECK (
		to_stage IN ('research', 'outreach', 'negotiating', 'confirmed', 'declined')
	),
	note TEXT,
	changed_by TEXT REFERENCES accounts (id),
	changed_at INTEGER NOT NULL
);
CREATE INDEX account_contact_stage_history_by_contact
	ON account_contact_stage_history (contact_id, changed_at DESC);

CREATE TABLE account_contact_segments (
	id TEXT PRIMARY KEY NOT NULL,
	account_id TEXT NOT NULL REFERENCES accounts (id),
	name TEXT NOT NULL,
	filter_json TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	UNIQUE (account_id, name)
);

-- Handoff link from an account contact into an event speaker roster person.
CREATE TABLE event_speaker_contacts (
	event_id TEXT NOT NULL REFERENCES events (id),
	person_id TEXT NOT NULL REFERENCES people (id),
	contact_id TEXT NOT NULL REFERENCES account_contacts (id) ON DELETE CASCADE,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (event_id, person_id)
);
CREATE INDEX event_speaker_contacts_by_contact
	ON event_speaker_contacts (contact_id, event_id);
CREATE UNIQUE INDEX event_speaker_contacts_by_event_contact
	ON event_speaker_contacts (event_id, contact_id);
