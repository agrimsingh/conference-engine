-- Per-plan assignment of submissions to named reviewers.
CREATE TABLE review_assignments (
	id TEXT PRIMARY KEY NOT NULL,
	plan_id TEXT NOT NULL REFERENCES evaluation_plans (id),
	reviewer_id TEXT NOT NULL REFERENCES reviewers (id),
	submission_id TEXT NOT NULL REFERENCES submissions (id),
	created_at INTEGER NOT NULL,
	UNIQUE (plan_id, reviewer_id, submission_id)
);

CREATE INDEX review_assignments_by_reviewer ON review_assignments (plan_id, reviewer_id);
CREATE INDEX review_assignments_by_submission ON review_assignments (plan_id, submission_id);
