CREATE TABLE events (
	id TEXT PRIMARY KEY NOT NULL,
	slug TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL,
	timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE TABLE people (
	id TEXT PRIMARY KEY NOT NULL,
	email TEXT NOT NULL UNIQUE,
	name TEXT,
	created_at INTEGER NOT NULL
);

CREATE INDEX people_by_email ON people (email);

CREATE TABLE event_members (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	person_id TEXT NOT NULL REFERENCES people (id),
	role TEXT NOT NULL CHECK (role IN ('organizer', 'reviewer', 'speaker')),
	created_at INTEGER NOT NULL,
	UNIQUE (event_id, person_id, role)
);

CREATE INDEX event_members_by_event ON event_members (event_id);
CREATE INDEX event_members_by_person ON event_members (person_id);

CREATE TABLE cfp_forms (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	slug TEXT NOT NULL,
	title TEXT NOT NULL,
	description TEXT,
	status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
	opens_at INTEGER,
	closes_at INTEGER,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	UNIQUE (event_id, slug)
);

CREATE INDEX cfp_forms_by_event ON cfp_forms (event_id);

CREATE TABLE form_fields (
	id TEXT PRIMARY KEY NOT NULL,
	form_id TEXT NOT NULL REFERENCES cfp_forms (id),
	key TEXT NOT NULL,
	label TEXT NOT NULL,
	field_type TEXT NOT NULL,
	required INTEGER NOT NULL DEFAULT 0,
	position INTEGER NOT NULL,
	visibility_rule TEXT NOT NULL DEFAULT '{"op":"always"}',
	config TEXT NOT NULL DEFAULT '{}',
	soft_deleted INTEGER NOT NULL DEFAULT 0,
	UNIQUE (form_id, key)
);

CREATE INDEX form_fields_by_form ON form_fields (form_id, position);

CREATE TABLE submissions (
	id TEXT PRIMARY KEY NOT NULL,
	form_id TEXT NOT NULL REFERENCES cfp_forms (id),
	event_id TEXT NOT NULL REFERENCES events (id),
	status TEXT NOT NULL CHECK (
		status IN (
			'draft',
			'submitted',
			'under_review',
			'accepted',
			'rejected',
			'waitlisted',
			'scheduled',
			'published',
			'withdrawn'
		)
	),
	answers_json TEXT NOT NULL DEFAULT '{}',
	submitter_email TEXT,
	submitter_name TEXT,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	submitted_at INTEGER
);

CREATE INDEX submissions_by_event ON submissions (event_id, created_at);
CREATE INDEX submissions_by_form ON submissions (form_id);
CREATE INDEX submissions_by_status ON submissions (event_id, status);

CREATE TABLE submission_speakers (
	id TEXT PRIMARY KEY NOT NULL,
	submission_id TEXT NOT NULL REFERENCES submissions (id),
	person_id TEXT REFERENCES people (id),
	name TEXT NOT NULL,
	email TEXT NOT NULL,
	bio TEXT,
	position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX submission_speakers_by_submission ON submission_speakers (submission_id);

CREATE TABLE speaker_profiles (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	person_id TEXT NOT NULL REFERENCES people (id),
	display_name TEXT,
	bio TEXT,
	headshot_asset_id TEXT,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	UNIQUE (event_id, person_id)
);

CREATE INDEX speaker_profiles_by_event ON speaker_profiles (event_id);

CREATE TABLE assets (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	r2_key TEXT NOT NULL,
	content_type TEXT,
	filename TEXT,
	uploaded_by_person_id TEXT REFERENCES people (id),
	created_at INTEGER NOT NULL
);

CREATE INDEX assets_by_event ON assets (event_id);
