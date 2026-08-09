-- speaker_profiles is source of truth for display/bio/job/company/social/headshot.
-- event_speaker_profiles keeps organizer workflow_status (and may retain legacy
-- job/company/social columns until writers stop populating them).
--
-- Backfill contact fields both ways so either table can have been written first.

INSERT INTO speaker_profiles (
	id, event_id, person_id, display_name, bio, job_title, company, social_json,
	headshot_asset_id, created_at, updated_at
)
SELECT
	'backfill-sp:' || lower(hex(randomblob(8))),
	esp.event_id,
	esp.person_id,
	p.name,
	NULL,
	esp.job_title,
	esp.company,
	esp.social_json,
	NULL,
	esp.created_at,
	esp.updated_at
FROM event_speaker_profiles esp
JOIN people p ON p.id = esp.person_id
WHERE NOT EXISTS (
	SELECT 1 FROM speaker_profiles sp
	WHERE sp.event_id = esp.event_id AND sp.person_id = esp.person_id
)
AND (
	esp.job_title IS NOT NULL
	OR esp.company IS NOT NULL
	OR esp.social_json IS NOT NULL
);

UPDATE speaker_profiles
SET
	job_title = COALESCE(
		speaker_profiles.job_title,
		(SELECT esp.job_title FROM event_speaker_profiles esp
		 WHERE esp.event_id = speaker_profiles.event_id AND esp.person_id = speaker_profiles.person_id)
	),
	company = COALESCE(
		speaker_profiles.company,
		(SELECT esp.company FROM event_speaker_profiles esp
		 WHERE esp.event_id = speaker_profiles.event_id AND esp.person_id = speaker_profiles.person_id)
	),
	social_json = COALESCE(
		speaker_profiles.social_json,
		(SELECT esp.social_json FROM event_speaker_profiles esp
		 WHERE esp.event_id = speaker_profiles.event_id AND esp.person_id = speaker_profiles.person_id)
	),
	updated_at = CASE
		WHEN speaker_profiles.job_title IS NULL
			OR speaker_profiles.company IS NULL
			OR speaker_profiles.social_json IS NULL
		THEN (
			SELECT MAX(esp.updated_at) FROM event_speaker_profiles esp
			WHERE esp.event_id = speaker_profiles.event_id AND esp.person_id = speaker_profiles.person_id
		)
		ELSE speaker_profiles.updated_at
	END
WHERE EXISTS (
	SELECT 1 FROM event_speaker_profiles esp
	WHERE esp.event_id = speaker_profiles.event_id
	  AND esp.person_id = speaker_profiles.person_id
	  AND (
		(speaker_profiles.job_title IS NULL AND esp.job_title IS NOT NULL)
		OR (speaker_profiles.company IS NULL AND esp.company IS NOT NULL)
		OR (speaker_profiles.social_json IS NULL AND esp.social_json IS NOT NULL)
	  )
);

UPDATE event_speaker_profiles
SET
	job_title = COALESCE(
		event_speaker_profiles.job_title,
		(SELECT sp.job_title FROM speaker_profiles sp
		 WHERE sp.event_id = event_speaker_profiles.event_id AND sp.person_id = event_speaker_profiles.person_id)
	),
	company = COALESCE(
		event_speaker_profiles.company,
		(SELECT sp.company FROM speaker_profiles sp
		 WHERE sp.event_id = event_speaker_profiles.event_id AND sp.person_id = event_speaker_profiles.person_id)
	),
	social_json = COALESCE(
		event_speaker_profiles.social_json,
		(SELECT sp.social_json FROM speaker_profiles sp
		 WHERE sp.event_id = event_speaker_profiles.event_id AND sp.person_id = event_speaker_profiles.person_id)
	),
	updated_at = CASE
		WHEN event_speaker_profiles.job_title IS NULL
			OR event_speaker_profiles.company IS NULL
			OR event_speaker_profiles.social_json IS NULL
		THEN (
			SELECT MAX(sp.updated_at) FROM speaker_profiles sp
			WHERE sp.event_id = event_speaker_profiles.event_id AND sp.person_id = event_speaker_profiles.person_id
		)
		ELSE event_speaker_profiles.updated_at
	END
WHERE EXISTS (
	SELECT 1 FROM speaker_profiles sp
	WHERE sp.event_id = event_speaker_profiles.event_id
	  AND sp.person_id = event_speaker_profiles.person_id
	  AND (
		(event_speaker_profiles.job_title IS NULL AND sp.job_title IS NOT NULL)
		OR (event_speaker_profiles.company IS NULL AND sp.company IS NOT NULL)
		OR (event_speaker_profiles.social_json IS NULL AND sp.social_json IS NOT NULL)
	  )
);
