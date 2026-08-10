-- Pause public embeds without deleting their definitions.
ALTER TABLE public_embeds ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
	CHECK (status IN ('active', 'paused'));
