-- Immutable deliverable history and content-review state are additive so
-- existing task/asset rows remain valid after deployment.
CREATE TABLE deliverable_versions (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	task_id TEXT NOT NULL REFERENCES speaker_tasks (id),
	asset_id TEXT NOT NULL UNIQUE REFERENCES assets (id),
	version_number INTEGER NOT NULL CHECK (version_number > 0),
	uploaded_by_person_id TEXT REFERENCES people (id),
	size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
	created_at INTEGER NOT NULL,
	UNIQUE (task_id, version_number)
);
CREATE INDEX deliverable_versions_by_event
	ON deliverable_versions (event_id, created_at DESC);
CREATE INDEX deliverable_versions_by_task
	ON deliverable_versions (task_id, version_number DESC);

-- Preserve every production upload that was previously represented only by
-- speaker_tasks.asset_id as version 1. The asset row remains the blob record.
INSERT OR IGNORE INTO deliverable_versions (
	id, event_id, task_id, asset_id, version_number,
	uploaded_by_person_id, size_bytes, created_at
)
SELECT
	'deliverable-backfill-' || st.id,
	st.event_id,
	st.id,
	st.asset_id,
	1,
	a.uploaded_by_person_id,
	0,
	a.created_at
FROM speaker_tasks st
INNER JOIN assets a ON a.id = st.asset_id AND a.event_id = st.event_id
WHERE st.asset_id IS NOT NULL;

CREATE TABLE deliverable_comments (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	task_id TEXT NOT NULL REFERENCES speaker_tasks (id),
	author_kind TEXT NOT NULL CHECK (author_kind IN ('speaker', 'organizer')),
	author_person_id TEXT REFERENCES people (id),
	author_account_id TEXT REFERENCES accounts (id),
	author_name TEXT NOT NULL,
	body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
	created_at INTEGER NOT NULL,
	CHECK (
		(author_kind = 'speaker' AND author_person_id IS NOT NULL AND author_account_id IS NULL)
		OR (author_kind = 'organizer' AND author_account_id IS NOT NULL AND author_person_id IS NULL)
	)
);
CREATE INDEX deliverable_comments_by_task
	ON deliverable_comments (task_id, created_at ASC);
CREATE INDEX deliverable_comments_by_event
	ON deliverable_comments (event_id, created_at DESC);

ALTER TABLE submissions ADD COLUMN content_status TEXT NOT NULL DEFAULT 'draft'
	CHECK (content_status IN ('draft', 'in_review', 'approved'));

-- Publication before this migration was already an explicit organizer act.
-- Preserve the public schedule instead of silently withdrawing live rows.
UPDATE submissions
SET content_status = 'approved'
WHERE status = 'published';

CREATE TABLE content_revisions (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	entity_type TEXT NOT NULL CHECK (entity_type IN ('session', 'speaker')),
	entity_id TEXT NOT NULL,
	revision_number INTEGER NOT NULL CHECK (revision_number > 0),
	snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
	editor_account_id TEXT REFERENCES accounts (id),
	editor_name TEXT NOT NULL,
	restored_from_revision_id TEXT REFERENCES content_revisions (id),
	created_at INTEGER NOT NULL,
	UNIQUE (event_id, entity_type, entity_id, revision_number)
);
CREATE INDEX content_revisions_by_entity
	ON content_revisions (event_id, entity_type, entity_id, created_at DESC);

CREATE TABLE content_heads (
	event_id TEXT NOT NULL REFERENCES events (id),
	entity_type TEXT NOT NULL CHECK (entity_type IN ('session', 'speaker')),
	entity_id TEXT NOT NULL,
	current_revision_id TEXT NOT NULL REFERENCES content_revisions (id),
	approved_revision_id TEXT REFERENCES content_revisions (id),
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (event_id, entity_type, entity_id)
);
CREATE INDEX content_heads_approved
	ON content_heads (event_id, entity_type, approved_revision_id);

-- Seed an immutable revision for every existing session. Published sessions
-- retain that exact snapshot as the approved public projection.
INSERT INTO content_revisions (
	id, event_id, entity_type, entity_id, revision_number, snapshot_json,
	editor_account_id, editor_name, created_at
)
SELECT
	'content-backfill-' || id,
	event_id,
	'session',
	id,
	1,
	json_object(
		'title', COALESCE(json_extract(answers_json, '$.title'), ''),
		'abstract', COALESCE(json_extract(answers_json, '$.abstract'), ''),
		'contentStatus', CASE WHEN status = 'published' THEN 'approved' ELSE 'draft' END
	),
	NULL,
	'Migration backfill',
	updated_at
FROM submissions;

INSERT INTO content_heads (
	event_id, entity_type, entity_id, current_revision_id,
	approved_revision_id, updated_at
)
SELECT
	event_id,
	'session',
	id,
	'content-backfill-' || id,
	CASE WHEN status = 'published' THEN 'content-backfill-' || id ELSE NULL END,
	updated_at
FROM submissions;
