-- A session can be retried after an interrupted import, but identity and task
-- materialization must have one durable owner at a time. Expired leases are
-- reclaimable so a crashed worker cannot strand the session permanently.
CREATE TABLE session_materialization_claims (
	submission_id TEXT PRIMARY KEY NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
	owner_token TEXT NOT NULL,
	lease_expires_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE INDEX session_materialization_claims_by_expiry
	ON session_materialization_claims (lease_expires_at);
