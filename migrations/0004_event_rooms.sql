CREATE TABLE event_rooms (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	name TEXT NOT NULL,
	position INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	UNIQUE (event_id, name)
);

CREATE INDEX event_rooms_by_event ON event_rooms (event_id, position);
