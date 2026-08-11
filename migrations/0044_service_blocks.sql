ALTER TABLE submissions ADD COLUMN item_kind TEXT NOT NULL DEFAULT 'talk'
	CHECK (item_kind IN ('talk', 'service'));
ALTER TABLE submissions ADD COLUMN agenda_visibility TEXT NOT NULL DEFAULT 'public'
	CHECK (agenda_visibility IN ('public', 'private'));
CREATE INDEX submissions_by_event_item_kind ON submissions (event_id, item_kind);
