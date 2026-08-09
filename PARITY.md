# Brief parity map

Reference for the Sessionboard-alternative hackathon brief (`research/brief.md`, not in this repo). Rows follow brief order. Routes verified against this tip.

Replace `[eventSlug]` with a live slug (`aie-sandbox` locally). `[formSlug]` is a public form slug (`cfp`, `lightning`, or `workshop` on the sandbox fixture).

## Firm requirements

1. Custom CFP submission forms with conditional logic and category-based routing
   - Public submit: `/e/[eventSlug]/submit/[formSlug]`
   - Form list: `/admin/events/[eventSlug]/forms`
   - Form builder: `/admin/events/[eventSlug]/forms/[formSlug]`
   - Form APIs: `/api/admin/events/[eventSlug]/forms`, `/api/admin/events/[eventSlug]/forms/[formSlug]/fields`
   - Public submit APIs: `/api/e/[eventSlug]/submit/[formSlug]`, `.../draft`, `.../draft/save`, `.../draft/finalize`, `.../upload`

2. Self-service speaker portal (bios, headshots, slides, supporting docs)
   - Portal: `/portal`
   - Portal APIs: `/api/portal/session`, `/api/portal/profile/[eventId]`, `/api/portal/profile/[eventId]/headshot`, `/api/portal/tasks/[taskId]/*`, `/api/portal/action-tasks/[assignmentId]/complete`
   - Co-speaker confirm: `/co-speaker/[token]`
   - Post-submit thank-you stays on `/e/[eventSlug]/submit/[formSlug]` with ~10s redirect to `/portal` (countdown + CTA; no new route)
   - Speaker withdraw: `/api/portal/submissions/[submissionId]/withdraw`

3. Automated templated speaker communications (reminders and calendar invites)
   - Communications console: `/admin/events/[eventSlug]/communications`
   - Reminder APIs: `/api/admin/events/[eventSlug]/communications`, `.../communications/[deliveryKey]/retry`, `/api/admin/events/[eventSlug]/reminders`
   - Calendar: `/api/e/[eventSlug]/sessions/[sessionId]/ics`, `/api/e/[eventSlug]/itinerary/ics`, embed `/api/e/[eventSlug]/embeds/[embedSlug]/ical`
   - Draft reminders: worker cron when form `closes_at` is within 72h (template key `draft_reminder`)
   - Confirmation email: Resend `submission_received` on submit and draft finalize (prod inbox verified)

4. Submission evaluation and scoring workflows
   - Review board (token): `/review`
   - Organizer review workspace: `/admin/events/[eventSlug]/review`
   - Review APIs: `/api/review/score`, `/api/review/recuse`, `/api/admin/events/[eventSlug]/review/*`, `/api/admin/events/[eventSlug]/evaluation/*`
   - Scores CSV: `/api/admin/events/[eventSlug]/export/scores.csv`
   - Struck in brief: AI-assisted review (not shipped)

5. Drag-and-drop schedule and agenda with conflict detection; list, day, week, track, and room views
   - Schedule editor: `/admin/events/[eventSlug]/schedule`
   - Sessions list: `/admin/events/[eventSlug]/sessions`
   - Settings (rooms, tracks): `/admin/events/[eventSlug]/settings`
   - Schedule APIs: `/api/admin/events/[eventSlug]/sessions`, `.../sessions/bulk-publish`, `.../settings/rooms`, `.../settings/tracks`, `/api/admin/events/[eventSlug]/room`
   - Public schedule: `/e/[eventSlug]/schedule`, session `/e/[eventSlug]/sessions/[sessionId]`, speakers `/e/[eventSlug]/speakers`

6. Real-time dashboard of outstanding speaker onboarding tasks
   - Program cockpit: `/admin/events/[eventSlug]/dashboard`
   - Outstanding tasks UI: `/admin/events/[eventSlug]/tasks`
   - Cockpit and task APIs: `/api/admin/events/[eventSlug]/cockpit`, `/api/admin/events/[eventSlug]/tasks`, `.../tasks/outstanding`, `/api/admin/events/[eventSlug]/room` (EventRoom WebSocket)

## Bonus: built anyway

Items the brief struck or listed as stack bonuses, but this tip already exposes.

1. Accelevents one-way sync (struck in brief)
   - `/admin/events/[eventSlug]/integrations/accelevents`
   - `/api/admin/events/[eventSlug]/integrations/accelevents`, `.../sync`

2. Portal wiki and resources (struck in brief)
   - `/admin/events/[eventSlug]/resources`
   - `/api/admin/events/[eventSlug]/resources`, `.../resources/[resourceId]`

3. Embeddable schedule (struck gallery+schedule wording; schedule embed ships)
   - `/embed/[eventSlug]/schedule`, `/embed/[eventSlug]/sessions/[sessionId]`, `/embed/[eventSlug]/widgets/[embedSlug]`
   - Embed admin: `/admin/events/[eventSlug]/embeds`
   - Embed APIs: `/api/e/[eventSlug]/embeds/[embedSlug]`, `.../html`, `.../xml`, `.../ical`, `.../loader.js`

4. Airtable mirror mode (judgment call: one-way D1→Airtable so teams keep living in sheets; never reverse sync)
   - `/api/admin/events/[eventSlug]/export/airtable`, `.../export/airtable/sync`

5. Keyed public API (stack bonus)
   - `/api/v1/openapi.json`
   - `/api/v1/events/[eventSlug]/submissions`, `.../schedule`, `.../speakers`

6. Organizer export
   - CSV: `/api/admin/events/[eventSlug]/export/submissions.csv`
   - XLSX: `/api/admin/events/[eventSlug]/export/submissions.xlsx`
   - CFP upload assets zip: `/api/admin/events/[eventSlug]/export/submission-uploads.zip`
   - Deliverables zip (speaker files, not CFP uploads): `/api/admin/events/[eventSlug]/files/export`

7. Content approval and files
   - `/admin/events/[eventSlug]/content`, `/admin/events/[eventSlug]/files`

8. Team and ownership
   - `/admin/events/[eventSlug]/team`
   - `/api/admin/events/[eventSlug]/members`, `.../members/leave`, `.../members/transfer`, `.../claim`

## P0 landed (decide ≠ notify)

| Work | Route or surface |
| --- | --- |
| Queue tabs + notified derivation | `/admin/events/[eventSlug]/submissions` (`?queue=pending\|to_notify\|notified\|withdrawn\|drafts`) |
| Bulk notify decided | `/api/admin/events/[eventSlug]/submissions/notify` |
| Speaker-initiated withdraw | `/api/portal/submissions/[submissionId]/withdraw` |

## Local screenshot twin

Writable fixture slug stays `aie-sandbox` (stable for URLs and tests). Display name and forms in `scripts/seed.sql` mirror an NYC sandbox shape for walkthrough screenshots. Read-only `/demo` (`demo-cfp-to-stage`) stays separate and mutation-blocked.
