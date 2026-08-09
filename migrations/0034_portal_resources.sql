-- Organizer-authored portal wiki pages. Rich text is stored as text and
-- escaped by React; embeds retain only an HTTPS source URL, never raw HTML.
CREATE TABLE portal_resources (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
	slug TEXT NOT NULL CHECK (
		length(slug) BETWEEN 1 AND 80
		AND slug NOT GLOB '*[^a-z0-9-]*'
		AND slug NOT GLOB '-*'
		AND slug NOT GLOB '*-'
		AND slug NOT GLOB '*--*'
	),
	resource_type TEXT NOT NULL CHECK (resource_type IN ('rich_text', 'embed')),
	content TEXT NOT NULL DEFAULT '' CHECK (length(content) <= 20000),
	embed_url TEXT,
	published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
	position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	UNIQUE (event_id, slug),
	CHECK (
		(resource_type = 'rich_text' AND embed_url IS NULL)
		OR (resource_type = 'embed' AND content = '' AND embed_url IS NOT NULL)
	)
);
CREATE INDEX portal_resources_by_event
	ON portal_resources (event_id, position, created_at);
CREATE INDEX portal_resources_published_by_event
	ON portal_resources (event_id, published, position);
