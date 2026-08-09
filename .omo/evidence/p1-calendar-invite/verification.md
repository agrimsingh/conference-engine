# P1 calendar invite, Gmail inbox proof

**Verdict.** PARTIAL.

- ICS path is real on prod: `METHOD:REQUEST`, `ORGANIZER`, stable `UID`, `ATTENDEE` with `RSVP=TRUE`, delivered to `agrim.singh@gmail.com`.
- Native Gmail accept/decline strip is **not proven**. MCP cannot render Gmail chrome. Body/MIME signals differ from a known-good Google Calendar invite. Browser automation to screenshot the strip failed (no usable Cursor browser tab).
- Outlook: **blocked** (no Outlook mailbox access this run). Do not treat Outlook as verified.

**Branch / tip.** `p1/calendar-inbox-proof` (commit after this evidence lands). No product code change. Probes showed Resend forces `Content-Disposition: attachment` even when `inline` is requested, so a speculative dual-mime patch was not shipped.

**throughput checkpoint.** Place on prod → Gmail MCP receipt → Resend CDN ICS bytes → MIME probes. Stopped before unproven MIME churn.

## Code path (already on tip)

1. Admin `POST /api/admin/events/[eventSlug]/submissions/[submissionId]/schedule` places via EventRoom, then `notifyCalendarInvite`.
2. `notifyCalendarInvite` (`src/lib/email/notify.ts`) builds ICS with `method: "REQUEST"`, `organizerEmail` = `RESEND_FROM_EMAIL` / `team@65labs.org`, per-recipient `attendeeEmail`.
3. `buildIcsInvite` (`src/lib/email/ics.ts`) emits `METHOD:REQUEST`, `ORGANIZER`, stable `UID` via `stableAgendaUid`, `SEQUENCE`, `ATTENDEE...RSVP=TRUE`.
4. Resend send (`src/lib/email/resend.ts`) attaches `invite.ics` with `content_type: text/calendar; method=REQUEST; charset=utf-8`.

## Prod trigger

- Host: `https://conference-engine.65labs.org`
- Event: `aie-sandbox`
- Submission: `4cabd03c-648e-4d18-b4a5-41bb9456dadb` (accepted, then placed)
- Slot: Main Stage, `2026-09-15T17:00:00.000Z` → `2026-09-15T17:30:00.000Z`
- Auth: organizer magic link to `agrim.singh@gmail.com` (message `19fe791bb9ed0029`)

### Schedule API (HTTP 200)

```json
{
  "ok": true,
  "status": "scheduled",
  "slot": {
    "ics_uid": "agenda-evt_aie_sandbox-4cabd03c-648e-4d18-b4a5-41bb9456dadb@conference-engine.65labs.org",
    "calendar_sequence": 0,
    "room_name": "Main Stage"
  },
  "email": {
    "ok": true,
    "status": "sent",
    "providerId": "3146e236-6556-4ae8-83b4-208f3c7c4676",
    "messageId": "2D7gVXUvVGeW_BUQQWQjF4VDOZiXuZud4P_ApHV9lhE"
  },
  "icsPreview": "BEGIN:VCALENDAR\\n...\\nMETHOD:REQUEST\\n...\\nUID:agenda-evt_aie_sandbox-4cabd03c-648e-4d18-b4a5-41bb9456dadb@conference-",
  "icsBytesLength": 699
}
```

## Gmail inbox evidence

Queried via MCP `plugin-gmail-gmail` (`search_threads` + `get_message`).

| Field | Value |
| --- | --- |
| Thread / message id | `19fe7928582af917` |
| From | `team@65labs.org` |
| To | `agrim.singh@gmail.com` |
| Subject | `Scheduled: P0 confirm email verify 20260809T171630Z @ AI Engineer Sandbox` |
| Date (Gmail) | `2026-08-09T17:29:26Z` |
| Labels | `UNREAD`, `IMPORTANT`, `INBOX` |
| Body | plaintext only; mentions `.ics` attached |
| Attachment | `invite.ics`, Gmail `mimeType` = `text/calendar` (single part) |
| Native strip | **unobserved** (no UI access). Subject was not rewritten to `Invitation:` |

### Contrast: known-good Google Calendar invite

Message `19fe68edb04405ff` (`Invitation: dinner with lily / dexter...`):

- Subject starts with `Invitation:`
- HTML body includes schema.org `RsvpAction` Yes / No / Maybe
- Attachments: `text/calendar` **and** `application/ics`

Prod conference-engine invite has neither the `Invitation:` subject rewrite nor RSVP HTML. That does not by itself prove the Gmail chrome strip is absent for third-party `METHOD:REQUEST`, but it is not evidence of native RSVP UX.

## Resend + ICS bytes (source of truth for METHOD / UID / ORGANIZER)

Remote D1 `email_deliveries` row matches API:

| Column | Value |
| --- | --- |
| delivery_key | `2D7gVXUvVGeW_BUQQWQjF4VDOZiXuZud4P_ApHV9lhE` |
| template_key | `calendar_invite` |
| to_email | `agrim.singh@gmail.com` |
| status | `sent` |
| provider_id | `3146e236-6556-4ae8-83b4-208f3c7c4676` |

Resend attachment metadata (`resend-attachment-meta.json`):

- `content_type`: `text/calendar; method=REQUEST; charset=utf-8`
- `content_disposition`: `attachment` (forced; see probes)
- size ≈ 701

Downloaded ICS (`invite-prod.ics`), unfolded:

```
METHOD:REQUEST
UID:agenda-evt_aie_sandbox-4cabd03c-648e-4d18-b4a5-41bb9456dadb@conference-engine.65labs.org
ORGANIZER;CN=conference-engine:mailto:team@65labs.org
ATTENDEE;CN=agrim.singh@gmail.com;...;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:agrim.singh@gmail.com
SEQUENCE:0
```

`From` and `ORGANIZER` share `team@65labs.org` / `65labs.org`.

## MIME probes (not product sends)

Sent via Resend API with the same From domain to isolate MIME knobs:

| Probe | Change | Result |
| --- | --- | --- |
| A (`19fe7932b6f98592`) | Dual `text/calendar` + `application/ics` | Gmail shows both mime types (same shape as Google Calendar). Subject still not `Invitation:`. No RSVP HTML. |
| B (`19fe7932e9eb51db`) | `content_disposition: inline` | Resend still stores / delivers as `attachment`. |
| C (`19fe7938c42d78a8`) | `Content-Class: urn:content-classes:calendarmessage` header | Still single `text/calendar` attachment; no RSVP HTML. |

Conclusion for product code: no minimal ICS/header fix earned a ship. Resend does not expose a reliable inline calendar body part. Dual-mime remains an unproven hypothesis for the Gmail strip.

## Outlook

Blocked. No Outlook / Microsoft 365 inbox connected. What Gmail proved above does not extend to Outlook.

## Artifacts

- `invite-prod.ics` — bytes from Resend CDN for provider `3146e236-6556-4ae8-83b4-208f3c7c4676`
- `resend-attachment-meta.json` — attachment content-type / disposition snapshot
