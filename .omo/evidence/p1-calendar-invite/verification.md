# P1 calendar invite, Gmail inbox proof

**Verdict.** PASS (Gmail native RSVP strip). Outlook still blocked (no mailbox).

Human screenshots (2026-08-10) show Gmail rendering Yes / Maybe / No on the Resend probe invites. The earlier PARTIAL was MCP-blindness: API/MIME inspection cannot see Gmail chrome.

## Gmail strip (human evidence)

| Probe | Message intent | Screenshot | Strip |
| --- | --- | --- | --- |
| A | Dual `text/calendar` + `application/ics` | `gmail-probe-a-strip.png` | Yes / Maybe / No |
| B | `content_disposition: inline` (Resend still delivered as attachment) | `gmail-probe-b-strip.png` | Yes / Maybe / No |
| C | `Content-Class: urn:content-classes:calendarmessage` | `gmail-probe-c-strip.png` | Yes / Maybe / No |

All three show the Google Calendar card (When / Where / Who) plus RSVP buttons. Body remains plaintext; `invite.ics` still listed as an attachment. Native strip does **not** require Google's `Invitation:` subject rewrite or RSVP HTML schema.

Implication for product code: attachment-only `text/calendar; method=REQUEST` with `ORGANIZER` matching `From` (`team@65labs.org`) is enough. No dual-mime or Content-Class change required on tip.

## Prod place (same ICS contract)

- Host: `https://conference-engine.65labs.org`
- Event: `aie-sandbox`
- Submission: `4cabd03c-648e-4d18-b4a5-41bb9456dadb`
- Gmail message (prod path): `19fe7928582af917`
- Resend provider: `3146e236-6556-4ae8-83b4-208f3c7c4676`
- UID: `agenda-evt_aie_sandbox-4cabd03c-648e-4d18-b4a5-41bb9456dadb@conference-engine.65labs.org`
- METHOD: `REQUEST`
- ORGANIZER: `mailto:team@65labs.org` (matches From)

ICS bytes: `invite-prod.ics`. Attachment meta: `resend-attachment-meta.json`.

## Code path

1. `POST /api/admin/events/[eventSlug]/submissions/[submissionId]/schedule` → EventRoom place → `notifyCalendarInvite`
2. `buildIcsInvite` → `METHOD:REQUEST`, stable UID, SEQUENCE, ATTENDEE RSVP=TRUE
3. Resend attaches `invite.ics` as `text/calendar; method=REQUEST; charset=utf-8`

## Outlook

Blocked. No Outlook / Microsoft 365 inbox connected this wave.

## Artifacts

- `gmail-probe-{a,b,c}-strip.png` — human Gmail chrome with RSVP
- `invite-prod.ics` — Resend CDN bytes for prod place
- `resend-attachment-meta.json`
