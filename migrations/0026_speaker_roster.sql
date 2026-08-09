-- Organizer speaker roster (eval/speaker-roster).
--
-- Schema choice: own event_speaker_profiles rather than ALTER people or
-- speaker_profiles. A parallel fields agent may ADD job_title/company/social_json
-- on speaker_profiles (0025_speaker_profile_task_fields.sql). This table is the
-- durable organizer-facing roster record (workflow + contact fields) keyed by
-- (event_id, person_id). people stays email/name only; speaker_profiles stays
-- the portal display/bio/headshot surface.
--
-- social_json shape: {"twitter"|"linkedin"|"github"|"website": string}
-- workflow_status: invited | confirmed | declined | withdrawn

CREATE TABLE event_speaker_profiles (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	person_id TEXT NOT NULL REFERENCES people (id),
	job_title TEXT,
	company TEXT,
	social_json TEXT,
	workflow_status TEXT NOT NULL DEFAULT 'invited'
		CHECK (workflow_status IN ('invited', 'confirmed', 'declined', 'withdrawn')),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	UNIQUE (event_id, person_id)
);

CREATE INDEX event_speaker_profiles_by_event
	ON event_speaker_profiles (event_id, workflow_status);

CREATE INDEX event_speaker_profiles_by_person
	ON event_speaker_profiles (person_id);
