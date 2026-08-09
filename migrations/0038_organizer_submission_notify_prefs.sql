-- Per-event organizer email prefs for submission create/update fan-out.
-- Defaults: notify on create (1), not on update (0). Existing rows inherit via DEFAULT.
ALTER TABLE events ADD COLUMN notify_on_submission_create INTEGER NOT NULL DEFAULT 1
	CHECK (notify_on_submission_create IN (0, 1));

ALTER TABLE events ADD COLUMN notify_on_submission_update INTEGER NOT NULL DEFAULT 0
	CHECK (notify_on_submission_update IN (0, 1));
