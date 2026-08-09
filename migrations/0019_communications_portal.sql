-- Event-owned communication configuration and portal profile work are additive.
-- Delivery attempts continue to live in email_deliveries: its delivery_key is
-- the provider idempotency key and the row contains status, provider id, and
-- error information without duplicating recipient payloads.
CREATE TABLE event_message_templates (
	id TEXT PRIMARY KEY NOT NULL,
	event_id TEXT NOT NULL REFERENCES events (id),
	template_key TEXT NOT NULL,
	subject_template TEXT NOT NULL,
	text_template TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	UNIQUE (event_id, template_key)
);
CREATE INDEX event_message_templates_by_event
	ON event_message_templates (event_id, template_key);

-- A portal profile is scoped to an event rather than a global person record.
-- The table existed before this migration; the index makes profile loading for
-- a multi-event portal session bounded and tenant-scoped.
CREATE INDEX speaker_profiles_by_event_person
	ON speaker_profiles (event_id, person_id);

-- Keep every co-speaker link generation visible after a resend rotates the
-- bearer token. The token is never stored here; delivery_key is already an
-- HMAC and is sufficient to join the delivery audit safely.
CREATE TABLE co_speaker_invitation_history (
	speaker_id TEXT NOT NULL REFERENCES submission_speakers (id),
	generation INTEGER NOT NULL CHECK (generation > 0),
	delivery_key TEXT NOT NULL UNIQUE,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (speaker_id, generation)
);
CREATE INDEX co_speaker_invitation_history_by_speaker
	ON co_speaker_invitation_history (speaker_id, generation DESC);
INSERT OR IGNORE INTO co_speaker_invitation_history (speaker_id, generation, delivery_key, created_at)
SELECT speaker_id, generation, delivery_key, created_at FROM co_speaker_invitation_claims;

-- Calendar sequence survives an unplace so the next REQUEST and its CANCEL
-- keep one UID with an RFC-monotonic revision number.
CREATE TABLE agenda_calendar_lifecycles (
	event_id TEXT NOT NULL REFERENCES events (id),
	submission_id TEXT NOT NULL REFERENCES submissions (id),
	ics_uid TEXT NOT NULL UNIQUE,
	sequence INTEGER NOT NULL DEFAULT 0 CHECK (sequence >= 0),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (event_id, submission_id)
);
INSERT OR IGNORE INTO agenda_calendar_lifecycles (
	event_id, submission_id, ics_uid, sequence, created_at, updated_at
)
SELECT event_id, submission_id, ics_uid, 0, created_at, updated_at FROM agenda_slots;

-- Keep the exact provider envelope needed for a safe replay. delivery_key is
-- already a payload HMAC, so the unique relation rejects mismatched retries.
CREATE TABLE email_delivery_envelopes (
	delivery_key TEXT PRIMARY KEY NOT NULL REFERENCES email_deliveries (delivery_key),
	event_id TEXT NOT NULL REFERENCES events (id),
	submission_id TEXT REFERENCES submissions (id),
	template_key TEXT NOT NULL,
	to_email TEXT NOT NULL,
	subject TEXT NOT NULL,
	text_body TEXT NOT NULL,
	attachments_json TEXT NOT NULL DEFAULT '[]',
	created_at INTEGER NOT NULL
);
CREATE INDEX email_delivery_envelopes_by_event
	ON email_delivery_envelopes (event_id, created_at);
