CREATE TABLE accounts (
	id TEXT PRIMARY KEY NOT NULL,
	email TEXT NOT NULL COLLATE NOCASE,
	name TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX accounts_email_unique ON accounts (email);

CREATE TABLE event_memberships (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	account_id TEXT NOT NULL REFERENCES accounts (id),
	role TEXT NOT NULL CHECK (role IN ('owner', 'admin')),
	created_at INTEGER NOT NULL,
	UNIQUE (event_id, account_id)
);

CREATE INDEX event_memberships_by_account ON event_memberships (account_id);
CREATE INDEX event_memberships_by_event ON event_memberships (event_id);
