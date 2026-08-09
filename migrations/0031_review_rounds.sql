-- Independent dated review rounds, typed scorecards, and assignment limits.
-- Evaluation plans are the existing round boundary: criteria, reviewers,
-- assignments, scores, reminders, and exports are already scoped by plan_id.
ALTER TABLE evaluation_plans ADD COLUMN open_at INTEGER;
ALTER TABLE evaluation_plans ADD COLUMN close_at INTEGER;
ALTER TABLE evaluation_plans ADD COLUMN blind_review INTEGER NOT NULL DEFAULT 0 CHECK (blind_review IN (0, 1));
ALTER TABLE evaluation_plans ADD COLUMN assignment_cap INTEGER CHECK (assignment_cap IS NULL OR assignment_cap > 0);

ALTER TABLE evaluation_criteria ADD COLUMN criterion_type TEXT NOT NULL DEFAULT 'numeric'
	CHECK (criterion_type IN ('numeric', 'dropdown', 'text'));
ALTER TABLE evaluation_criteria ADD COLUMN options_json TEXT;

-- Numeric scores remain in score. Dropdown/text values use value_text while a
-- zero placeholder preserves compatibility with historical NOT NULL rows.
ALTER TABLE evaluation_criterion_scores ADD COLUMN value_text TEXT;

-- The original aggregate column was constrained to integer 1..5. Dated rounds
-- may use a 1..10 numeric criterion, and exact weighted means are fractional.
DROP INDEX evaluation_scores_by_plan;
DROP INDEX evaluation_scores_by_submission;
DROP INDEX evaluation_scores_by_submission_reviewer;
DROP INDEX evaluation_scores_by_reviewer;
ALTER TABLE evaluation_scores RENAME TO evaluation_scores_legacy;
CREATE TABLE evaluation_scores (
	id TEXT PRIMARY KEY NOT NULL,
	plan_id TEXT NOT NULL REFERENCES evaluation_plans (id),
	submission_id TEXT NOT NULL REFERENCES submissions (id),
	score REAL NOT NULL CHECK (score >= 0 AND score <= 100),
	comment TEXT,
	scored_by TEXT NOT NULL,
	reviewer_id TEXT REFERENCES reviewers (id),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	UNIQUE (plan_id, submission_id, scored_by)
);
INSERT INTO evaluation_scores (id, plan_id, submission_id, score, comment, scored_by, reviewer_id, created_at, updated_at)
	SELECT id, plan_id, submission_id, score, comment, scored_by, reviewer_id, created_at, updated_at FROM evaluation_scores_legacy;
DROP TABLE evaluation_scores_legacy;
CREATE INDEX evaluation_scores_by_plan ON evaluation_scores (plan_id);
CREATE INDEX evaluation_scores_by_submission ON evaluation_scores (submission_id);
CREATE UNIQUE INDEX evaluation_scores_by_submission_reviewer
	ON evaluation_scores (submission_id, reviewer_id) WHERE reviewer_id IS NOT NULL;
CREATE INDEX evaluation_scores_by_reviewer ON evaluation_scores (reviewer_id);

CREATE INDEX evaluation_plans_by_event_dates
	ON evaluation_plans (event_id, open_at, close_at, created_at);
