-- Co-speaker lifecycle on submission_speakers.
-- Existing rows (pre-migration speakers) default to 'confirmed': they were
-- materialized under the old rules and must keep their tasks and listings.
ALTER TABLE submission_speakers
	ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed'
		CHECK (status IN ('pending', 'confirmed', 'declined', 'removed'));

ALTER TABLE submission_speakers ADD COLUMN invited_at INTEGER;

ALTER TABLE submission_speakers ADD COLUMN confirmed_at INTEGER;

-- Post-acceptance additions are the free-ticket abuse pattern; flag them.
ALTER TABLE submission_speakers
	ADD COLUMN added_after_acceptance INTEGER NOT NULL DEFAULT 0;

-- SHA-256 hash of the confirm/decline link token. The raw token is only ever
-- in the invite email; a lost token is recovered by resending the invite.
ALTER TABLE submission_speakers ADD COLUMN confirm_token_hash TEXT;

CREATE INDEX submission_speakers_by_token_hash
	ON submission_speakers (confirm_token_hash);

CREATE INDEX submission_speakers_by_status
	ON submission_speakers (submission_id, status);
