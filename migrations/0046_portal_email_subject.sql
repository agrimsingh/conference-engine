-- Preserve organizer-authored subjects while correcting the exact legacy default.
UPDATE event_message_templates
SET subject_template = 'Your speaker portal link — {{event_name}}'
WHERE template_key = 'portal_magic_link'
	AND subject_template = 'Sign in to your {{event_name}} speaker portal';

UPDATE event_message_templates
SET subject_template = 'Scheduled: {{calendar_label}}'
WHERE template_key = 'calendar_invite'
	AND subject_template = 'Scheduled: {{title}} @ {{event_name}}';

UPDATE event_message_templates
SET subject_template = 'Time changed: {{calendar_label}}'
WHERE template_key = 'calendar_reschedule'
	AND subject_template = 'Time changed: {{title}} @ {{event_name}}';

UPDATE event_message_templates
SET text_template = 'Hey {{submitter_name}},

The scheduled time for "{{title}}" at {{event_name}} changed.
Room: {{room_name}}
When: {{starts_at}} → {{ends_at}}

A calendar update (.ics) is attached. Please confirm you can still make it in the speaker portal:
{{portal_url}}

If anything looks off, just reply to this email.'
WHERE template_key = 'calendar_reschedule'
	AND text_template = 'Hey {{submitter_name}},

The scheduled time for "{{title}}" at {{event_name}} changed.
Room: {{room_name}}
When: {{starts_at}} → {{ends_at}}

A calendar update (.ics) is attached. Please confirm you can still make it in the speaker portal: /portal

If anything looks off, just reply to this email.';
