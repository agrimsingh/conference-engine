-- Self-service organizer configuration. These are intentionally additive so
-- previously scheduled events retain their rooms and historical rows.
ALTER TABLE events ADD COLUMN day_start_minutes INTEGER NOT NULL DEFAULT 540
  CHECK (day_start_minutes >= 0 AND day_start_minutes < 1440);
ALTER TABLE events ADD COLUMN day_end_minutes INTEGER NOT NULL DEFAULT 1080
	CHECK (day_end_minutes > day_start_minutes AND day_end_minutes <= 1440);
ALTER TABLE events ADD COLUMN slot_duration_minutes INTEGER NOT NULL DEFAULT 30
	CHECK (slot_duration_minutes IN (15, 20, 30, 45, 60, 90, 120));
ALTER TABLE events ADD COLUMN archived_at INTEGER;

ALTER TABLE event_rooms ADD COLUMN soft_deleted INTEGER NOT NULL DEFAULT 0
  CHECK (soft_deleted IN (0, 1));
ALTER TABLE event_rooms ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

CREATE INDEX event_rooms_active_by_event
  ON event_rooms (event_id, soft_deleted, position);
