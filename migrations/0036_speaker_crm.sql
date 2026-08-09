-- Organizer-only CRM overlay. Speaker identity, delivery history, and task
-- state remain in their existing tables; these rows only add private follow-up
-- context scoped to an event and speaker.
CREATE TABLE speaker_crm_profiles (
	event_id TEXT NOT NULL REFERENCES events (id),
	person_id TEXT NOT NULL REFERENCES people (id),
	owner_account_id TEXT REFERENCES accounts (id),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (event_id, person_id)
);
CREATE INDEX speaker_crm_profiles_by_event_owner
	ON speaker_crm_profiles (event_id, owner_account_id);

CREATE TABLE speaker_crm_tags (
	event_id TEXT NOT NULL,
	person_id TEXT NOT NULL,
	tag TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (event_id, person_id, tag),
	FOREIGN KEY (event_id, person_id)
		REFERENCES speaker_crm_profiles (event_id, person_id)
);
CREATE INDEX speaker_crm_tags_by_event_tag
	ON speaker_crm_tags (event_id, tag);

CREATE TABLE speaker_crm_activities (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL,
	person_id TEXT NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN ('note', 'contact')),
	body TEXT NOT NULL,
	author_account_id TEXT REFERENCES accounts (id),
	occurred_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	FOREIGN KEY (event_id, person_id)
		REFERENCES speaker_crm_profiles (event_id, person_id)
);
CREATE INDEX speaker_crm_activities_by_speaker
	ON speaker_crm_activities (event_id, person_id, occurred_at DESC);
