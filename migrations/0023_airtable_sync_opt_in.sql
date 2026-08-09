-- Per-event opt-in for the nightly Airtable one-way export. D1 remains SoR.
ALTER TABLE events ADD COLUMN airtable_sync_enabled INTEGER NOT NULL DEFAULT 0
	CHECK (airtable_sync_enabled IN (0, 1));

CREATE INDEX events_airtable_sync_enabled
	ON events (airtable_sync_enabled)
	WHERE airtable_sync_enabled = 1;
