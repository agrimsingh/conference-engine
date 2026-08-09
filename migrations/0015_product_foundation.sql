-- Product foundation remains additive so historical D1 databases keep their
-- ownership, delivery, and realtime state untouched.
ALTER TABLE events ADD COLUMN mode TEXT NOT NULL DEFAULT 'live'
	CHECK (mode IN ('live', 'demo'));
ALTER TABLE events ADD COLUMN track_conflict_policy TEXT NOT NULL DEFAULT 'hard'
	CHECK (track_conflict_policy IN ('hard', 'allow'));

ALTER TABLE submissions ADD COLUMN origin TEXT NOT NULL DEFAULT 'cfp'
	CHECK (origin IN ('cfp', 'manual', 'invited', 'imported', 'cloned'));

ALTER TABLE cfp_forms ADD COLUMN kind TEXT NOT NULL DEFAULT 'public'
	CHECK (kind IN ('public', 'system'));

-- Keep system forms addressable internally while preventing a second one for
-- an event. Public routes continue to use normal public-form slugs.
CREATE UNIQUE INDEX cfp_forms_one_system_form_per_event
	ON cfp_forms (event_id)
	WHERE kind = 'system';

CREATE TABLE agenda_tracks (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	name TEXT NOT NULL,
	slug TEXT NOT NULL,
	position INTEGER NOT NULL,
	soft_deleted INTEGER NOT NULL DEFAULT 0 CHECK (soft_deleted IN (0, 1)),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

-- Unique active values let organizers retire a track and reuse its name,
-- slug, or ordering without deleting historical schedule references.
CREATE UNIQUE INDEX agenda_tracks_active_name_unique
	ON agenda_tracks (event_id, name)
	WHERE soft_deleted = 0;
CREATE UNIQUE INDEX agenda_tracks_active_slug_unique
	ON agenda_tracks (event_id, slug)
	WHERE soft_deleted = 0;
CREATE UNIQUE INDEX agenda_tracks_active_position_unique
	ON agenda_tracks (event_id, position)
	WHERE soft_deleted = 0;
CREATE INDEX agenda_tracks_by_event
	ON agenda_tracks (event_id, soft_deleted, position);
ALTER TABLE agenda_slots ADD COLUMN track_id TEXT REFERENCES agenda_tracks (id);
CREATE INDEX agenda_slots_by_track ON agenda_slots (track_id);

ALTER TABLE task_templates ADD COLUMN soft_deleted INTEGER NOT NULL DEFAULT 0
	CHECK (soft_deleted IN (0, 1));
ALTER TABLE task_templates ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE task_templates ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

-- Speaker tasks retain the template values used at acceptance. Templates may
-- later be edited or retired without changing the speaker's committed work.
ALTER TABLE speaker_tasks ADD COLUMN template_label TEXT NOT NULL DEFAULT '';
ALTER TABLE speaker_tasks ADD COLUMN template_task_kind TEXT NOT NULL DEFAULT 'file'
	CHECK (template_task_kind IN ('text', 'file'));
ALTER TABLE speaker_tasks ADD COLUMN template_required INTEGER NOT NULL DEFAULT 1
	CHECK (template_required IN (0, 1));

CREATE TABLE evaluation_criteria (
	id TEXT PRIMARY KEY NOT NULL,
	plan_id TEXT NOT NULL REFERENCES evaluation_plans (id),
	label TEXT NOT NULL,
	description TEXT,
	weight REAL NOT NULL DEFAULT 1 CHECK (weight > 0),
	scale_min INTEGER NOT NULL DEFAULT 1,
	scale_max INTEGER NOT NULL DEFAULT 5,
	position INTEGER NOT NULL,
	soft_deleted INTEGER NOT NULL DEFAULT 0 CHECK (soft_deleted IN (0, 1)),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	CHECK (scale_min < scale_max)
);
CREATE INDEX evaluation_criteria_by_plan
	ON evaluation_criteria (plan_id, soft_deleted, position);

-- Every historical event receives exactly the task defaults it is missing.
-- Candidate IDs are deterministic per event/key and retry with a suffix if a
-- legacy TEXT id already occupies the candidate, so this never assumes UUIDs.
WITH RECURSIVE
	default_templates(key, label, task_kind, position) AS (
		VALUES
			('bio', 'Speaker bio', 'text', 0),
			('headshot', 'Headshot', 'file', 1),
			('slides', 'Slides', 'file', 2),
			('docs', 'Supporting docs', 'file', 3)
	),
	missing(event_id, key, label, task_kind, position) AS (
		SELECT e.id, d.key, d.label, d.task_kind, d.position
		FROM events e
		CROSS JOIN default_templates d
		WHERE NOT EXISTS (
			SELECT 1 FROM task_templates t
			WHERE t.event_id = e.id AND t.key = d.key
		)
	),
	candidates(event_id, key, label, task_kind, position, id, suffix) AS (
		SELECT event_id, key, label, task_kind, position,
			'foundation-task-template:' || lower(hex(event_id)) || ':' || key || ':0', 0
		FROM missing
		UNION ALL
		SELECT event_id, key, label, task_kind, position,
			'foundation-task-template:' || lower(hex(event_id)) || ':' || key || ':' || (suffix + 1), suffix + 1
		FROM candidates
		WHERE EXISTS (SELECT 1 FROM task_templates t WHERE t.id = candidates.id)
	)
INSERT INTO task_templates (
	id, event_id, key, label, task_kind, required, position, soft_deleted, created_at, updated_at
)
SELECT id, event_id, key, label, task_kind, 1, position, 0,
	CAST(strftime('%s', 'now') AS INTEGER) * 1000,
	CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM candidates
WHERE NOT EXISTS (SELECT 1 FROM task_templates t WHERE t.id = candidates.id);

UPDATE speaker_tasks
SET
	template_label = COALESCE((
		SELECT t.label FROM task_templates t
		WHERE t.event_id = speaker_tasks.event_id
			AND t.key = speaker_tasks.template_key
	), speaker_tasks.template_key),
	template_task_kind = COALESCE((
		SELECT t.task_kind FROM task_templates t
		WHERE t.event_id = speaker_tasks.event_id
			AND t.key = speaker_tasks.template_key
	), 'file'),
	template_required = COALESCE((
		SELECT t.required FROM task_templates t
		WHERE t.event_id = speaker_tasks.event_id
			AND t.key = speaker_tasks.template_key
	), 1);

-- A kind-based unique index is the authoritative system-form marker. Slugs
-- use the reserved __system namespace and advance deterministically only when
-- a historical public form already used a candidate.
WITH RECURSIVE
	missing_events(event_id) AS (
		SELECT e.id FROM events e
		WHERE NOT EXISTS (
			SELECT 1 FROM cfp_forms f
			WHERE f.event_id = e.id AND f.kind = 'system'
		)
	),
	id_candidates(event_id, id, suffix) AS (
		SELECT event_id, 'foundation-system-form:' || lower(hex(event_id)) || ':0', 0
		FROM missing_events
		UNION ALL
		SELECT event_id,
			'foundation-system-form:' || lower(hex(event_id)) || ':' || (suffix + 1), suffix + 1
		FROM id_candidates
		WHERE EXISTS (SELECT 1 FROM cfp_forms f WHERE f.id = id_candidates.id)
	),
	form_ids(event_id, id) AS (
		SELECT event_id, id FROM id_candidates
		WHERE NOT EXISTS (SELECT 1 FROM cfp_forms f WHERE f.id = id_candidates.id)
	),
	slug_candidates(event_id, slug, suffix) AS (
		SELECT event_id, '__system', 0 FROM missing_events
		UNION ALL
		SELECT event_id, '__system-' || (suffix + 1), suffix + 1
		FROM slug_candidates
		WHERE EXISTS (
			SELECT 1 FROM cfp_forms f
			WHERE f.event_id = slug_candidates.event_id AND f.slug = slug_candidates.slug
		)
	),
	form_slugs(event_id, slug) AS (
		SELECT event_id, slug FROM slug_candidates
		WHERE NOT EXISTS (
			SELECT 1 FROM cfp_forms f
			WHERE f.event_id = slug_candidates.event_id AND f.slug = slug_candidates.slug
		)
	)
INSERT INTO cfp_forms (
	id, event_id, slug, title, description, status, kind, opens_at, closes_at, created_at, updated_at
)
SELECT i.id, i.event_id, s.slug, 'System form', NULL, 'draft', 'system', NULL, NULL,
	CAST(strftime('%s', 'now') AS INTEGER) * 1000,
	CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM form_ids i
INNER JOIN form_slugs s ON s.event_id = i.event_id;
