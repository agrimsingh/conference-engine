-- LOCAL FIXTURE RESET ONLY. `npm run db:seed:local` runs this as part of
-- `npm run db:reset:local`; never pass this file to Wrangler with --remote or
-- run it against shared or production D1. Keep D1's migration metadata intact,
-- but clear every application table in child-to-parent FK order before creating
-- the writable aie-sandbox fixture below.
DELETE FROM email_delivery_envelopes;
DELETE FROM agenda_calendar_lifecycles;
DELETE FROM co_speaker_invitation_history;
DELETE FROM co_speaker_invitation_claims;
DELETE FROM evaluation_criterion_scores;
DELETE FROM review_assignments;
DELETE FROM evaluation_scores;
DELETE FROM event_invitations;
DELETE FROM submission_draft_tokens;
DELETE FROM speaker_tasks;
DELETE FROM agenda_slots;
DELETE FROM email_deliveries;
DELETE FROM outbound_messages;
DELETE FROM submission_labels;
DELETE FROM submission_speakers;
DELETE FROM submission_drafts;
DELETE FROM evaluation_criteria;
DELETE FROM reviewers;
DELETE FROM evaluation_plans;
DELETE FROM task_templates;
DELETE FROM form_fields;
DELETE FROM agenda_tracks;
DELETE FROM event_rooms;
DELETE FROM speaker_profiles;
DELETE FROM assets;
DELETE FROM event_ownership;
DELETE FROM event_memberships;
DELETE FROM event_members;
DELETE FROM auth_challenges;
DELETE FROM submissions;
DELETE FROM cfp_forms;
DELETE FROM people;
DELETE FROM accounts;
DELETE FROM event_message_templates;
DELETE FROM rate_limit_buckets;
DELETE FROM production_hardening_migration_guard;
DELETE FROM events;

-- Seed: aie-sandbox event + open AIE CFP form (matches createAieCfpPreset)

INSERT INTO events (id, slug, name, timezone, ownership_claimable, created_at, updated_at)
VALUES (
	'evt_aie_sandbox',
	'aie-sandbox',
	'AI Engineer Sandbox',
	'America/Los_Angeles',
	1,
	1754650000000,
	1754650000000
);

INSERT INTO cfp_forms (
	id, event_id, slug, title, description, status, kind, opens_at, closes_at,
	category_routing_json, thank_you_copy, created_at, updated_at
) VALUES (
	'form_aie_cfp',
	'evt_aie_sandbox',
	'cfp',
	'AI Engineer CFP',
	'Submit a Stage, Lightning, Workshop, or Online session. Fields adapt to your format.',
	'open',
	'public',
	NULL,
	NULL,
	'{"fieldKey":"format","map":{"stage":"Stage","lightning":"Lightning","workshop":"Workshop","online":"Online"}}',
	NULL,
	1754650000000,
	1754650000000
);

-- Matches the deterministic 0015 backfill identity for this historical event.
-- It has no public fields and must remain hidden from public/organizer form lists.
INSERT INTO cfp_forms (
	id, event_id, slug, title, description, status, kind, opens_at, closes_at,
	category_routing_json, thank_you_copy, created_at, updated_at
) VALUES (
	'foundation-system-form:6576745f6169655f73616e64626f78:0',
	'evt_aie_sandbox',
	'__system',
	'System form',
	NULL,
	'draft',
	'system',
	NULL,
	NULL,
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

INSERT INTO task_templates (
	id, event_id, key, label, task_kind, required, position
) VALUES
(
	'tmpl_evt_aie_sandbox_bio',
	'evt_aie_sandbox',
	'bio',
	'Speaker bio',
	'text',
	1,
	0
),
(
	'tmpl_evt_aie_sandbox_headshot',
	'evt_aie_sandbox',
	'headshot',
	'Headshot',
	'file',
	1,
	1
),
(
	'tmpl_evt_aie_sandbox_slides',
	'evt_aie_sandbox',
	'slides',
	'Slides',
	'file',
	1,
	2
),
(
	'tmpl_evt_aie_sandbox_docs',
	'evt_aie_sandbox',
	'docs',
	'Supporting docs',
	'file',
	1,
	3
);

INSERT INTO event_rooms (id, event_id, name, position, created_at) VALUES
(
	'room_aie_main',
	'evt_aie_sandbox',
	'Main Stage',
	0,
	1754650000000
),
(
	'room_aie_b',
	'evt_aie_sandbox',
	'Room B',
	1,
	1754650000000
),
(
	'room_aie_workshop',
	'evt_aie_sandbox',
	'Workshop Lab',
	2,
	1754650000000
);
