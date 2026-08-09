-- CFP lifecycle configuration remains additive. Category routing is data rather
-- than a form-slug convention so each organizer can route their own options.
ALTER TABLE cfp_forms ADD COLUMN category_routing_json TEXT;
ALTER TABLE cfp_forms ADD COLUMN thank_you_copy TEXT;

-- Existing confirmation copy was the only organizer-authored completion copy
-- before this column existed, so retain it for populated historical forms.
UPDATE cfp_forms
SET thank_you_copy = confirmation_copy
WHERE thank_you_copy IS NULL
	AND confirmation_copy IS NOT NULL
	AND trim(confirmation_copy) <> '';

-- Preserve the historical AIE CFP category behaviour while removing the
-- runtime `formSlug === 'cfp'` special case. The full legacy option set is
-- required so an unrelated custom `format` select never receives AIE routes.
UPDATE cfp_forms
SET category_routing_json = '{"fieldKey":"format","map":{"stage":"Stage","lightning":"Lightning","workshop":"Workshop","online":"Online"}}'
WHERE slug = 'cfp'
	AND category_routing_json IS NULL
	AND EXISTS (
		SELECT 1 FROM form_fields ff
		WHERE ff.form_id = cfp_forms.id
			AND ff.key = 'format'
			AND ff.field_type = 'select'
			AND ff.soft_deleted = 0
			AND json_valid(ff.config)
			AND json_type(CASE WHEN json_valid(ff.config) THEN ff.config ELSE '{"options":[]}' END, '$.options') = 'array'
			AND (SELECT COUNT(*) FROM json_each(CASE WHEN json_valid(ff.config) THEN ff.config ELSE '{"options":[]}' END, '$.options')) = 4
			AND (SELECT COUNT(DISTINCT json_extract(CASE WHEN option.type = 'object' THEN option.value ELSE '{}' END, '$.value')) FROM json_each(CASE WHEN json_valid(ff.config) THEN ff.config ELSE '{"options":[]}' END, '$.options') AS option) = 4
			AND EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(ff.config) THEN ff.config ELSE '{"options":[]}' END, '$.options') AS option WHERE json_extract(CASE WHEN option.type = 'object' THEN option.value ELSE '{}' END, '$.value') = 'stage')
			AND EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(ff.config) THEN ff.config ELSE '{"options":[]}' END, '$.options') AS option WHERE json_extract(CASE WHEN option.type = 'object' THEN option.value ELSE '{}' END, '$.value') = 'lightning')
			AND EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(ff.config) THEN ff.config ELSE '{"options":[]}' END, '$.options') AS option WHERE json_extract(CASE WHEN option.type = 'object' THEN option.value ELSE '{}' END, '$.value') = 'workshop')
			AND EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(ff.config) THEN ff.config ELSE '{"options":[]}' END, '$.options') AS option WHERE json_extract(CASE WHEN option.type = 'object' THEN option.value ELSE '{}' END, '$.value') = 'online')
	);

CREATE INDEX cfp_forms_public_lifecycle
	ON cfp_forms (event_id, kind, status, opens_at, closes_at);
