-- Freeform organizer labels on submissions. Orthogonal to status: labels
-- never trigger emails or state changes, so taxonomy is not faked via status.
CREATE TABLE submission_labels (
	id TEXT PRIMARY KEY NOT NULL,
	submission_id TEXT NOT NULL REFERENCES submissions (id),
	label TEXT NOT NULL,
	created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX submission_labels_unique
	ON submission_labels (submission_id, label COLLATE NOCASE);

CREATE INDEX submission_labels_by_submission ON submission_labels (submission_id);
