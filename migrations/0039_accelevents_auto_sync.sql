-- Accelevents remains organizer-controlled. Automatic projection is opt-in and
-- uses the existing daily Worker cron; manual preview and push stay available.
ALTER TABLE accelevents_integrations
	ADD COLUMN auto_sync_enabled INTEGER NOT NULL DEFAULT 0
	CHECK (auto_sync_enabled IN (0, 1));
