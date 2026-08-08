CREATE TABLE evaluation_plans (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	name TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
	reviewer_token TEXT NOT NULL UNIQUE,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE INDEX evaluation_plans_by_event ON evaluation_plans (event_id, status);

CREATE TABLE evaluation_scores (
	id TEXT PRIMARY KEY NOT NULL,
	plan_id TEXT NOT NULL REFERENCES evaluation_plans (id),
	submission_id TEXT NOT NULL REFERENCES submissions (id),
	score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
	comment TEXT,
	scored_by TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	UNIQUE (plan_id, submission_id, scored_by)
);

CREATE INDEX evaluation_scores_by_plan ON evaluation_scores (plan_id);
CREATE INDEX evaluation_scores_by_submission ON evaluation_scores (submission_id);

CREATE TABLE outbound_messages (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	submission_id TEXT REFERENCES submissions (id),
	template_key TEXT NOT NULL,
	to_email TEXT NOT NULL,
	subject TEXT NOT NULL,
	status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
	provider_id TEXT,
	error TEXT,
	created_at INTEGER NOT NULL
);

CREATE INDEX outbound_messages_by_submission_template
	ON outbound_messages (submission_id, template_key, status);
CREATE INDEX outbound_messages_by_event ON outbound_messages (event_id, created_at);

CREATE TABLE agenda_slots (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	submission_id TEXT NOT NULL UNIQUE REFERENCES submissions (id),
	room_name TEXT NOT NULL,
	starts_at INTEGER NOT NULL,
	ends_at INTEGER NOT NULL,
	ics_uid TEXT NOT NULL UNIQUE,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE INDEX agenda_slots_by_event ON agenda_slots (event_id, starts_at);
