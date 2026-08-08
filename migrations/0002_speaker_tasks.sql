CREATE TABLE task_templates (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	key TEXT NOT NULL,
	label TEXT NOT NULL,
	task_kind TEXT NOT NULL CHECK (task_kind IN ('text', 'file')),
	required INTEGER NOT NULL DEFAULT 1,
	position INTEGER NOT NULL,
	UNIQUE (event_id, key)
);

CREATE INDEX task_templates_by_event ON task_templates (event_id, position);

CREATE TABLE speaker_tasks (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	submission_id TEXT NOT NULL REFERENCES submissions (id),
	person_id TEXT NOT NULL REFERENCES people (id),
	template_key TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
	asset_id TEXT REFERENCES assets (id),
	text_value TEXT,
	completed_at INTEGER,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	UNIQUE (submission_id, person_id, template_key)
);

CREATE INDEX speaker_tasks_by_event ON speaker_tasks (event_id, status);
CREATE INDEX speaker_tasks_by_person ON speaker_tasks (person_id);
CREATE INDEX speaker_tasks_by_submission ON speaker_tasks (submission_id);
