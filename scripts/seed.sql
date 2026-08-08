-- Seed: aie-sandbox event + open AIE CFP form (matches createAieCfpPreset)
DELETE FROM submission_speakers;
DELETE FROM submissions;
DELETE FROM form_fields;
DELETE FROM cfp_forms;
DELETE FROM event_members;
DELETE FROM speaker_profiles;
DELETE FROM assets;
DELETE FROM people;
DELETE FROM events;

INSERT INTO events (id, slug, name, timezone, created_at, updated_at)
VALUES (
	'evt_aie_sandbox',
	'aie-sandbox',
	'AI Engineer Sandbox',
	'America/Los_Angeles',
	1754650000000,
	1754650000000
);

INSERT INTO cfp_forms (
	id, event_id, slug, title, description, status, opens_at, closes_at, created_at, updated_at
) VALUES (
	'form_aie_cfp',
	'evt_aie_sandbox',
	'cfp',
	'AI Engineer CFP',
	'Submit a Stage, Lightning, Workshop, or Online session. Fields adapt to your format.',
	'open',
	NULL,
	NULL,
	1754650000000,
	1754650000000
);

INSERT INTO form_fields (
	id, form_id, key, label, field_type, required, position, visibility_rule, config, soft_deleted
) VALUES
(
	'field_format',
	'form_aie_cfp',
	'format',
	'Session format',
	'select',
	1,
	0,
	'{"op":"always"}',
	'{"kind":"select","options":[{"value":"stage","label":"Stage talk"},{"value":"lightning","label":"Lightning talk"},{"value":"workshop","label":"Workshop"},{"value":"online","label":"Online session"}]}',
	0
),
(
	'field_title',
	'form_aie_cfp',
	'title',
	'Title',
	'text',
	1,
	1,
	'{"op":"always"}',
	'{"kind":"text","maxLength":160,"placeholder":"Your session title"}',
	0
),
(
	'field_abstract',
	'form_aie_cfp',
	'abstract',
	'Abstract',
	'textarea',
	1,
	2,
	'{"op":"always"}',
	'{"kind":"textarea","rows":6,"maxLength":4000,"placeholder":"What will attendees learn?"}',
	0
),
(
	'field_duration',
	'form_aie_cfp',
	'duration_minutes',
	'Duration (minutes)',
	'number',
	1,
	3,
	'{"op":"in","fieldKey":"format","values":["stage","workshop","online"]}',
	'{"kind":"number","min":15,"max":240,"step":5}',
	0
),
(
	'field_lightning_hook',
	'form_aie_cfp',
	'lightning_hook',
	'Lightning hook (one sentence)',
	'text',
	1,
	4,
	'{"op":"eq","fieldKey":"format","value":"lightning"}',
	'{"kind":"text","maxLength":200,"placeholder":"The one idea you will land in 5-8 minutes"}',
	0
),
(
	'field_workshop_capacity',
	'form_aie_cfp',
	'workshop_capacity',
	'Workshop capacity',
	'number',
	1,
	5,
	'{"op":"eq","fieldKey":"format","value":"workshop"}',
	'{"kind":"number","min":8,"max":200,"step":1}',
	0
),
(
	'field_workshop_prereqs',
	'form_aie_cfp',
	'workshop_prereqs',
	'Workshop prerequisites',
	'textarea',
	0,
	6,
	'{"op":"eq","fieldKey":"format","value":"workshop"}',
	'{"kind":"textarea","rows":3,"placeholder":"Laptop? Account signup? Prior experience?"}',
	0
),
(
	'field_online_platform',
	'form_aie_cfp',
	'online_platform',
	'Online platform',
	'select',
	1,
	7,
	'{"op":"eq","fieldKey":"format","value":"online"}',
	'{"kind":"select","options":[{"value":"zoom","label":"Zoom"},{"value":"meet","label":"Google Meet"},{"value":"youtube","label":"YouTube Live"},{"value":"other","label":"Other"}]}',
	0
),
(
	'field_speakers',
	'form_aie_cfp',
	'speakers',
	'Speakers',
	'speaker_block',
	1,
	8,
	'{"op":"always"}',
	'{"kind":"speaker_block","minSpeakers":1,"maxSpeakers":4}',
	0
);
