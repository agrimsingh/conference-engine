-- Evaluation workflows add durable reviewer invalidation, digest-backed bearer
-- tokens, and normalized rubric scores without changing aggregate score rows.
ALTER TABLE evaluation_plans ADD COLUMN reviewer_token_digest TEXT;
ALTER TABLE reviewers ADD COLUMN revoked_at INTEGER;
ALTER TABLE reviewers ADD COLUMN token_digest TEXT;

-- A runtime backfill converts pre-migration raw tokens to SHA-256 digests
-- because D1 SQLite deliberately has no cryptographic hash SQL function. New
-- writes use the digest columns immediately; legacy token columns retain only
-- unique non-secret storage markers after that backfill.
CREATE UNIQUE INDEX evaluation_plans_reviewer_token_digest_unique
	ON evaluation_plans (reviewer_token_digest)
	WHERE reviewer_token_digest IS NOT NULL;
CREATE UNIQUE INDEX reviewers_token_digest_unique
	ON reviewers (token_digest)
	WHERE token_digest IS NOT NULL;
CREATE INDEX reviewers_active_by_plan
	ON reviewers (plan_id, revoked_at, created_at);

-- Historical databases may have accidentally accumulated multiple active
-- plans before this invariant existed. Keep the most recently changed one and
-- close the rest before enforcing one active plan per event.
WITH ranked AS (
	SELECT id, ROW_NUMBER() OVER (
		PARTITION BY event_id
		ORDER BY updated_at DESC, created_at DESC, id DESC
	) AS position
	FROM evaluation_plans
	WHERE status = 'active'
)
UPDATE evaluation_plans
SET status = 'closed'
WHERE id IN (SELECT id FROM ranked WHERE position > 1);
CREATE UNIQUE INDEX evaluation_plans_one_active_per_event
	ON evaluation_plans (event_id)
	WHERE status = 'active';

CREATE TABLE evaluation_criterion_scores (
	id TEXT PRIMARY KEY NOT NULL,
	plan_id TEXT NOT NULL REFERENCES evaluation_plans (id),
	criterion_id TEXT NOT NULL REFERENCES evaluation_criteria (id),
	submission_id TEXT NOT NULL REFERENCES submissions (id),
	reviewer_id TEXT REFERENCES reviewers (id),
	score INTEGER NOT NULL,
	comment TEXT,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

-- SQLite treats NULL values as distinct in a composite UNIQUE constraint, so
-- committee scores use their own partial unique index.
CREATE UNIQUE INDEX evaluation_criterion_scores_reviewer_unique
	ON evaluation_criterion_scores (criterion_id, submission_id, reviewer_id)
	WHERE reviewer_id IS NOT NULL;
CREATE UNIQUE INDEX evaluation_criterion_scores_committee_unique
	ON evaluation_criterion_scores (criterion_id, submission_id)
	WHERE reviewer_id IS NULL;
CREATE INDEX evaluation_criterion_scores_by_plan_submission
	ON evaluation_criterion_scores (plan_id, submission_id, updated_at DESC);
