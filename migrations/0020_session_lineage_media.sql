-- Organizer-created sessions stay in the submission lifecycle, but retain
-- enough provenance to make imports and cross-event copies auditable.
ALTER TABLE submissions ADD COLUMN lineage_parent_submission_id TEXT REFERENCES submissions (id);
ALTER TABLE submissions ADD COLUMN lineage_root_submission_id TEXT REFERENCES submissions (id);
ALTER TABLE submissions ADD COLUMN lineage_source_event_id TEXT REFERENCES events (id);
ALTER TABLE submissions ADD COLUMN import_key TEXT;

-- These fields are intentionally separate from answers_json: public clients
-- can depend on their semantics without reverse-engineering a CFP form.
ALTER TABLE submissions ADD COLUMN video_url TEXT;
ALTER TABLE submissions ADD COLUMN google_doc_url TEXT;
ALTER TABLE submissions ADD COLUMN supporting_url TEXT;

CREATE INDEX submissions_by_lineage_parent
  ON submissions (lineage_parent_submission_id);
CREATE INDEX submissions_by_lineage_root
  ON submissions (lineage_root_submission_id);
CREATE UNIQUE INDEX submissions_import_key_per_event
  ON submissions (event_id, import_key)
  WHERE import_key IS NOT NULL;
