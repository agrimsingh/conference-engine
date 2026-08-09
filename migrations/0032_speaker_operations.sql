-- General speaker operations stay separate from file-request deliverables.
ALTER TABLE speaker_profiles ADD COLUMN logistics_text TEXT;

CREATE TABLE speaker_action_tasks (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	title TEXT NOT NULL,
	instructions TEXT,
	due_at INTEGER,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
CREATE INDEX speaker_action_tasks_by_event ON speaker_action_tasks (event_id, due_at);

CREATE TABLE speaker_action_task_assignments (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	task_id TEXT NOT NULL REFERENCES speaker_action_tasks (id),
	person_id TEXT NOT NULL REFERENCES people (id),
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
	completed_at INTEGER,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	UNIQUE (task_id, person_id)
);
CREATE INDEX speaker_action_assignments_by_event ON speaker_action_task_assignments (event_id, status);
CREATE INDEX speaker_action_assignments_by_person ON speaker_action_task_assignments (person_id, status);

CREATE TRIGGER speaker_action_assignment_event_insert
BEFORE INSERT ON speaker_action_task_assignments
WHEN NOT EXISTS (
	SELECT 1 FROM speaker_action_tasks t
	WHERE t.id = NEW.task_id AND t.event_id = NEW.event_id
)
BEGIN
	SELECT RAISE(ABORT, 'speaker action assignment event mismatch');
END;

CREATE TRIGGER speaker_action_assignment_event_update
BEFORE UPDATE OF event_id, task_id ON speaker_action_task_assignments
WHEN NOT EXISTS (
	SELECT 1 FROM speaker_action_tasks t
	WHERE t.id = NEW.task_id AND t.event_id = NEW.event_id
)
BEGIN
	SELECT RAISE(ABORT, 'speaker action assignment event mismatch');
END;
