-- Organizer-owned definitions for safe, event-scoped public widgets.
CREATE TABLE public_embeds (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	name TEXT NOT NULL,
	slug TEXT NOT NULL,
	widget_type TEXT NOT NULL CHECK (widget_type IN ('sessions', 'speakers', 'agenda', 'itinerary', 'speaker_gallery')),
	config_json TEXT NOT NULL DEFAULT '{}',
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	UNIQUE (event_id, slug)
);

CREATE INDEX public_embeds_by_event ON public_embeds (event_id, updated_at DESC);
