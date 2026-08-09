-- Additive speaker/content fields for eval unlock + admin roster consumption.
-- Profile fields live on event-scoped speaker_profiles (not global people).
-- social_json shape: {"twitter"|"linkedin"|"github"|"website": string}
-- Task instructions/due_at are authored on templates and snapshotted onto
-- speaker_tasks at accept/materialize (same pattern as template_label).

ALTER TABLE speaker_profiles ADD COLUMN job_title TEXT;
ALTER TABLE speaker_profiles ADD COLUMN company TEXT;
ALTER TABLE speaker_profiles ADD COLUMN social_json TEXT;

ALTER TABLE task_templates ADD COLUMN instructions TEXT;
ALTER TABLE task_templates ADD COLUMN due_at INTEGER;

ALTER TABLE speaker_tasks ADD COLUMN instructions TEXT;
ALTER TABLE speaker_tasks ADD COLUMN due_at INTEGER;
