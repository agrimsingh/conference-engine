-- Public read-only demo fixture. It is additive, idempotent, and safe to run
-- intentionally against either local or remote D1 after migrations:
-- `npm run db:seed:demo:local` or `npm run db:seed:demo:remote`.
-- Every dependent insert joins the exact demo event (id, slug, and mode), then
-- joins its exact parent row. A reserved ID/email collision is ignored rather
-- than repurposed, so fixture children never attach to another event's rows.

INSERT OR IGNORE INTO events (
	id, slug, name, timezone, start_day, end_day, mode, track_conflict_policy,
	ownership_claimable, created_at, updated_at
)
SELECT
	'demo-cfp-to-stage-2026', 'demo-cfp-to-stage', 'CFP to Stage Demo', 'Asia/Singapore',
	'2026-10-10', '2026-10-12', 'demo', 'hard', 0, 1790000000000, 1790000000000
WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'demo-cfp-to-stage-2026')
	AND NOT EXISTS (SELECT 1 FROM events WHERE slug = 'demo-cfp-to-stage');

UPDATE events
SET start_day = '2026-10-10', end_day = '2026-10-12', updated_at = 1790000000000
WHERE id = 'demo-cfp-to-stage-2026' AND slug = 'demo-cfp-to-stage' AND mode = 'demo';

WITH demo_event AS (
	SELECT id FROM events
	WHERE id = 'demo-cfp-to-stage-2026' AND slug = 'demo-cfp-to-stage' AND mode = 'demo'
)
INSERT OR IGNORE INTO cfp_forms (
	id, event_id, slug, title, description, status, opens_at, closes_at,
	welcome_copy, confirmation_copy, reminder_copy, min_speakers, max_speakers,
	drafts_enabled, submission_limit, kind, created_at, updated_at
)
SELECT
	'demo-cfp-form', e.id, 'cfp', 'AI Systems Conference CFP',
	'A realistic conditional form used to show how proposals move from a CFP into review and a published agenda.',
	'closed', NULL, 1791000000000, NULL, NULL, NULL, 1, 4, 1, 0, 'public', 1790000000000, 1790000000000
FROM demo_event e
WHERE NOT EXISTS (SELECT 1 FROM cfp_forms WHERE id = 'demo-cfp-form')
	AND NOT EXISTS (SELECT 1 FROM cfp_forms WHERE event_id = e.id AND slug = 'cfp');

WITH demo_event AS (
	SELECT id FROM events
	WHERE id = 'demo-cfp-to-stage-2026' AND slug = 'demo-cfp-to-stage' AND mode = 'demo'
), demo_form AS (
	SELECT f.id FROM cfp_forms f JOIN demo_event e ON e.id = f.event_id
	WHERE f.id = 'demo-cfp-form' AND f.slug = 'cfp'
), fixtures(id, key, label, field_type, required, position, visibility_rule, config) AS (VALUES
	('demo-field-format', 'format', 'Session format', 'select', 1, 0, '{"op":"always"}', '{"kind":"select","options":[{"value":"stage","label":"Stage talk"},{"value":"lightning","label":"Lightning talk"},{"value":"workshop","label":"Workshop"},{"value":"online","label":"Online session"}]}'),
	('demo-field-title', 'title', 'Title', 'text', 1, 1, '{"op":"always"}', '{"kind":"text","maxLength":160,"placeholder":"Your session title"}'),
	('demo-field-abstract', 'abstract', 'Abstract', 'textarea', 1, 2, '{"op":"always"}', '{"kind":"textarea","rows":6,"maxLength":4000,"placeholder":"What will attendees learn?"}'),
	('demo-field-duration', 'duration_minutes', 'Duration (minutes)', 'number', 1, 3, '{"op":"in","fieldKey":"format","values":["stage","workshop","online"]}', '{"kind":"number","min":15,"max":240,"step":5}'),
	('demo-field-hook', 'lightning_hook', 'Lightning hook', 'text', 1, 4, '{"op":"eq","fieldKey":"format","value":"lightning"}', '{"kind":"text","maxLength":200}'),
	('demo-field-capacity', 'workshop_capacity', 'Workshop capacity', 'number', 1, 5, '{"op":"eq","fieldKey":"format","value":"workshop"}', '{"kind":"number","min":8,"max":200,"step":1}'),
	('demo-field-prereqs', 'workshop_prereqs', 'Workshop prerequisites', 'textarea', 0, 6, '{"op":"eq","fieldKey":"format","value":"workshop"}', '{"kind":"textarea","rows":3,"maxLength":1000}'),
	('demo-field-speakers', 'speakers', 'Speakers', 'speaker_block', 1, 7, '{"op":"always"}', '{"kind":"speaker_block","minSpeakers":1,"maxSpeakers":4}')
)
INSERT OR IGNORE INTO form_fields (id, form_id, key, label, field_type, required, position, visibility_rule, config, soft_deleted)
SELECT x.id, f.id, x.key, x.label, x.field_type, x.required, x.position, x.visibility_rule, x.config, 0
FROM fixtures x JOIN demo_form f
WHERE NOT EXISTS (SELECT 1 FROM form_fields WHERE id = x.id);

WITH demo_event AS (
	SELECT id FROM events
	WHERE id = 'demo-cfp-to-stage-2026' AND slug = 'demo-cfp-to-stage' AND mode = 'demo'
), fixtures(id, name, position) AS (VALUES
	('demo-room-main', 'Main Stage', 0), ('demo-room-lab', 'Builder Lab', 1), ('demo-room-forum', 'Forum', 2)
)
INSERT OR IGNORE INTO event_rooms (id, event_id, name, position, created_at)
SELECT x.id, e.id, x.name, x.position, 1790000000000
FROM fixtures x JOIN demo_event e
WHERE NOT EXISTS (SELECT 1 FROM event_rooms WHERE id = x.id);

WITH demo_event AS (
	SELECT id FROM events
	WHERE id = 'demo-cfp-to-stage-2026' AND slug = 'demo-cfp-to-stage' AND mode = 'demo'
), fixtures(id, name, slug, position) AS (VALUES
	('demo-track-agents', 'Agents', 'agents', 0), ('demo-track-platform', 'Platform', 'platform', 1), ('demo-track-practice', 'Practice', 'practice', 2)
)
INSERT OR IGNORE INTO agenda_tracks (id, event_id, name, slug, position, soft_deleted, created_at, updated_at)
SELECT x.id, e.id, x.name, x.slug, x.position, 0, 1790000000000, 1790000000000
FROM fixtures x JOIN demo_event e
WHERE NOT EXISTS (SELECT 1 FROM agenda_tracks WHERE id = x.id);

WITH demo_event AS (
	SELECT id FROM events
	WHERE id = 'demo-cfp-to-stage-2026' AND slug = 'demo-cfp-to-stage' AND mode = 'demo'
), fixtures(n, name) AS (VALUES
	('amara-diallo', 'Amara Diallo'), ('jonas-weber', 'Jonas Weber'), ('priya-nair', 'Priya Nair'), ('diego-reyes', 'Diego Reyes'),
	('hana-sato', 'Hana Sato'), ('maya-chen', 'Maya Chen'), ('ravi-patel', 'Ravi Patel'), ('zoe-martin', 'Zoe Martin'),
	('omar-haddad', 'Omar Haddad'), ('julia-kovacs', 'Julia Kovacs'), ('wei-lin', 'Wei Lin'), ('ines-almeida', 'Ines Almeida'),
	('sam-okafor', 'Sam Okafor'), ('lena-fischer', 'Lena Fischer'), ('felix-braun', 'Felix Braun'), ('tomas-eriksen', 'Tomas Eriksen'),
	('nora-berg', 'Nora Berg'), ('kai-brooks', 'Kai Brooks'), ('leila-rahman', 'Leila Rahman'), ('morgan-lee', 'Morgan Lee'),
	('aisha-khan', 'Aisha Khan'), ('benoit-marchand', 'Benoit Marchand'), ('sofia-rossi', 'Sofia Rossi'), ('elias-jensen', 'Elias Jensen')
)
INSERT OR IGNORE INTO people (id, email, name, created_at)
SELECT 'demo-person-' || x.n, lower(replace(x.n, '-', '.')) || '@example.invalid', x.name, 1790000000000
FROM fixtures x JOIN demo_event e
WHERE NOT EXISTS (
	SELECT 1 FROM people p
	WHERE p.id = 'demo-person-' || x.n OR p.email = lower(replace(x.n, '-', '.')) || '@example.invalid'
);

WITH demo_event AS (
	SELECT id FROM events
	WHERE id = 'demo-cfp-to-stage-2026' AND slug = 'demo-cfp-to-stage' AND mode = 'demo'
), demo_form AS (
	SELECT f.id, f.event_id FROM cfp_forms f JOIN demo_event e ON e.id = f.event_id
	WHERE f.id = 'demo-cfp-form' AND f.slug = 'cfp'
), fixtures(n, name, status, format, title, abstract, duration, category, position) AS (VALUES
	('amara-diallo', 'Amara Diallo', 'published', 'stage', 'Shipping agents that recover', 'Patterns for durable agent operations.', 45, 'Agents', 1),
	('jonas-weber', 'Jonas Weber', 'published', 'stage', 'What actually breaks in production', 'A field report from operating agent systems.', 45, 'Platform', 2),
	('priya-nair', 'Priya Nair', 'published', 'stage', 'Evals beyond vibes', 'A practical quality loop for AI products.', 30, 'Practice', 3),
	('diego-reyes', 'Diego Reyes', 'published', 'stage', 'Structured outputs at scale', 'How typed contracts keep integrations dependable.', 30, 'Platform', 4),
	('hana-sato', 'Hana Sato', 'published', 'stage', 'Guardrails with useful failure modes', 'Safety controls that explain themselves.', 30, 'Practice', 5),
	('maya-chen', 'Maya Chen', 'published', 'workshop', 'Build a capable MCP server', 'A hands-on protocol workshop.', 90, 'Agents', 6),
	('ravi-patel', 'Ravi Patel', 'published', 'stage', 'Eval pipelines in CI', 'Make regressions visible before release.', 30, 'Practice', 7),
	('zoe-martin', 'Zoe Martin', 'published', 'lightning', 'The MCP ecosystem one year in', 'An architecture tour with production lessons.', 15, 'Agents', 8),
	('omar-haddad', 'Omar Haddad', 'scheduled', 'stage', 'RAG postmortems', 'The failure patterns teams should plan for.', 30, 'Platform', 9),
	('julia-kovacs', 'Julia Kovacs', 'scheduled', 'stage', 'Voice agents in production', 'Latency, turn-taking, and recovery.', 30, 'Agents', 10),
	('wei-lin', 'Wei Lin', 'scheduled', 'stage', 'Shipping multimodal search', 'How index design affects experience.', 45, 'Platform', 11),
	('ines-almeida', 'Ines Almeida', 'scheduled', 'workshop', 'Observability for agents', 'Instrument the loop before it escapes.', 90, 'Practice', 12),
	('sam-okafor', 'Sam Okafor', 'accepted', 'stage', 'Serving a million tokens a second', 'Capacity planning for inference systems.', 45, 'Platform', 13),
	('lena-fischer', 'Lena Fischer', 'accepted', 'stage', 'Small models big jobs', 'Deploy focused models for focused work.', 30, 'Practice', 14),
	('felix-braun', 'Felix Braun', 'accepted', 'stage', 'Prompt injection red teaming', 'Exercise real boundaries, not paper ones.', 45, 'Agents', 15),
	('tomas-eriksen', 'Tomas Eriksen', 'waitlisted', 'stage', 'A design review for tool calls', 'Teach model actions to earn trust.', 30, 'Practice', 16),
	('nora-berg', 'Nora Berg', 'waitlisted', 'lightning', 'The incident channel is an eval', 'Turn operational traces into learning.', 15, 'Platform', 17),
	('kai-brooks', 'Kai Brooks', 'under_review', 'stage', 'A calmer workflow for approvals', 'Risk-sensitive review without bottlenecks.', 30, 'Practice', 18),
	('leila-rahman', 'Leila Rahman', 'under_review', 'stage', 'Retrieval that knows when to stop', 'Avoid confident answers from weak evidence.', 30, 'Platform', 19),
	('morgan-lee', 'Morgan Lee', 'submitted', 'stage', 'The hidden cost of agent memory', 'Retention, relevance, and deletion.', 30, 'Agents', 20)
)
INSERT OR IGNORE INTO submissions (
	id, form_id, event_id, status, answers_json, category, submitter_email, submitter_name,
	submitter_person_id, origin, created_at, updated_at, submitted_at
)
SELECT
	'demo-sub-' || x.n, f.id, e.id, x.status,
	'{"format":"' || x.format || '","title":"' || x.title || '","abstract":"' || x.abstract || '","duration_minutes":' || x.duration || '}',
	x.category, p.email, x.name, p.id, 'cfp', 1790000000000 + x.position * 60000, 1790000000000 + x.position * 60000, 1790000000000 + x.position * 60000
FROM fixtures x
JOIN demo_event e
JOIN demo_form f ON f.event_id = e.id
JOIN people p ON p.id = 'demo-person-' || x.n AND p.email = lower(replace(x.n, '-', '.')) || '@example.invalid'
WHERE NOT EXISTS (SELECT 1 FROM submissions WHERE id = 'demo-sub-' || x.n)
	AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.submitter_person_id = p.id AND s.event_id <> e.id)
	AND NOT EXISTS (SELECT 1 FROM submission_speakers ss JOIN submissions s ON s.id = ss.submission_id WHERE ss.person_id = p.id AND s.event_id <> e.id)
	AND NOT EXISTS (SELECT 1 FROM speaker_profiles sp WHERE sp.person_id = p.id AND sp.event_id <> e.id)
	AND NOT EXISTS (SELECT 1 FROM speaker_tasks st WHERE st.person_id = p.id AND st.event_id <> e.id)
	AND NOT EXISTS (SELECT 1 FROM event_members em WHERE em.person_id = p.id AND em.event_id <> e.id)
	AND NOT EXISTS (SELECT 1 FROM assets a WHERE a.uploaded_by_person_id = p.id AND a.event_id <> e.id)
	AND NOT EXISTS (SELECT 1 FROM auth_challenges ac WHERE ac.person_id = p.id AND (ac.event_id IS NULL OR ac.event_id <> e.id));

WITH demo_event AS (
	SELECT id FROM events
	WHERE id = 'demo-cfp-to-stage-2026' AND slug = 'demo-cfp-to-stage' AND mode = 'demo'
), demo_form AS (
	SELECT f.id, f.event_id FROM cfp_forms f JOIN demo_event e ON e.id = f.event_id
	WHERE f.id = 'demo-cfp-form' AND f.slug = 'cfp'
), fixtures(n, name) AS (VALUES
	('amara-diallo', 'Amara Diallo'), ('jonas-weber', 'Jonas Weber'), ('priya-nair', 'Priya Nair'), ('diego-reyes', 'Diego Reyes'),
	('hana-sato', 'Hana Sato'), ('maya-chen', 'Maya Chen'), ('ravi-patel', 'Ravi Patel'), ('zoe-martin', 'Zoe Martin')
)
INSERT OR IGNORE INTO submission_speakers (
	id, submission_id, person_id, name, email, bio, position, status, invited_at, confirmed_at, added_after_acceptance, confirm_token_hash
)
SELECT 'demo-speaker-' || x.n, s.id, p.id, x.name, p.email, 'Fictional speaker profile for the public read-only demo.', 0, 'confirmed', 1790000000000, 1790000000000, 0, NULL
FROM fixtures x
JOIN demo_event e
JOIN demo_form f ON f.event_id = e.id
JOIN submissions s ON s.id = 'demo-sub-' || x.n AND s.event_id = e.id AND s.form_id = f.id
JOIN people p ON p.id = s.submitter_person_id AND p.email = lower(replace(x.n, '-', '.')) || '@example.invalid'
WHERE NOT EXISTS (SELECT 1 FROM submission_speakers WHERE id = 'demo-speaker-' || x.n);

WITH demo_event AS (
	SELECT id FROM events
	WHERE id = 'demo-cfp-to-stage-2026' AND slug = 'demo-cfp-to-stage' AND mode = 'demo'
), fixtures(n, name, job_title, company) AS (VALUES
	('amara-diallo', 'Amara Diallo', 'Staff Engineer', 'Resilient Labs'),
	('jonas-weber', 'Jonas Weber', 'Principal Platform Engineer', 'Tideway Systems'),
	('priya-nair', 'Priya Nair', 'Head of AI Quality', 'Signal Works'),
	('diego-reyes', 'Diego Reyes', 'Developer Experience Lead', 'Contract Cloud'),
	('maya-chen', 'Maya Chen', 'Protocol Engineer', 'Open Systems Lab')
)
INSERT OR IGNORE INTO speaker_profiles (id, event_id, person_id, display_name, bio, job_title, company, headshot_asset_id, created_at, updated_at)
SELECT 'demo-profile-' || x.n, e.id, p.id, x.name, 'Fictional speaker profile for the public read-only demo.', x.job_title, x.company, NULL, 1790000000000, 1790000000000
FROM fixtures x
JOIN demo_event e
JOIN submissions s ON s.id = 'demo-sub-' || x.n AND s.event_id = e.id
JOIN people p ON p.id = s.submitter_person_id AND p.email = lower(replace(x.n, '-', '.')) || '@example.invalid'
WHERE NOT EXISTS (SELECT 1 FROM speaker_profiles WHERE id = 'demo-profile-' || x.n);

WITH demo_event AS (
	SELECT id FROM events
	WHERE id = 'demo-cfp-to-stage-2026' AND slug = 'demo-cfp-to-stage' AND mode = 'demo'
), fixtures(n, job_title, company) AS (VALUES
	('amara-diallo', 'Staff Engineer', 'Resilient Labs'),
	('jonas-weber', 'Principal Platform Engineer', 'Tideway Systems'),
	('priya-nair', 'Head of AI Quality', 'Signal Works'),
	('diego-reyes', 'Developer Experience Lead', 'Contract Cloud'),
	('maya-chen', 'Protocol Engineer', 'Open Systems Lab')
)
UPDATE speaker_profiles
SET
	job_title = (SELECT x.job_title FROM fixtures x WHERE speaker_profiles.person_id = 'demo-person-' || x.n),
	company = (SELECT x.company FROM fixtures x WHERE speaker_profiles.person_id = 'demo-person-' || x.n),
	updated_at = 1790000000000
WHERE event_id IN (SELECT id FROM demo_event)
	AND person_id IN (SELECT 'demo-person-' || n FROM fixtures);

UPDATE submissions
SET answers_json = '{"format":"lightning","title":"The MCP ecosystem one year in","abstract":"An architecture tour with production lessons.","duration_minutes":15}',
	updated_at = 1790000000000
WHERE id = 'demo-sub-zoe-martin' AND event_id = 'demo-cfp-to-stage-2026';

WITH demo_event AS (
	SELECT id FROM events
	WHERE id = 'demo-cfp-to-stage-2026' AND slug = 'demo-cfp-to-stage' AND mode = 'demo'
), fixtures(id, key, label, task_kind, required, position) AS (VALUES
	('demo-template-bio', 'bio', 'Speaker bio', 'text', 1, 0),
	('demo-template-headshot', 'headshot', 'Headshot', 'file', 1, 1),
	('demo-template-slides', 'slides', 'Slides', 'file', 1, 2),
	('demo-template-docs', 'docs', 'Supporting docs', 'file', 0, 3)
)
INSERT OR IGNORE INTO task_templates (id, event_id, key, label, task_kind, required, position, soft_deleted, created_at, updated_at)
SELECT x.id, e.id, x.key, x.label, x.task_kind, x.required, x.position, 0, 1790000000000, 1790000000000
FROM fixtures x JOIN demo_event e
WHERE NOT EXISTS (SELECT 1 FROM task_templates WHERE id = x.id);

WITH demo_event AS (
	SELECT id FROM events
	WHERE id = 'demo-cfp-to-stage-2026' AND slug = 'demo-cfp-to-stage' AND mode = 'demo'
), fixtures(id, n, template_key, status, text_value, completed_at, template_label, template_task_kind, template_required) AS (VALUES
	('demo-task-amara-bio', 'amara-diallo', 'bio', 'completed', 'Amara builds reliable agent systems.', 1790000000000, 'Speaker bio', 'text', 1),
	('demo-task-amara-slides', 'amara-diallo', 'slides', 'completed', NULL, 1790000000000, 'Slides', 'file', 1),
	('demo-task-jonas-bio', 'jonas-weber', 'bio', 'completed', 'Jonas runs resilient AI platforms.', 1790000000000, 'Speaker bio', 'text', 1),
	('demo-task-jonas-headshot', 'jonas-weber', 'headshot', 'pending', NULL, NULL, 'Headshot', 'file', 1),
	('demo-task-maya-bio', 'maya-chen', 'bio', 'completed', 'Maya teaches practical protocol design.', 1790000000000, 'Speaker bio', 'text', 1)
)
INSERT OR IGNORE INTO speaker_tasks (
	id, event_id, submission_id, person_id, template_key, status, asset_id, text_value, completed_at,
	template_label, template_task_kind, template_required, created_at, updated_at
)
SELECT x.id, e.id, s.id, p.id, x.template_key, x.status, NULL, x.text_value, x.completed_at,
	x.template_label, x.template_task_kind, x.template_required, 1790000000000, 1790000000000
FROM fixtures x
JOIN demo_event e
JOIN task_templates t ON t.event_id = e.id AND t.id = 'demo-template-' || x.template_key AND t.key = x.template_key
JOIN submissions s ON s.id = 'demo-sub-' || x.n AND s.event_id = e.id
JOIN people p ON p.id = s.submitter_person_id
WHERE NOT EXISTS (SELECT 1 FROM speaker_tasks WHERE id = x.id);

WITH demo_event AS (
	SELECT id FROM events
	WHERE id = 'demo-cfp-to-stage-2026' AND slug = 'demo-cfp-to-stage' AND mode = 'demo'
)
INSERT OR IGNORE INTO evaluation_plans (id, event_id, name, status, reviewer_token, reviewer_token_digest, created_at, updated_at)
SELECT 'demo-review-plan', e.id, 'Program committee rubric', 'active', 'digest:demo-review-plan', '2dkK9IDJ4y4Be03NKVKmuN2qVWw-tGWQAo9CXCX93g4', 1790000000000, 1790000000000
FROM demo_event e
WHERE NOT EXISTS (SELECT 1 FROM evaluation_plans WHERE id = 'demo-review-plan');

WITH demo_event AS (
	SELECT id FROM events
	WHERE id = 'demo-cfp-to-stage-2026' AND slug = 'demo-cfp-to-stage' AND mode = 'demo'
), demo_plan AS (
	SELECT p.id FROM evaluation_plans p JOIN demo_event e ON e.id = p.event_id
	WHERE p.id = 'demo-review-plan'
), fixtures(id, label, description, weight, position) AS (VALUES
	('demo-criterion-usefulness', 'Usefulness', 'Will attendees leave with a concrete practice?', 1.5, 0),
	('demo-criterion-evidence', 'Evidence', 'Does the proposal show real experience or a testable claim?', 1.2, 1),
	('demo-criterion-fit', 'Program fit', 'Does it add useful variety to the program?', 1, 2)
)
INSERT OR IGNORE INTO evaluation_criteria (id, plan_id, label, description, weight, scale_min, scale_max, position, soft_deleted, created_at, updated_at)
SELECT x.id, p.id, x.label, x.description, x.weight, 1, 5, x.position, 0, 1790000000000, 1790000000000
FROM fixtures x JOIN demo_plan p
WHERE NOT EXISTS (SELECT 1 FROM evaluation_criteria WHERE id = x.id);

WITH demo_event AS (
	SELECT id FROM events
	WHERE id = 'demo-cfp-to-stage-2026' AND slug = 'demo-cfp-to-stage' AND mode = 'demo'
), demo_plan AS (
	SELECT p.id FROM evaluation_plans p JOIN demo_event e ON e.id = p.event_id
	WHERE p.id = 'demo-review-plan'
), fixtures(id, name, token_digest) AS (VALUES
	('demo-reviewer-noor', 'Noor Ibrahim', 'OW6qfjf1v1xIwTPx8T72iEzPQyWoBaTZhFzj0GfJOuQ'),
	('demo-reviewer-theo', 'Theo Martins', 'RLsAg6pTpzCGEicGV_whgKxMJGHoluIaPL1Lr1G0kxo'),
	('demo-reviewer-ivy', 'Ivy Chen', 'q_MYVZII_BNPfyW1YuCYTyQd7MQsIHvF2l8b1iG8AMU')
)
INSERT OR IGNORE INTO reviewers (id, plan_id, name, token, token_digest, created_at)
SELECT x.id, p.id, x.name, 'digest:' || x.id, x.token_digest, 1790000000000
FROM fixtures x JOIN demo_plan p
WHERE NOT EXISTS (SELECT 1 FROM reviewers WHERE id = x.id);

WITH demo_event AS (
	SELECT id FROM events
	WHERE id = 'demo-cfp-to-stage-2026' AND slug = 'demo-cfp-to-stage' AND mode = 'demo'
), demo_plan AS (
	SELECT p.id FROM evaluation_plans p JOIN demo_event e ON e.id = p.event_id
	WHERE p.id = 'demo-review-plan'
), fixtures(id, reviewer_id, submission_id) AS (VALUES
	('demo-assignment-noor-kai', 'demo-reviewer-noor', 'demo-sub-kai-brooks'),
	('demo-assignment-noor-leila', 'demo-reviewer-noor', 'demo-sub-leila-rahman'),
	('demo-assignment-noor-morgan', 'demo-reviewer-noor', 'demo-sub-morgan-lee'),
	('demo-assignment-theo-kai', 'demo-reviewer-theo', 'demo-sub-kai-brooks')
)
INSERT OR IGNORE INTO review_assignments (id, plan_id, reviewer_id, submission_id, created_at)
SELECT x.id, p.id, r.id, s.id, 1790000000000
FROM fixtures x
JOIN demo_event e
JOIN demo_plan p
JOIN reviewers r ON r.id = x.reviewer_id AND r.plan_id = p.id
JOIN submissions s ON s.id = x.submission_id AND s.event_id = e.id
WHERE NOT EXISTS (SELECT 1 FROM review_assignments WHERE id = x.id);

WITH demo_event AS (
	SELECT id FROM events
	WHERE id = 'demo-cfp-to-stage-2026' AND slug = 'demo-cfp-to-stage' AND mode = 'demo'
), demo_plan AS (
	SELECT p.id FROM evaluation_plans p JOIN demo_event e ON e.id = p.event_id
	WHERE p.id = 'demo-review-plan'
), fixtures(id, reviewer_id, submission_id, score, comment, scored_by) AS (VALUES
	('demo-score-noor-kai', 'demo-reviewer-noor', 'demo-sub-kai-brooks', 5, 'Clear outcome and a credible approval boundary.', 'Noor Ibrahim'),
	('demo-score-theo-kai', 'demo-reviewer-theo', 'demo-sub-kai-brooks', 4, 'Strong framing, ask for one operational example.', 'Theo Martins'),
	('demo-score-noor-leila', 'demo-reviewer-noor', 'demo-sub-leila-rahman', 4, 'Useful problem statement with practical depth.', 'Noor Ibrahim'),
	('demo-score-theo-leila', 'demo-reviewer-theo', 'demo-sub-leila-rahman', 5, 'Good evidence discipline and clear takeaways.', 'Theo Martins'),
	('demo-score-noor-morgan', 'demo-reviewer-noor', 'demo-sub-morgan-lee', 3, 'Promising, but needs a more focused audience.', 'Noor Ibrahim')
)
INSERT OR IGNORE INTO evaluation_scores (id, plan_id, submission_id, score, comment, scored_by, reviewer_id, created_at, updated_at)
SELECT x.id, p.id, s.id, x.score, x.comment, x.scored_by, r.id, 1790000000000, 1790000000000
FROM fixtures x
JOIN demo_event e
JOIN demo_plan p
JOIN reviewers r ON r.id = x.reviewer_id AND r.plan_id = p.id
JOIN submissions s ON s.id = x.submission_id AND s.event_id = e.id
WHERE NOT EXISTS (SELECT 1 FROM evaluation_scores WHERE id = x.id);

WITH demo_event AS (
	SELECT id FROM events
	WHERE id = 'demo-cfp-to-stage-2026' AND slug = 'demo-cfp-to-stage' AND mode = 'demo'
), fixtures(id, submission_id, room_id, track_id, room_name, starts_at, ends_at, ics_uid) AS (VALUES
	('demo-slot-amara', 'demo-sub-amara-diallo', 'demo-room-main', 'demo-track-agents', 'Main Stage', 1791594000000, 1791596700000, 'demo-amara@conference-engine.invalid'),
	('demo-slot-jonas', 'demo-sub-jonas-weber', 'demo-room-main', 'demo-track-platform', 'Main Stage', 1791597600000, 1791600300000, 'demo-jonas@conference-engine.invalid'),
	('demo-slot-ravi', 'demo-sub-ravi-patel', 'demo-room-main', 'demo-track-practice', 'Main Stage', 1791680400000, 1791682200000, 'demo-ravi@conference-engine.invalid'),
	('demo-slot-maya', 'demo-sub-maya-chen', 'demo-room-lab', 'demo-track-practice', 'Builder Lab', 1791594000000, 1791599400000, 'demo-maya@conference-engine.invalid'),
	('demo-slot-diego', 'demo-sub-diego-reyes', 'demo-room-forum', 'demo-track-platform', 'Forum', 1791595800000, 1791597600000, 'demo-diego@conference-engine.invalid'),
	('demo-slot-hana', 'demo-sub-hana-sato', 'demo-room-lab', 'demo-track-practice', 'Builder Lab', 1791684000000, 1791685800000, 'demo-hana@conference-engine.invalid'),
	('demo-slot-zoe', 'demo-sub-zoe-martin', 'demo-room-main', 'demo-track-agents', 'Main Stage', 1791768600000, 1791769500000, 'demo-zoe@conference-engine.invalid')
)
INSERT OR IGNORE INTO agenda_slots (id, event_id, submission_id, room_id, track_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at)
SELECT x.id, e.id, s.id, r.id, t.id, x.room_name, x.starts_at, x.ends_at, x.ics_uid, 1790000000000, 1790000000000
FROM fixtures x
JOIN demo_event e
JOIN submissions s ON s.id = x.submission_id AND s.event_id = e.id
JOIN event_rooms r ON r.id = x.room_id AND r.event_id = e.id
JOIN agenda_tracks t ON t.id = x.track_id AND t.event_id = e.id
WHERE NOT EXISTS (SELECT 1 FROM agenda_slots WHERE id = x.id);

-- Stable public widgets make the demo immediately usable after migration 0029.
-- Inserts ignore reserved-ID collisions; the refresh below is scoped to this demo
-- event, so reseeding cannot modify another event's definitions.
WITH demo_event AS (
	SELECT id FROM events
	WHERE id = 'demo-cfp-to-stage-2026' AND slug = 'demo-cfp-to-stage' AND mode = 'demo'
), fixtures(id, name, slug, widget_type, config_json) AS (VALUES
	('demo-embed-sessions', 'Featured sessions', 'sessions', 'sessions', '{"brandColor":"#2563eb","trackIds":["demo-track-agents"],"formats":["Stage","Lightning"],"rooms":["Main Stage"],"visibleFields":["title","time","room","track","speakers","abstract","format"]}'),
	('demo-embed-speakers', 'Speaker directory', 'speakers', 'speakers', '{"brandColor":"#2563eb","trackIds":[],"formats":[],"rooms":[],"visibleFields":["headshot","jobTitle","company","bio"]}'),
	('demo-embed-agenda', 'Conference agenda', 'agenda', 'agenda', '{"brandColor":"#2563eb","trackIds":[],"formats":[],"rooms":[],"visibleFields":["title","time","room","track","speakers","abstract","format"]}'),
	('demo-embed-itinerary', 'Build your itinerary', 'itinerary', 'itinerary', '{"brandColor":"#2563eb","trackIds":[],"formats":[],"rooms":[],"visibleFields":["title","time","room","track","speakers"]}'),
	('demo-embed-speaker-gallery', 'Speaker gallery', 'speaker-gallery', 'speaker_gallery', '{"brandColor":"#2563eb","trackIds":[],"formats":[],"rooms":[],"visibleFields":["headshot","jobTitle","company","bio"]}')
)
INSERT OR IGNORE INTO public_embeds (id, event_id, name, slug, widget_type, config_json, created_at, updated_at)
SELECT x.id, e.id, x.name, x.slug, x.widget_type, x.config_json, 1790000000000, 1790000000000
FROM fixtures x JOIN demo_event e;

WITH demo_event AS (
	SELECT id FROM events
	WHERE id = 'demo-cfp-to-stage-2026' AND slug = 'demo-cfp-to-stage' AND mode = 'demo'
), fixtures(id, name, slug, widget_type, config_json) AS (VALUES
	('demo-embed-sessions', 'Featured sessions', 'sessions', 'sessions', '{"brandColor":"#2563eb","trackIds":["demo-track-agents"],"formats":["Stage","Lightning"],"rooms":["Main Stage"],"visibleFields":["title","time","room","track","speakers","abstract","format"]}'),
	('demo-embed-speakers', 'Speaker directory', 'speakers', 'speakers', '{"brandColor":"#2563eb","trackIds":[],"formats":[],"rooms":[],"visibleFields":["headshot","jobTitle","company","bio"]}'),
	('demo-embed-agenda', 'Conference agenda', 'agenda', 'agenda', '{"brandColor":"#2563eb","trackIds":[],"formats":[],"rooms":[],"visibleFields":["title","time","room","track","speakers","abstract","format"]}'),
	('demo-embed-itinerary', 'Build your itinerary', 'itinerary', 'itinerary', '{"brandColor":"#2563eb","trackIds":[],"formats":[],"rooms":[],"visibleFields":["title","time","room","track","speakers"]}'),
	('demo-embed-speaker-gallery', 'Speaker gallery', 'speaker-gallery', 'speaker_gallery', '{"brandColor":"#2563eb","trackIds":[],"formats":[],"rooms":[],"visibleFields":["headshot","jobTitle","company","bio"]}')
)
UPDATE public_embeds
SET
	name = (SELECT x.name FROM fixtures x WHERE x.id = public_embeds.id),
	slug = (SELECT x.slug FROM fixtures x WHERE x.id = public_embeds.id),
	widget_type = (SELECT x.widget_type FROM fixtures x WHERE x.id = public_embeds.id),
	config_json = (SELECT x.config_json FROM fixtures x WHERE x.id = public_embeds.id),
	updated_at = 1790000000000
WHERE event_id IN (SELECT id FROM demo_event)
	AND id IN (SELECT id FROM fixtures);
