-- Per-event personal access tokens for agent/API Bearer auth.
CREATE TABLE event_api_tokens (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	name TEXT NOT NULL,
	token_prefix TEXT NOT NULL,
	token_hash TEXT NOT NULL UNIQUE,
	scopes_json TEXT NOT NULL DEFAULT '["*"]',
	created_by_account_id TEXT REFERENCES accounts (id),
	created_at INTEGER NOT NULL,
	last_used_at INTEGER,
	revoked_at INTEGER
);

CREATE INDEX event_api_tokens_by_event ON event_api_tokens (event_id, created_at);
CREATE INDEX event_api_tokens_by_hash ON event_api_tokens (token_hash);
