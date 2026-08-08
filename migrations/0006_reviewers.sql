-- Named reviewers for evaluation committees (per-plan tokens).
CREATE TABLE reviewers (
	id TEXT PRIMARY KEY NOT NULL,
	plan_id TEXT NOT NULL REFERENCES evaluation_plans (id),
	name TEXT NOT NULL,
	token TEXT NOT NULL UNIQUE,
	created_at INTEGER NOT NULL
);

CREATE INDEX reviewers_by_plan ON reviewers (plan_id);

ALTER TABLE evaluation_scores ADD COLUMN reviewer_id TEXT REFERENCES reviewers (id);

-- One score per named reviewer per submission; NULL reviewer_id (committee) excluded.
CREATE UNIQUE INDEX evaluation_scores_by_submission_reviewer
	ON evaluation_scores (submission_id, reviewer_id)
	WHERE reviewer_id IS NOT NULL;

CREATE INDEX evaluation_scores_by_reviewer ON evaluation_scores (reviewer_id);
