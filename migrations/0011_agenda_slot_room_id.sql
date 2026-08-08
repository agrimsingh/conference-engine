-- Link agenda slots to event_rooms; keep room_name as denormalized display cache.
ALTER TABLE agenda_slots ADD COLUMN room_id TEXT REFERENCES event_rooms (id);

UPDATE agenda_slots
SET room_id = (
	SELECT id
	FROM event_rooms
	WHERE event_rooms.event_id = agenda_slots.event_id
		AND event_rooms.name = agenda_slots.room_name
)
WHERE room_id IS NULL;

CREATE INDEX agenda_slots_by_room ON agenda_slots (room_id);
