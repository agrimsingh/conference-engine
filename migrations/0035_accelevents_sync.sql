-- Accelevents is an explicit organizer-controlled one-way projection. D1 remains
-- the source of truth: the encrypted API key is only used to push selected
-- speakers and accepted/scheduled sessions out, and mappings prevent duplicates.
CREATE TABLE accelevents_integrations (
	event_id TEXT PRIMARY KEY NOT NULL REFERENCES events (id),
	event_url TEXT NOT NULL UNIQUE,
	external_event_id INTEGER NOT NULL CHECK (external_event_id > 0),
	session_type_format TEXT NOT NULL CHECK (session_type_format IN ('IN_PERSON', 'VIRTUAL', 'HYBRID')),
	encrypted_api_key TEXT NOT NULL,
	api_key_iv TEXT NOT NULL,
	last_sync_at INTEGER,
	last_sync_error TEXT,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE TABLE accelevents_sync_mappings (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	local_kind TEXT NOT NULL CHECK (local_kind IN ('speaker', 'session')),
	local_id TEXT NOT NULL,
	external_id TEXT,
	source_fingerprint TEXT NOT NULL,
	sync_state TEXT NOT NULL DEFAULT 'synced' CHECK (sync_state IN ('creating', 'synced')),
	last_synced_at INTEGER NOT NULL,
	UNIQUE (event_id, local_kind, local_id)
);

CREATE INDEX accelevents_sync_mappings_by_event
	ON accelevents_sync_mappings (event_id, local_kind, local_id);
