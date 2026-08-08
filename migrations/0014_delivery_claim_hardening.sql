-- A co-speaker confirmation token is derived from AUTH_SECRET, speaker id and
-- this non-secret generation. The raw bearer token never enters D1.
CREATE TABLE co_speaker_invitation_claims (
	speaker_id TEXT PRIMARY KEY NOT NULL REFERENCES submission_speakers (id),
	generation INTEGER NOT NULL CHECK (generation > 0),
	delivery_key TEXT NOT NULL UNIQUE,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
CREATE INDEX co_speaker_invitation_claims_by_delivery
	ON co_speaker_invitation_claims (delivery_key);

-- Only explicit pre-provider or rejected-provider errors can release a
-- co-speaker claim. Transport and local finalization errors remain `sending`
-- or `provider_accepted` and retain the same provider idempotency key.
ALTER TABLE email_deliveries ADD COLUMN failure_kind TEXT;
