-- Production hardening is intentionally additive.  In particular, ownership
-- moves to event_ownership without rebuilding event_memberships, so existing
-- installations keep their account and invitation history.
ALTER TABLE events ADD COLUMN start_day TEXT;
ALTER TABLE events ADD COLUMN end_day TEXT;
ALTER TABLE events ADD COLUMN ownership_claimable INTEGER NOT NULL DEFAULT 0
	CHECK (ownership_claimable IN (0, 1));

-- This is the single first-party seed that pre-dates accounts. It is an
-- explicit remediation, not a general orphan-claim policy.
UPDATE events
SET ownership_claimable = 1
WHERE slug = 'aie-sandbox'
	AND NOT EXISTS (SELECT 1 FROM event_memberships m WHERE m.event_id = events.id);

ALTER TABLE cfp_forms ADD COLUMN welcome_copy TEXT;
ALTER TABLE cfp_forms ADD COLUMN confirmation_copy TEXT;
ALTER TABLE cfp_forms ADD COLUMN reminder_copy TEXT;
ALTER TABLE cfp_forms ADD COLUMN min_speakers INTEGER NOT NULL DEFAULT 1
	CHECK (min_speakers >= 1);
ALTER TABLE cfp_forms ADD COLUMN max_speakers INTEGER NOT NULL DEFAULT 4
	CHECK (max_speakers >= min_speakers);
ALTER TABLE cfp_forms ADD COLUMN drafts_enabled INTEGER NOT NULL DEFAULT 1
	CHECK (drafts_enabled IN (0, 1));
ALTER TABLE cfp_forms ADD COLUMN submission_limit INTEGER NOT NULL DEFAULT 0
	CHECK (submission_limit >= 0);

CREATE TABLE event_ownership (
	event_id TEXT PRIMARY KEY NOT NULL REFERENCES events (id),
	account_id TEXT NOT NULL REFERENCES accounts (id),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	FOREIGN KEY (event_id, account_id)
		REFERENCES event_memberships (event_id, account_id)
);

-- A legacy `owner` row is evidence of an explicit owner, so preserve it in the
-- canonical relation before roles are normalized to admin-only membership.
INSERT INTO event_ownership (event_id, account_id, created_at, updated_at)
SELECT event_id, account_id, created_at, created_at
FROM event_memberships
WHERE role = 'owner';

-- Abort rather than guessing when legacy data has multiple owners or no owner.
-- The table is otherwise unused; its CHECK makes this a portable SQLite error
-- rather than relying on the trigger-only RAISE() expression.
CREATE TABLE production_hardening_migration_guard (
	value TEXT NOT NULL CHECK (value = 'ok')
);
INSERT INTO production_hardening_migration_guard (value)
SELECT 'blocked'
WHERE EXISTS (
	SELECT 1
	FROM events e
	LEFT JOIN event_ownership o ON o.event_id = e.id
	WHERE o.event_id IS NULL AND e.ownership_claimable = 0
);

UPDATE event_memberships SET role = 'admin' WHERE role = 'owner';

CREATE TRIGGER event_memberships_disallow_owner_insert
BEFORE INSERT ON event_memberships
WHEN NEW.role = 'owner'
BEGIN
	SELECT RAISE(ABORT, 'event ownership is stored in event_ownership');
END;

CREATE TRIGGER event_memberships_disallow_owner_update
BEFORE UPDATE OF role ON event_memberships
WHEN NEW.role = 'owner'
BEGIN
	SELECT RAISE(ABORT, 'event ownership is stored in event_ownership');
END;

CREATE TABLE rate_limit_buckets (
	bucket TEXT NOT NULL,
	subject_hash TEXT NOT NULL,
	window_start INTEGER NOT NULL,
	count INTEGER NOT NULL CHECK (count >= 0),
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (bucket, subject_hash, window_start)
);

CREATE TABLE submission_drafts (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	form_id TEXT NOT NULL REFERENCES cfp_forms (id),
	verified_email TEXT NOT NULL COLLATE NOCASE,
	submitter_name TEXT NOT NULL DEFAULT '',
	answers_json TEXT NOT NULL DEFAULT '{}',
	status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
	submission_id TEXT UNIQUE REFERENCES submissions (id),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	finalized_at INTEGER
);
CREATE INDEX submission_drafts_by_form_email
	ON submission_drafts (form_id, verified_email, status);

CREATE TABLE submission_draft_tokens (
	token_hash TEXT PRIMARY KEY NOT NULL,
	draft_id TEXT NOT NULL REFERENCES submission_drafts (id),
	state TEXT NOT NULL CHECK (state IN ('current', 'superseded', 'consumed')),
	expires_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	consumed_at INTEGER,
	tombstone_until INTEGER
);
CREATE INDEX submission_draft_tokens_by_draft ON submission_draft_tokens (draft_id, state);

ALTER TABLE submissions ADD COLUMN submitter_person_id TEXT REFERENCES people (id);
CREATE INDEX submissions_by_submitter_person ON submissions (submitter_person_id);

-- Backfill legacy principals deterministically enough for an opaque TEXT id;
-- no existing person is overwritten and all new writes use crypto UUIDs.
INSERT OR IGNORE INTO people (id, email, name, created_at)
SELECT lower(hex(randomblob(16))), lower(submitter_email), submitter_name, created_at
FROM submissions
WHERE submitter_email IS NOT NULL AND trim(submitter_email) != '';

INSERT OR IGNORE INTO people (id, email, name, created_at)
SELECT lower(hex(randomblob(16))), lower(email), name, 0
FROM submission_speakers
WHERE trim(email) != '';

UPDATE submission_speakers
SET person_id = (SELECT p.id FROM people p WHERE lower(p.email) = lower(submission_speakers.email))
WHERE person_id IS NULL AND trim(email) != '';

-- New submissions always materialize the person in the same batch.
UPDATE submissions
SET submitter_person_id = (
	SELECT p.id FROM people p
	WHERE lower(p.email) = lower(submissions.submitter_email)
)
WHERE submitter_email IS NOT NULL
	AND EXISTS (
		SELECT 1 FROM people p
		WHERE lower(p.email) = lower(submissions.submitter_email)
	);

CREATE UNIQUE INDEX submission_speakers_submission_email_unique
	ON submission_speakers (submission_id, lower(email));
CREATE UNIQUE INDEX submission_speakers_submission_position_unique
	ON submission_speakers (submission_id, position);

CREATE TRIGGER submissions_enforce_form_submission_limit_insert
BEFORE INSERT ON submissions
WHEN NEW.status = 'submitted'
	AND COALESCE((SELECT submission_limit FROM cfp_forms WHERE id = NEW.form_id), 0) > 0
	AND (
		SELECT COUNT(*) FROM submissions
		WHERE form_id = NEW.form_id AND status IN ('submitted', 'under_review', 'accepted', 'rejected', 'waitlisted', 'scheduled', 'published')
	) >= (SELECT submission_limit FROM cfp_forms WHERE id = NEW.form_id)
BEGIN
	SELECT RAISE(ABORT, 'submission limit reached');
END;

CREATE TRIGGER submissions_enforce_form_submission_limit_finalize
BEFORE UPDATE OF status ON submissions
WHEN OLD.status = 'draft' AND NEW.status = 'submitted'
	AND COALESCE((SELECT submission_limit FROM cfp_forms WHERE id = NEW.form_id), 0) > 0
	AND (
		SELECT COUNT(*) FROM submissions
		WHERE form_id = NEW.form_id AND status IN ('submitted', 'under_review', 'accepted', 'rejected', 'waitlisted', 'scheduled', 'published')
	) >= (SELECT submission_limit FROM cfp_forms WHERE id = NEW.form_id)
BEGIN
	SELECT RAISE(ABORT, 'submission limit reached');
END;
