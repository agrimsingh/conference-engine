-- Final-gate security state is deliberately additive. Existing outbound rows
-- remain the historical audit log; new sends use email_deliveries so a provider
-- acceptance can be recovered without generating a second email.
CREATE TABLE email_deliveries (
	delivery_key TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	submission_id TEXT REFERENCES submissions (id),
	template_key TEXT NOT NULL,
	to_email TEXT NOT NULL,
	subject TEXT NOT NULL,
	status TEXT NOT NULL CHECK (status IN ('reserved', 'sending', 'provider_accepted', 'sent', 'failed')),
	provider_id TEXT,
	error TEXT,
	attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
	lease_expires_at INTEGER,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	provider_accepted_at INTEGER,
	sent_at INTEGER
);
CREATE INDEX email_deliveries_by_submission_template
	ON email_deliveries (submission_id, template_key, status);
CREATE INDEX email_deliveries_by_event ON email_deliveries (event_id, created_at);

-- Raw login tokens never enter D1. token_hash is HMAC(AUTH_SECRET, token).
CREATE TABLE auth_challenges (
	token_hash TEXT PRIMARY KEY NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN ('organizer_login', 'event_invite', 'portal_login')),
	account_id TEXT REFERENCES accounts (id),
	person_id TEXT REFERENCES people (id),
	event_id TEXT REFERENCES events (id),
	state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'failed', 'consumed')),
	expires_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	consumed_at INTEGER,
	failure_reason TEXT
);
CREATE INDEX auth_challenges_by_expiry ON auth_challenges (expires_at, state);

-- Invitations have no membership side effect. In particular, an owner invite
-- cannot move event_ownership until its active, emailed challenge is accepted.
CREATE TABLE event_invitations (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	account_id TEXT NOT NULL REFERENCES accounts (id),
	email TEXT NOT NULL COLLATE NOCASE,
	name TEXT NOT NULL DEFAULT '',
	role TEXT NOT NULL CHECK (role IN ('admin', 'owner')),
	token_hash TEXT NOT NULL UNIQUE REFERENCES auth_challenges (token_hash),
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'accepted', 'failed')),
	invited_by_account_id TEXT REFERENCES accounts (id),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	delivered_at INTEGER,
	accepted_at INTEGER
);
CREATE INDEX event_invitations_by_event_status ON event_invitations (event_id, status);
CREATE INDEX event_invitations_by_email ON event_invitations (event_id, email, status);
