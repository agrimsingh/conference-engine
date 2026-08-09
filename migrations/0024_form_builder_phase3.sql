-- Phase 3 form builder: sections schema and CFP upload asset linkage.
ALTER TABLE cfp_forms ADD COLUMN sections_json TEXT;

ALTER TABLE form_fields ADD COLUMN section_key TEXT;

ALTER TABLE assets ADD COLUMN form_id TEXT REFERENCES cfp_forms (id);
ALTER TABLE assets ADD COLUMN field_key TEXT;

CREATE INDEX assets_cfp_field ON assets (event_id, form_id, field_key);
