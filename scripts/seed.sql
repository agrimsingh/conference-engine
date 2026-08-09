-- LOCAL FIXTURE RESET ONLY. `npm run db:seed:local` runs this as part of
-- `npm run db:reset:local`; never pass this file to Wrangler with --remote or
-- run it against shared or production D1. Keep D1's migration metadata intact,
-- but clear every application table in child-to-parent FK order before creating
-- the writable aie-sandbox fixture below.
DELETE FROM email_delivery_envelopes;
DELETE FROM speaker_crm_activities;
DELETE FROM speaker_crm_tags;
DELETE FROM speaker_crm_profiles;
DELETE FROM content_heads;
DELETE FROM content_revisions;
DELETE FROM deliverable_comments;
DELETE FROM deliverable_versions;
DELETE FROM speaker_action_task_assignments;
DELETE FROM speaker_action_tasks;
DELETE FROM accelevents_sync_mappings;
DELETE FROM accelevents_integrations;
DELETE FROM portal_resources;
DELETE FROM public_embeds;
DELETE FROM agenda_calendar_lifecycles;
DELETE FROM co_speaker_invitation_history;
DELETE FROM co_speaker_invitation_claims;
DELETE FROM evaluation_criterion_scores;
DELETE FROM review_assignments;
DELETE FROM evaluation_scores;
DELETE FROM event_invitations;
DELETE FROM submission_draft_tokens;
DELETE FROM session_materialization_claims;
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
DELETE FROM event_speaker_profiles;
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

-- Seed: aie-sandbox writable fixture. Slug stays stable for URLs and tests.
-- Display name, tracks, three public forms, and pending/accepted abstracts
-- mirror an AI.Engineer NYC sandbox shape for screenshot walkthroughs.

INSERT INTO events (
	id, slug, name, timezone, start_day, end_day, ownership_claimable, created_at, updated_at
) VALUES (
	'evt_aie_sandbox',
	'aie-sandbox',
	'AI.Engineer Sandbox Event – NYC',
	'America/New_York',
	'2026-10-12',
	'2026-10-14',
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
	'Call for Speakers',
	'Mainstage and online proposals for AI.Engineer Sandbox Event – NYC. Fields adapt to your session format.',
	'open',
	'public',
	NULL,
	NULL,
	'{"fieldKey":"format","map":{"stage":"Stage","lightning":"Lightning","workshop":"Workshop","online":"Online"}}',
	'Thanks for submitting. We review every abstract by hand.',
	1754650000000,
	1754650000000
),
(
	'form_aie_lightning',
	'evt_aie_sandbox',
	'lightning',
	'Lightning Talks',
	'Five to ten minute launches, hot takes, and short demos.',
	'open',
	'public',
	NULL,
	NULL,
	'{"fieldKey":"format","map":{"lightning":"Lightning"}}',
	'Thanks for the lightning proposal.',
	1754650001000,
	1754650001000
),
(
	'form_aie_workshop',
	'evt_aie_sandbox',
	'workshop',
	'Workshops',
	'Hands-on sessions and technical deep dives (one to two hours).',
	'open',
	'public',
	NULL,
	NULL,
	'{"fieldKey":"format","map":{"workshop":"Workshop"}}',
	'Thanks for the workshop proposal.',
	1754650002000,
	1754650002000
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
),
(
	'field_lt_format',
	'form_aie_lightning',
	'format',
	'Session format',
	'select',
	1,
	0,
	'{"op":"always"}',
	'{"kind":"select","options":[{"value":"lightning","label":"Lightning talk"}]}',
	0
),
(
	'field_lt_title',
	'form_aie_lightning',
	'title',
	'Title',
	'text',
	1,
	1,
	'{"op":"always"}',
	'{"kind":"text","maxLength":160,"placeholder":"Your lightning title"}',
	0
),
(
	'field_lt_abstract',
	'form_aie_lightning',
	'abstract',
	'Abstract',
	'textarea',
	1,
	2,
	'{"op":"always"}',
	'{"kind":"textarea","rows":4,"maxLength":2000,"placeholder":"One idea, tightly told"}',
	0
),
(
	'field_lt_hook',
	'form_aie_lightning',
	'lightning_hook',
	'Lightning hook (one sentence)',
	'text',
	1,
	3,
	'{"op":"always"}',
	'{"kind":"text","maxLength":200,"placeholder":"The one idea you will land in 5-10 minutes"}',
	0
),
(
	'field_lt_speakers',
	'form_aie_lightning',
	'speakers',
	'Speakers',
	'speaker_block',
	1,
	4,
	'{"op":"always"}',
	'{"kind":"speaker_block","minSpeakers":1,"maxSpeakers":2}',
	0
),
(
	'field_ws_format',
	'form_aie_workshop',
	'format',
	'Session format',
	'select',
	1,
	0,
	'{"op":"always"}',
	'{"kind":"select","options":[{"value":"workshop","label":"Workshop"}]}',
	0
),
(
	'field_ws_title',
	'form_aie_workshop',
	'title',
	'Title',
	'text',
	1,
	1,
	'{"op":"always"}',
	'{"kind":"text","maxLength":160,"placeholder":"Your workshop title"}',
	0
),
(
	'field_ws_abstract',
	'form_aie_workshop',
	'abstract',
	'Abstract',
	'textarea',
	1,
	2,
	'{"op":"always"}',
	'{"kind":"textarea","rows":6,"maxLength":4000,"placeholder":"What will attendees build or practice?"}',
	0
),
(
	'field_ws_duration',
	'form_aie_workshop',
	'duration_minutes',
	'Duration (minutes)',
	'number',
	1,
	3,
	'{"op":"always"}',
	'{"kind":"number","min":60,"max":120,"step":15}',
	0
),
(
	'field_ws_capacity',
	'form_aie_workshop',
	'workshop_capacity',
	'Workshop capacity',
	'number',
	1,
	4,
	'{"op":"always"}',
	'{"kind":"number","min":8,"max":200,"step":1}',
	0
),
(
	'field_ws_prereqs',
	'form_aie_workshop',
	'workshop_prereqs',
	'Workshop prerequisites',
	'textarea',
	0,
	5,
	'{"op":"always"}',
	'{"kind":"textarea","rows":3,"placeholder":"Laptop? Account signup? Prior experience?"}',
	0
),
(
	'field_ws_speakers',
	'form_aie_workshop',
	'speakers',
	'Speakers',
	'speaker_block',
	1,
	6,
	'{"op":"always"}',
	'{"kind":"speaker_block","minSpeakers":1,"maxSpeakers":4}',
	0
);

INSERT INTO agenda_tracks (
	id, event_id, name, slug, position, soft_deleted, created_at, updated_at
) VALUES
(
	'track_aie_finserv',
	'evt_aie_sandbox',
	'FinServ',
	'finserv',
	0,
	0,
	1754650000000,
	1754650000000
),
(
	'track_aie_agents',
	'evt_aie_sandbox',
	'Agents',
	'agents',
	1,
	0,
	1754650000000,
	1754650000000
),
(
	'track_aie_platform',
	'evt_aie_sandbox',
	'Platform',
	'platform',
	2,
	0,
	1754650000000,
	1754650000000
),
(
	'track_aie_practice',
	'evt_aie_sandbox',
	'Practice',
	'practice',
	3,
	0,
	1754650000000,
	1754650000000
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

INSERT INTO people (id, email, name, created_at) VALUES
('person_aie_amara', 'amara.diallo@sandbox.invalid', 'Amara Diallo', 1754650000000),
('person_aie_jonas', 'jonas.weber@sandbox.invalid', 'Jonas Weber', 1754650000000),
('person_aie_priya', 'priya.nair@sandbox.invalid', 'Priya Nair', 1754650000000),
('person_aie_diego', 'diego.reyes@sandbox.invalid', 'Diego Reyes', 1754650000000),
('person_aie_maya', 'maya.chen@sandbox.invalid', 'Maya Chen', 1754650000000),
('person_aie_zoe', 'zoe.martin@sandbox.invalid', 'Zoe Martin', 1754650000000),
('person_aie_kai', 'kai.brooks@sandbox.invalid', 'Kai Brooks', 1754650000000),
('person_aie_leila', 'leila.rahman@sandbox.invalid', 'Leila Rahman', 1754650000000);

INSERT INTO submissions (
	id, form_id, event_id, status, answers_json, category, submitter_email, submitter_name,
	submitter_person_id, origin, created_at, updated_at, submitted_at
) VALUES
(
	'sub_aie_amara',
	'form_aie_cfp',
	'evt_aie_sandbox',
	'accepted',
	'{"format":"stage","title":"Shipping agents that recover","abstract":"Patterns for durable agent operations in production finance stacks.","duration_minutes":20}',
	'FinServ',
	'amara.diallo@sandbox.invalid',
	'Amara Diallo',
	'person_aie_amara',
	'cfp',
	1754650100000,
	1754650100000,
	1754650100000
),
(
	'sub_aie_jonas',
	'form_aie_cfp',
	'evt_aie_sandbox',
	'accepted',
	'{"format":"stage","title":"What actually breaks in production","abstract":"A field report from operating agent systems under load.","duration_minutes":20}',
	'Platform',
	'jonas.weber@sandbox.invalid',
	'Jonas Weber',
	'person_aie_jonas',
	'cfp',
	1754650200000,
	1754650200000,
	1754650200000
),
(
	'sub_aie_priya',
	'form_aie_cfp',
	'evt_aie_sandbox',
	'under_review',
	'{"format":"stage","title":"Evals beyond vibes","abstract":"A practical quality loop for AI products that ship weekly.","duration_minutes":20}',
	'Practice',
	'priya.nair@sandbox.invalid',
	'Priya Nair',
	'person_aie_priya',
	'cfp',
	1754650300000,
	1754650300000,
	1754650300000
),
(
	'sub_aie_diego',
	'form_aie_cfp',
	'evt_aie_sandbox',
	'submitted',
	'{"format":"online","title":"Structured outputs at scale","abstract":"How typed contracts keep integrations dependable.","duration_minutes":30,"online_platform":"youtube"}',
	'Platform',
	'diego.reyes@sandbox.invalid',
	'Diego Reyes',
	'person_aie_diego',
	'cfp',
	1754650400000,
	1754650400000,
	1754650400000
),
(
	'sub_aie_maya',
	'form_aie_workshop',
	'evt_aie_sandbox',
	'accepted',
	'{"format":"workshop","title":"Build a capable MCP server","abstract":"A hands-on protocol workshop for tool-calling agents.","duration_minutes":90,"workshop_capacity":40,"workshop_prereqs":"Laptop with Node 22."}',
	'Agents',
	'maya.chen@sandbox.invalid',
	'Maya Chen',
	'person_aie_maya',
	'cfp',
	1754650500000,
	1754650500000,
	1754650500000
),
(
	'sub_aie_zoe',
	'form_aie_lightning',
	'evt_aie_sandbox',
	'submitted',
	'{"format":"lightning","title":"The MCP ecosystem one year in","abstract":"A short architecture tour with production lessons.","lightning_hook":"Stop treating tools as an afterthought."}',
	'Agents',
	'zoe.martin@sandbox.invalid',
	'Zoe Martin',
	'person_aie_zoe',
	'cfp',
	1754650600000,
	1754650600000,
	1754650600000
),
(
	'sub_aie_kai',
	'form_aie_cfp',
	'evt_aie_sandbox',
	'submitted',
	'{"format":"stage","title":"A calmer workflow for approvals","abstract":"Risk-sensitive review without bottlenecks in bank AI programs.","duration_minutes":20}',
	'FinServ',
	'kai.brooks@sandbox.invalid',
	'Kai Brooks',
	'person_aie_kai',
	'cfp',
	1754650700000,
	1754650700000,
	1754650700000
),
(
	'sub_aie_leila',
	'form_aie_lightning',
	'evt_aie_sandbox',
	'under_review',
	'{"format":"lightning","title":"Retrieval that knows when to stop","abstract":"Avoid confident answers from weak evidence.","lightning_hook":"Cite or abstain."}',
	'Practice',
	'leila.rahman@sandbox.invalid',
	'Leila Rahman',
	'person_aie_leila',
	'cfp',
	1754650800000,
	1754650800000,
	1754650800000
);

INSERT INTO submission_speakers (
	id, submission_id, person_id, name, email, bio, position, status, invited_at, confirmed_at, added_after_acceptance, confirm_token_hash
) VALUES
(
	'spk_aie_amara',
	'sub_aie_amara',
	'person_aie_amara',
	'Amara Diallo',
	'amara.diallo@sandbox.invalid',
	'Staff engineer building recoverable agents.',
	0,
	'confirmed',
	1754650100000,
	1754650100000,
	0,
	NULL
),
(
	'spk_aie_jonas',
	'sub_aie_jonas',
	'person_aie_jonas',
	'Jonas Weber',
	'jonas.weber@sandbox.invalid',
	'Principal platform engineer.',
	0,
	'confirmed',
	1754650200000,
	1754650200000,
	0,
	NULL
),
(
	'spk_aie_maya',
	'sub_aie_maya',
	'person_aie_maya',
	'Maya Chen',
	'maya.chen@sandbox.invalid',
	'Protocol engineer focused on MCP.',
	0,
	'confirmed',
	1754650500000,
	1754650500000,
	0,
	NULL
);

INSERT INTO speaker_profiles (
	id, event_id, person_id, display_name, bio, job_title, company, headshot_asset_id, created_at, updated_at
) VALUES
(
	'prof_aie_amara',
	'evt_aie_sandbox',
	'person_aie_amara',
	'Amara Diallo',
	'Staff engineer building recoverable agents.',
	'Staff Engineer',
	'Resilient Labs',
	NULL,
	1754650100000,
	1754650100000
),
(
	'prof_aie_jonas',
	'evt_aie_sandbox',
	'person_aie_jonas',
	'Jonas Weber',
	'Principal platform engineer.',
	'Principal Platform Engineer',
	'Tideway Systems',
	NULL,
	1754650200000,
	1754650200000
),
(
	'prof_aie_maya',
	'evt_aie_sandbox',
	'person_aie_maya',
	'Maya Chen',
	'Protocol engineer focused on MCP.',
	'Protocol Engineer',
	'Open Systems Lab',
	NULL,
	1754650500000,
	1754650500000
);
