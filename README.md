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
- **Attendees** (and embeds) — read the published schedule; it defaults to today or the next session day.

It deliberately does **not** do ticketing, payments, or marketing. [D1](https://developers.cloudflare.com/d1/) is the source of truth. Spreadsheet exports, a keyed API, optional **Accelevents** push, and **Airtable mirror mode** (one-way push, optional nightly opt-in) are exits. They never write back into the programme database, and Airtable never syncs into D1.

More product context: [PRODUCT.md](./PRODUCT.md).

## Why it exists

Sessionboard-shaped products often bundle programme + CRM + marketing and move slowly. This project ships only the programme job, on your own Cloudflare account:

- a form builder that lives in the database (no seed-SQL edits to change a CFP)
- decide and notify as two steps, not one conflated click
- a live cockpit for “who is blocking the schedule?”, with submission pacing above the board
- submission detail pages for triage (not an endless spreadsheet row)
- speaker operations without becoming a full CRM
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
| Writable CFP sandbox (`AI.Engineer Sandbox Event – NYC`) | `/e/aie-sandbox/submit/cfp` (also `lightning`, `workshop`) |
| Form builder | `/admin/events/aie-sandbox/forms` |
| Submissions (queues + detail) | `/admin/events/aie-sandbox/submissions` |
| Program cockpit (+ pacing) | `/admin/events/aie-sandbox/dashboard` |
| Speaker roster / ops | `/admin/events/aie-sandbox/speakers` |
| Communications | `/admin/events/aie-sandbox/communications` |
| Schedule editor | `/admin/events/aie-sandbox/schedule` |
| Speaker portal | `/portal` |
| Public schedule | `/e/aie-sandbox/schedule` |
| Public speakers | `/e/aie-sandbox/speakers` |
| Embeddable schedule | `/embed/aie-sandbox/schedule` |
| Read-only product demo | `/demo` |
| OpenAPI | `/api/v1/openapi.json` |

With `NEXTJS_ENV=development` or `ADMIN_BYPASS_ENABLED=1`, open `/admin/bypass` once for a local organiser cookie. Keep bypass **off** in production.

**`npm run preview`** builds the OpenNext Worker with local D1, R2, KV, and Durable Objects — best smoke environment. **`npm run dev`** is faster for UI work but does not match the full Cloudflare runtime (the cockpit falls back to polling if the WebSocket is unavailable).

### Sandbox vs `/demo` vs a real event

| | Purpose |
| --- | --- |
| **`aie-sandbox`** | Writable local fixture named **AI.Engineer Sandbox Event – NYC**. Three public forms (`cfp`, `lightning`, `workshop`) plus pending and accepted abstracts for screenshot walkthroughs. Submit → review → schedule → publish without creating an event first. |
| **`/demo`** | Read-only seeded walkthrough. Safe to show publicly; mutations are blocked. |
| **Real event** | Primary path in production: **Create your event** on the homepage / `/admin` after magic-link sign-in. Owned by you; never replace with seed scripts. |

## What you get

- **CFP form builder** — fields, required rules, conditionals, sections, uploads, draft/resume, limits, category → track routing. Labels you author show up on submission answers. Drafts get a reminder when the form is within 72 hours of closing; submitters get a confirmation email when a proposal lands.
- **Review** — named reviewers, criteria, scores/comments, accept / waitlist / reject. Empty assignment list means empty board (fail closed).
- **Decide ≠ notify** — stage accept / waitlist / reject on the submission detail page, then bulk-send (or send one) when you mean to. Queues keep pending, to-notify, notified, withdrawn, and drafts apart.
- **Program cockpit** — live blocker tiles with links into the work, plus a cumulative submissions pacing chart so you can see whether intake is on track. Realtime refresh when the event room updates.
- **Speaker operations** — roster, owners/tags/private notes, contact timeline, announcements, structured tasks and reminders. Portal covers bio, headshot, slides, identity fields (salutation, pronouns, honorific), co-speaker confirm, and speaker-initiated withdraw. Outstanding gaps stay on the cockpit.
- **Scheduling** — rooms and tracks; conflict checks serialised per event; calendar invites that land as real Gmail RSVP prompts (`.ics` `METHOD:REQUEST`); bulk publish/unpublish; content approval during publish where configured. Sessionboard session CSVs import with their column names aliased.
- **Public surfaces** — schedule (defaults to today / next session day), speakers, session pages, iframe embed, headshot and `.ics` for published sessions.
- **Exports and integrations** — CSV and XLSX for submissions, zip of CFP uploads, deliverables zip for speaker files; **Airtable mirror mode** (manual one-way push + optional nightly cron; never Airtable→D1); optional one-way Accelevents push; keyed `/api/v1` for submissions, schedule, and speakers (OpenAPI at `/api/v1/openapi.json`, framed against Sessionboard’s public docs without claiming drop-in parity).

## Day-to-day use

**Organiser.** Sign in (magic link) → create or open an event → finish setup (dates, rooms, tracks, tasks) → build the form → open the CFP → assign reviewers → decide on the submission detail pages → clear the to-notify queue when you are ready to email → clear blockers on the cockpit → chase speakers → place sessions → publish. Owners and admins also get mail when a submission is created or updated (not on every draft save).

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
| `PUBLIC_API_KEY` | Protects `/api/v1` (name is historical — treat as a secret). |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Optional until you send real mail. |
| `AIRTABLE_*` | Optional Airtable mirror mode: one-way D1→Airtable push (manual or nightly opt-in). Never reverse sync. |
| Accelevents | Configured per event under **Integrations** (one-way push; D1 stays source of record). |

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

`/api/v1` is a small, read-only operator API. Authenticate with `Authorization: Bearer <PUBLIC_API_KEY>` or `x-api-key`. Responses can include emails — keep them out of logs.

| Docs | URL |
| --- | --- |
| OpenAPI (this project) | [`/api/v1/openapi.json`](https://conference-engine.65labs.org/api/v1/openapi.json) (no key) |
| Sessionboard public API docs | [apidocs.sessionboard.com](https://apidocs.sessionboard.com/api-reference/overview) |

**Compatibility.** Same operator job as Sessionboard’s keyed programme reads (submissions / sessions / speakers for an event). Not a drop-in: paths are `/api/v1/events/{eventSlug}/...`, auth is Bearer or `x-api-key` (not Sessionboard’s `x-access-token`), and JSON shapes are conference-engine’s own. Point tooling at OpenAPI; do not reuse a Sessionboard client unchanged.

| Endpoint | Returns |
| --- | --- |
| `GET /api/v1/events/{eventSlug}/submissions` | Submission and speaker records |
| `GET /api/v1/events/{eventSlug}/schedule` | Published schedule slots |
| `GET /api/v1/events/{eventSlug}/speakers` | Roster, task status, uploaded-resource metadata (no file bytes, R2 keys, or private logistics notes) |

Public, no-key routes under `/api/e/[eventSlug]/...` serve published schedule JSON, headshots, and session `.ics`.

```bash
curl -sS http://127.0.0.1:8787/api/v1/events/aie-sandbox/speakers \
  -H "Authorization: Bearer $PUBLIC_API_KEY"
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

## License

[MIT](./LICENSE)
