-- Reply-To address for speaker/reviewer-facing outbound email.
-- Null/empty means resolve to the event owner account email at send time.
ALTER TABLE events ADD COLUMN contact_email TEXT;
