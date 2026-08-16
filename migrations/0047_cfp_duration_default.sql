-- Give existing CFP duration fields the same adjustable default as new forms.
-- Preserve organizer-authored defaults and skip fields whose bounds exclude 30.
UPDATE form_fields
SET config = json_set(config, '$.defaultValue', 30)
WHERE soft_deleted = 0
	AND field_type = 'number'
	AND key = 'duration_minutes'
	AND json_valid(config)
	AND json_extract(config, '$.kind') = 'number'
	AND json_type(config, '$.defaultValue') IS NULL
	AND (json_type(config, '$.min') IS NULL OR json_extract(config, '$.min') <= 30)
	AND (json_type(config, '$.max') IS NULL OR json_extract(config, '$.max') >= 30);
