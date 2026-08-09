-- Structured task definitions are snapshotted at acceptance just like labels,
-- instructions, and due dates. Existing text/file rows remain unchanged.
ALTER TABLE task_templates ADD COLUMN form_schema_json TEXT;
ALTER TABLE speaker_tasks ADD COLUMN form_schema_json TEXT;
