-- Category doubles as schedule track. Set at submit time from form routing rules.
ALTER TABLE submissions ADD COLUMN category TEXT;

CREATE INDEX submissions_by_event_category ON submissions (event_id, category);
