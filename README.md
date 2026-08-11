# conference-engine

Run a conference programme without renting a $40k suite.

**conference-engine** is the open-source programme layer for CFP → review → decisions → speaker prep → schedule → publish. It handles the programme side of tools like Sessionboard or Sessionize — built to feel fast for organisers mid-cycle, with hundreds of submissions and no patience for ceremony.

- **Live product:** [conference-engine.65labs.org](https://conference-engine.65labs.org) — create a real event from the homepage
- **Read-only demo:** [conference-engine.65labs.org/demo](https://conference-engine.65labs.org/demo)
- **Compare / self-host:** [conference-engine.65labs.org/compare](https://conference-engine.65labs.org/compare) — vs Sessionboard/Sessionize, what we skip, deploy sketch
- **Parity map:** [PARITY.md](./PARITY.md) — brief requirements mapped to live routes

The spine is a single path: CFP → submission → review → decision → notify → speaker tasks → agenda slot → published schedule. An accepted proposal becomes a session. Attendees only see what you publish.

Deciding and emailing are two steps on purpose. Stage an accept, waitlist, or reject on the submission detail page; send the email later, one-by-one or in bulk. The submissions board keeps pending, to-notify, notified, withdrawn, and drafts in separate queue tabs so neither job bleeds into the other. The program cockpit (the live "who is blocking the programme?" board) links into every gap — unreviewed proposals, pending emails, incomplete speaker tasks, accepted sessions still missing a slot — with a submissions pacing chart above it. The lifecycle path on the event dashboard walks every setup step through to publish. Both refresh live via the EventRoom WebSocket.

## Who it is for

- **Organisers** — CFP intake, review, decisions, a speaker CRM for cross-event contacts, scheduling, and a public agenda.
- **Reviewers** — score assigned talks through a token link (no full admin login).
- **Speakers** — submit, withdraw if plans change, then complete bio/headshot/slides through a magic-link portal.
- **Agents** — mint a per-event `ce_pat_…` token and drive the same admin jobs over JSON from the admin OpenAPI.
- **Attendees** (and embeds) — read the published schedule; it defaults to today or the next session day.

## Why it exists

Sessionboard-shaped products bundle programme + CRM + marketing and move slowly. This project ships only the programme job, on your own Cloudflare account:

- a form builder that lives in the database — no seed-SQL edits to change a CFP
- decide and notify as two steps, not one conflated click
- a live cockpit for "who is blocking the schedule?", with submission pacing above the board
- a lightweight speaker CRM at `/admin/contacts` — account-scoped directory, tags, segments, pipeline, CSV import, push-to-event
- a clanker-friendly admin API so an agent can run the programme without clicking through the UI
- self-hosting so the data stays on your Cloudflare account

## Try it

**In the browser — the public demo is read-only:**

- [/demo](https://conference-engine.65labs.org/demo) — launcher with deep links into all playable surfaces
- [/e/demo-cfp-to-stage/submit/cfp](https://conference-engine.65labs.org/e/demo-cfp-to-stage/submit/cfp) — the real CFP form (writes blocked)
- [/e/demo-cfp-to-stage/schedule](https://conference-engine.65labs.org/e/demo-cfp-to-stage/schedule) — published schedule grid

To run the full cycle (submit → review → decide → schedule), create your event at [conference-engine.65labs.org/admin](https://conference-engine.65labs.org/admin).

**Locally** — needs Node.js 22:

```bash
npm ci
cp .dev.vars.example .dev.vars
# Set AUTH_SECRET (required for auth)
# For `npm run preview`, set APP_ORIGIN=http://127.0.0.1:8787
npm run db:reset:local
npm run preview
```

`npm run db:reset:local` wipes local D1, applies every migration, and re-seeds fixtures. It is safe to repeat; export anything you care about first.

| What | Local URL |
| --- | --- |
| Demo launcher | `/demo` |
| Public demo CFP (read-only) | `/e/demo-cfp-to-stage/submit/cfp` |
| Public demo schedule | `/e/demo-cfp-to-stage/schedule` |
| Speaker portal | `/portal` |
| Public read OpenAPI | `/api/v1/openapi.json` |
| Admin agent OpenAPI | `/api/admin/openapi.json` |
| API tokens (per event) | `/admin/events/[eventSlug]/settings?section=api-tokens` |

With `NEXTJS_ENV=development` or `ADMIN_BYPASS_ENABLED=1`, open `/admin/bypass` once for a local organiser cookie. Keep bypass off in production.

`npm run preview` builds the OpenNext Worker with local D1, R2, KV, and Durable Objects — best smoke environment. `npm run dev` is faster for UI work but does not match the full Cloudflare runtime (the cockpit falls back to polling if the WebSocket is unavailable).

## What you get

**CFP form builder.** The form lives in the database — conditionals, sections, file uploads, draft/resume. Labels you author appear on answers. Within 72 hours of closing, unfinished drafts get a reminder; a landed proposal gets a confirmation email.

**Review.** Named reviewers score only what they're assigned, against a rubric. The board fails closed: an empty assignment list means an empty board. The chair reads scores, not an email chain.

**Decide ≠ notify.** Stage accept, waitlist, or reject. Send the email later in one burst or one at a time. Pending, to-notify, notified, withdrawn, and drafts live in separate queue tabs so the two jobs never blur.

**Program cockpit and lifecycle.** The cockpit links into every gap — unreviewed proposals, pending emails, incomplete speaker tasks, accepts without a slot — with a cumulative submissions chart. The lifecycle path on the event dashboard walks every setup step through to publish. Both refresh live via the EventRoom WebSocket.

**Speaker CRM.** The account-scoped contacts directory at `/admin/contacts` spans all your events: search, tags, segments, pipeline view, and CSV import. Push a contact to any event you own. Portal links and reviewer access links are mintable and copyable from the speaker record.

**Speaker operations.** The magic-link portal collects bio, headshot, and slides (plus salutation, pronouns, honorific). Speakers can withdraw themselves, including after a talk is placed — the slot clears and calendar invites cancel. Outstanding gaps stay on the cockpit until they land. The event contact email is used as Reply-To on all speaker and reviewer mail.

**Scheduling.** Drag talks onto rooms and tracks; clashes flag before you drop. Auto-place fills the unscheduled rail in one pass, placing accepted talks into open slots. Calendar invites land as real Gmail RSVP prompts (`.ics` with `METHOD:REQUEST`). Attendees can subscribe to the live schedule at `/e/[slug]/schedule.ics`.

**Public surfaces.** Published schedule (defaults to today or the next session day), speakers, session pages, and an iframe embed. Embeds can be paused to stop serving without touching the publish gate. Headshots and `.ics` ship for published sessions.

**Exports and integrations.** CSV/XLSX submission export, CFP upload zip, speaker deliverables zip, Airtable copy (manual or nightly). Accelevents sync pushes speakers and sessions out; see [DECISIONS.md](./DECISIONS.md) for the HAR-derived speaker-assignment contract.

**APIs.** `/api/v1` is a keyed, read-only operator surface (submissions, schedule, speakers). The admin agent API uses per-event tokens (`ce_pat_…`) so an agent can list/decide submissions, place talks, and manage speakers. Contracts at [`/api/v1/openapi.json`](https://conference-engine.65labs.org/api/v1/openapi.json) and [`/api/admin/openapi.json`](https://conference-engine.65labs.org/api/admin/openapi.json).

## Day-to-day use

**Organiser.** Sign in (magic link) → create or open an event (default Conference CFP preset) → finish setup (dates, rooms, tracks, tasks) → open the CFP → assign reviewers → decide on submission detail pages → clear blockers on the cockpit → chase speakers → place sessions → publish. The lifecycle path on your event dashboard tracks every step. Step-by-step walkthrough: `/demo?perspective=organizer`.

**Reviewer.** Open the emailed or copied `/review?token=...` link. Score only what you were assigned.

**Speaker.** Submit at `/e/[eventSlug]/submit/[formSlug]`. After acceptance, use `/portal` for the magic link, profile, and uploads. Withdraw from the portal if plans change. Co-speakers confirm at `/co-speaker/[token]`.

**Public / embed.** Published sessions only: `/e/[eventSlug]/schedule`, `/speakers`, `/embed/[eventSlug]/schedule`.

## Configure and deploy

Copy [`.dev.vars.example`](./.dev.vars.example). Keep secrets out of git.

| Key | Notes |
| --- | --- |
| `AUTH_SECRET` | Required. Strong random value (HMAC / login challenges). |
| `APP_ORIGIN` | Exact public origin for email links (`http://127.0.0.1:8787` for preview). |
| `ADMIN_BYPASS_ENABLED` | `1` local only; `0` in production. |
| `PUBLIC_API_KEY` | Optional deployment-wide `/api/v1` operator key. Requires `PUBLIC_API_KEY_CROSS_EVENT=1`. |
| `PUBLIC_API_KEY_CROSS_EVENT` | Set to `1`, `true`, or `yes` to enable. Disabled by default. |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Optional until you send real mail. |
| `AIRTABLE_*` | Optional: push submissions into Airtable (manual or nightly). Edits are not pulled back. |
| Accelevents | Per event under Integrations: sync speakers and sessions out. |

```bash
npx wrangler secret put AUTH_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put PUBLIC_API_KEY
```

Stack: Next.js App Router → OpenNext → Cloudflare Worker, with D1, R2, KV, and a per-event Durable Object for schedule writes and cockpit live updates.

1. Create D1/R2/KV resources in your Cloudflare account — do not reuse this project's production IDs.
2. Point `wrangler.jsonc` at those resources; set `APP_ORIGIN` and Resend from-address as vars.
3. Put secrets with `wrangler secret put`.
4. Apply D1 migrations in order (`migrations/`), then `npm run deploy`.
5. Optionally `npm run db:seed:demo:remote` for a read-only `/demo` (additive; leaves live events alone).

Before production migrations, export D1 and back up R2. Roll back the Worker first if a release is bad, then repair data with a forward migration.

## API

Two surfaces. Keep emails out of logs on both.

### Public read (`/api/v1`)

Event-scoped, read-only. Authenticate with a per-event `ce_pat_…` Bearer token. `PUBLIC_API_KEY` is an optional deployment-wide escape hatch only when `PUBLIC_API_KEY_CROSS_EVENT=1`; multi-tenant deployments have no cross-event key by default.

OpenAPI (no key): [`/api/v1/openapi.json`](https://conference-engine.65labs.org/api/v1/openapi.json)

Endpoints: `GET /api/v1/events/{eventSlug}/submissions`, `/schedule`, `/speakers`.

```bash
curl -sS http://127.0.0.1:8787/api/v1/events/demo-cfp-to-stage/speakers \
  -H "Authorization: Bearer $CE_PAT"
```

### Admin agent API (`/api/admin/...`)

For agents and scripts that need to run the programme, not only read it. Mint a per-event personal access token under Settings → API tokens (`ce_pat_…`; shown once; hash stored). Send `Authorization: Bearer ce_pat_…` — full admin on that event only. Token management routes require a cookie session so a leaked PAT cannot mint its own successor. Demo events stay write-blocked.

OpenAPI (no key): [`/api/admin/openapi.json`](https://conference-engine.65labs.org/api/admin/openapi.json)

```bash
export CE_PAT='ce_pat_…'
export EVENT_SLUG='your-event-slug'

curl -sS "http://127.0.0.1:8787/api/admin/events/$EVENT_SLUG/submissions?queue=pending" \
  -H "Authorization: Bearer $CE_PAT"
```

## Develop and test

```bash
npm test                 # unit + Worker integration tests
npx tsc --noEmit
npm run lint
npx opennextjs-cloudflare build
```

After a behaviour change, click through one real path in `npm run preview` (submit, open submission detail, clear a cockpit blocker, portal task, or publish).

## Accelevents

Accelevents does not document speaker-to-session assignment. The contract was learned from a single browser capture: `PUT /session/{id}` with `speakerList` and `speakersAsTag`. The typed client in `src/lib/integrations/accelevents/` follows that shape, with tests. Full decision log: [DECISIONS.md](./DECISIONS.md).

## License

[MIT](./LICENSE)
