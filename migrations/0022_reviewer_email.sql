-- Optional email on named reviewers so create/regenerate can deliver the
-- one-time /review?token= link. NULL keeps clipboard-only invites valid.
ALTER TABLE reviewers ADD COLUMN email TEXT;

CREATE INDEX reviewers_by_plan_email
	ON reviewers (plan_id, email)
	WHERE email IS NOT NULL;
