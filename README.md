# conference-engine

Run a conference programme without renting a $40k suite.

**conference-engine** takes you from call for proposals to a published schedule: CFP → review → decisions → speaker prep → rooms and tracks → publish. It is an open-source alternative to the *program* side of tools like Sessionboard or Sessionize — built to feel fast for organisers mid-cycle, with hundreds of submissions and no patience for ceremony.

- **Live product:** [conference-engine.65labs.org](https://conference-engine.65labs.org) — create a real event from the homepage
- **Read-only demo:** [conference-engine.65labs.org/demo](https://conference-engine.65labs.org/demo)
- **Parity map:** [PARITY.md](./PARITY.md) — brief requirements mapped to live routes

```text
Event → CFP → Submission → Review → Decision → Notify → Speaker tasks → Agenda slot → Published schedule
```

An accepted proposal becomes a session. Attendees only see what you publish. Staging a decision is separate from emailing it: the submissions board keeps **to notify** apart from **notified**, so you can decide in a batch and send when you are ready. The admin **program cockpit** (the live “who is blocking the programme?” board) surfaces unreviewed work, undecided proposals, people waiting on email, incomplete speaker tasks, and accepts still missing a slot — then links straight into each item.

## Who it is for

- **Organisers** — intake, review, speaker chasing, scheduling, and a public agenda. Not another CRM with a schedule bolted on.
- **Reviewers** — score assigned talks through a token link (no full admin login).
- **Speakers** — submit, withdraw if plans change, then finish bio / headshot / slides (and other tasks) in a magic-link portal.
- **Agents** — mint a per-event `ce_pat_…` token and drive the same admin jobs over JSON (list/decide submissions, place talks, manage speakers) from OpenAPI.
- **Attendees** (and embeds) — read the published schedule; it defaults to today or the next session day.

It deliberately does **not** do ticketing, payments, or marketing. The programme you edit here is the live record. CSV/XLSX exports, a public read API, an **admin agent API** (per-event Bearer tokens), optional **Accelevents** sync, and **Airtable** copies are exits and control surfaces for other tools. They update those tools from this app, not the reverse.

More product context: [PRODUCT.md](./PRODUCT.md).

## Why it exists

Sessionboard-shaped products often bundle programme + CRM + marketing and move slowly. This project ships only the programme job, on your own Cloudflare account:

- a form builder that lives in the database (no seed-SQL edits to change a CFP)
- decide and notify as two steps, not one conflated click
- a live cockpit for “who is blocking the schedule?”, with submission pacing above the board
- submission detail pages for triage (not an endless spreadsheet row)
- speaker operations without becoming a full CRM
- a clanker-friendly admin API so an agent can run the programme without clicking through the UI
- self-hosting so the data stays on your account

## Try it in five minutes

Needs **Node.js 22**.

```bash
npm ci
cp .dev.vars.example .dev.vars
# Set AUTH_SECRET (required for auth).
# For `npm run preview`, set APP_ORIGIN=http://127.0.0.1:8787
npm run db:reset:local
npm run preview
```

`npm run db:reset:local` **wipes local D1**, applies every migration, and re-seeds fixtures. It is safe to repeat on a disposable local database; export anything you care about first.

| What | Local URL |
| --- | --- |
| Demo launcher | `/demo` |
| Public demo CFP (read-only writes) | `/e/demo-cfp-to-stage/submit/cfp` |
| Public demo schedule | `/e/demo-cfp-to-stage/schedule` |
| Public demo speakers | `/e/demo-cfp-to-stage/speakers` |
| Speaker portal | `/portal` |
| Public read OpenAPI | `/api/v1/openapi.json` |
| Admin agent OpenAPI | `/api/admin/openapi.json` |
| API tokens (per event) | `/admin/events/[eventSlug]/settings?section=api-tokens` |

With `NEXTJS_ENV=development` or `ADMIN_BYPASS_ENABLED=1`, open `/admin/bypass` once for a local organiser cookie. Keep bypass **off** in production.

**`npm run preview`** builds the OpenNext Worker with local D1, R2, KV, and Durable Objects — best smoke environment. **`npm run dev`** is faster for UI work but does not match the full Cloudflare runtime (the cockpit falls back to polling if the WebSocket is unavailable).

### `/demo` vs a real event vs local fixture

| | Purpose |
| --- | --- |
| **`/demo` + `demo-cfp-to-stage`** | Public read-only playable surfaces. Launcher at `/demo` deep-links into the real CFP UI (writes blocked), schedule, and speakers. |
| **Real event** | Primary path in production: **Create your event** on the homepage / `/admin` after magic-link sign-in. Owned by you; never replace with seed scripts. |
| **`aie-sandbox` (local only)** | Optional writable fixture after `npm run db:reset:local`. Click through submit → review → schedule without creating an event. Not a production playground; prod forms for this slug should stay closed. |

## What you get

- **CFP form builder.** Build the form in the database (conditionals, sections, uploads, draft/resume). Labels you author show up on answers. When the form is within 72 hours of closing, unfinished drafts get a reminder; a landed proposal gets a confirmation email.
- **Review.** Named reviewers score assigned talks against the rubric. Empty assignment list means empty board (fail closed).
- **Decide ≠ notify.** Stage accept, waitlist, or reject on the submission detail page. Send the email later (one-by-one or bulk). Queues keep pending, to-notify, notified, withdrawn, and drafts apart so the two jobs never blur.
- **Program cockpit.** The live “who is blocking the programme?” board links into each gap, with a cumulative submissions chart above it so you can see whether intake is on track. It refreshes when the event room updates.
- **Speaker operations.** Roster, notes, announcements, and task reminders without turning into a CRM. The magic-link portal collects bio, headshot, and slides (plus salutation, pronouns, honorific). Speakers can withdraw themselves, including after a talk is placed (the slot clears and calendar invites cancel). Gaps stay on the cockpit until they land.
- **Scheduling.** Drag talks onto rooms and tracks; clashes flag before you drop. Calendar invites land as real Gmail RSVP prompts (`.ics` with `METHOD:REQUEST`). Sessionboard session CSVs import with their column names aliased; publish and content approval stay on the same path.
- **Public surfaces.** Published schedule (defaults to today or the next session day), speakers, session pages, and an iframe embed. Headshots and `.ics` ship for published sessions.
- **Exports and integrations.** Pull submissions as CSV or XLSX, zip CFP uploads or speaker deliverables, or copy submissions into Airtable (manual or nightly). **Accelevents** sync creates or updates speakers and sessions, then attaches speakers on the session itself (preview, manual push, or optional daily at 01:00 UTC).
- **APIs for tools and agents.** `/api/v1` is a keyed, read-only operator surface (submissions, schedule, speakers). The **admin agent API** uses per-event personal access tokens (`Authorization: Bearer ce_pat_…`, minted under Settings → API tokens) so a clanker can list and decide submissions, place talks, and manage speakers. Contracts: [`/api/v1/openapi.json`](https://conference-engine.65labs.org/api/v1/openapi.json) and [`/api/admin/openapi.json`](https://conference-engine.65labs.org/api/admin/openapi.json).

## Day-to-day use

**Organiser.** Sign in (magic link) → create or open an event (default **Conference** CFP preset) → finish setup (dates, rooms, tracks, tasks) → **open the CFP** (starts draft) → assign reviewers → decide on the submission detail pages (email-now is the default; status-only lands in to-notify) → clear blockers on the cockpit → chase speakers → place sessions (calendar invite status shows after place) → publish. Step-by-step judge path: `/demo?perspective=organizer`. Owners and admins also get mail when a submission is created or updated (not on every draft save).

**Reviewer.** Open the emailed or copied `/review?token=...` link. Score only what you were assigned.

**Speaker.** Submit at `/e/[eventSlug]/submit/[formSlug]` (thank-you page offers the portal). After acceptance, use `/portal` for the magic link, profile, and uploads. Withdraw from the portal if you need to pull a talk. Co-speakers confirm at `/co-speaker/[token]`.

**Public / embed.** Published sessions only: `/e/[eventSlug]/schedule`, `/speakers`, `/embed/[eventSlug]/schedule`.

## Configure locally

Copy [`.dev.vars.example`](./.dev.vars.example). Keep secrets out of git.

| Key | Notes |
| --- | --- |
| `AUTH_SECRET` | Required. Strong random value (HMAC / login challenges). |
| `APP_ORIGIN` | Exact public origin for email links (`http://127.0.0.1:8787` for preview; example file may say `localhost:3000` for `npm run dev`). |
| `ADMIN_BYPASS_ENABLED` | `1` local only; `0` in production. |
| `PUBLIC_API_KEY` | Optional deployment-wide `/api/v1` operator key. Requires `PUBLIC_API_KEY_CROSS_EVENT=1`. |
| `PUBLIC_API_KEY_CROSS_EVENT` | Set to `1`, `true`, or `yes` to enable the deployment-wide operator key. Disabled by default. |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Optional until you send real mail. |
| `AIRTABLE_*` | Optional: copy submissions into Airtable (manual push or nightly). Airtable edits are not pulled back. |
| Accelevents | Per event under **Integrations**: sync speakers and sessions out, including speaker-on-session assignment (preview, push, optional daily). |

```bash
npx wrangler secret put AUTH_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put PUBLIC_API_KEY
```

## Deploy (sketch)

Stack: Next.js App Router → OpenNext → Cloudflare Worker, with D1, R2, KV, and a per-event Durable Object for schedule writes and cockpit live updates.

1. Create D1 / R2 / KV (and DO) resources in *your* Cloudflare account — do not reuse this project’s production IDs.
2. Point `wrangler.jsonc` at those resources; set `APP_ORIGIN` and Resend from-address as vars.
3. Put secrets with `wrangler secret put`.
4. Apply D1 migrations in order (`migrations/`), then `npm run deploy`.
5. Optionally `npm run db:seed:demo:remote` for a read-only `/demo` (additive; leaves live events alone).

Before production migrations, export D1 (and back up R2). Roll back the Worker first if a release is bad, then repair data with a forward migration — do not reseed production to undo a deploy.

## API (short)

Two surfaces. Keep emails out of logs on both.

### Public read (`/api/v1`)

Event-scoped, read-only operator API. Authenticate with a per-event `ce_pat_…` Bearer token. `PUBLIC_API_KEY` is an optional deployment-wide operator escape hatch only when `PUBLIC_API_KEY_CROSS_EVENT=1` (also accepts `true` or `yes`). Shared multi-tenant deployments have no cross-event key by default.

| Docs | URL |
| --- | --- |
| OpenAPI | [`/api/v1/openapi.json`](https://conference-engine.65labs.org/api/v1/openapi.json) (no key) |
| Sessionboard public API docs | [apidocs.sessionboard.com](https://apidocs.sessionboard.com/api-reference/overview) |

**Compatibility.** Same operator job as Sessionboard keyed programme reads (submissions / sessions / speakers for an event). Not a drop-in: paths are `/api/v1/events/{eventSlug}/...`, auth is Bearer or `x-api-key` (not Sessionboard `x-access-token`), and JSON shapes are conference-engine's own. Point tooling at OpenAPI; do not reuse a Sessionboard client unchanged.

| Endpoint | Returns |
| --- | --- |
| `GET /api/v1/events/{eventSlug}/submissions` | Submission and speaker records |
| `GET /api/v1/events/{eventSlug}/schedule` | Published schedule slots |
| `GET /api/v1/events/{eventSlug}/speakers` | Roster, task status, uploaded-resource metadata (no file bytes, R2 keys, or private logistics notes) |

Public, no-key routes under `/api/e/[eventSlug]/...` serve published schedule JSON, headshots, and session `.ics`.

```bash
curl -sS http://127.0.0.1:8787/api/v1/events/demo-cfp-to-stage/speakers \
  -H "Authorization: Bearer $CE_PAT"
```

### Admin agent API (`/api/admin/...`)

For clankers and scripts that need to run the programme, not only read it. Mint a per-event personal access token under **Settings → API tokens** (`ce_pat_…` prefix; shown once; only the hash is stored). Send `Authorization: Bearer ce_pat_…`. The token grants full admin on that event only — except the token-management routes themselves, which require an organizer cookie session so a leaked PAT cannot mint or revoke tokens. Organizer cookie sessions still work on every route. Demo events stay write-blocked.

OpenAPI (no key): [`/api/admin/openapi.json`](https://conference-engine.65labs.org/api/admin/openapi.json).

Jobs covered today include listing and deciding submissions, placing a talk on the schedule, listing or creating speakers, and listing organizers. Minting and revoking tokens is cookie-session only.

```bash
# after minting a token in Settings → API tokens
export CE_PAT='ce_pat_…'
export EVENT_SLUG='your-event-slug'

# local preview
curl -sS "http://127.0.0.1:8787/api/admin/events/$EVENT_SLUG/submissions?queue=pending" \
  -H "Authorization: Bearer $CE_PAT"

# production
curl -sS "https://conference-engine.65labs.org/api/admin/events/$EVENT_SLUG/speakers" \
  -H "Authorization: Bearer $CE_PAT" \
  -H "content-type: application/json" \
  -d '{"email":"speaker@example.com","name":"Ada Lovelace","bio":"…"}'
```

## Develop and test

```bash
npm test                 # unit + Worker integration tests
npx tsc --noEmit
npm run lint
npx opennextjs-cloudflare build
```

After a behaviour change, click through one real path in `npm run preview` (submit, open submission detail, clear a cockpit blocker, portal task, or publish).

## Repo map

| Path | Holds |
| --- | --- |
| `migrations/` | D1 schema |
| `scripts/` | local + demo seeds, preflights |
| `src/app/` | public, portal, review, admin, API |
| `src/lib/` | CFP, evaluation, events, sessions, speakers, integrations |
| `src/durable-objects/` | schedule serialisation + live updates |
| `PARITY.md` | brief requirements → live routes |
| `PRODUCT.md` / `DESIGN.md` / `DECISIONS.md` | product, design, decision log |


## Accelevents speaker assignment

Accelevents does not publish a separate “assign speaker to session” API. We learned the real contract by doing the action once in their product with the browser network panel open (a HAR capture): assigning a speaker issues `PUT /session/{id}` with `speakerList` and `speakersAsTag` on the session body. The typed client in `src/lib/integrations/accelevents/` follows that observed shape, with tests. Raw HARs hold auth material, so they stay out of the repo and get deleted after the contract is written down.

## License

[MIT](./LICENSE)
