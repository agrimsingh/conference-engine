# conference-engine

Run a conference programme without renting a $40k suite.

**conference-engine** covers the path from call for proposals to a published schedule: CFP → review → decisions → speaker prep → rooms and tracks → publish. It is an open-source alternative to the *program* side of tools like Sessionboard or Sessionize, built to feel fast for organisers under time pressure.

Live demo (read-only): [conference-engine.65labs.org/demo](https://conference-engine.65labs.org/demo)

```text
Event → CFP → Submission → Review → Decision → Speaker tasks → Agenda slot → Published schedule
```

An accepted proposal becomes a session. Attendees only see sessions you publish.

## Who it is for

- **Organisers** who need intake, review, speaker chasing, and a public agenda — not another CRM.
- **Reviewers** who score assigned talks through a link (no full admin login).
- **Speakers** who submit, then finish bio / headshot / slides in a magic-link portal.
- **Attendees** (and embeds) who read the published schedule.

It deliberately does **not** do ticketing, payments, marketing, or a second system of record in Airtable. [D1](https://developers.cloudflare.com/d1/) is the source of truth; CSV, a keyed API, and an optional one-way Airtable push are exits, not forks of the truth.

## Why it exists

Sessionboard-shaped products often bundle programme + CRM + marketing and move slowly. This project ships only the programme job, on your own Cloudflare account, with a realtime “who is blocking the schedule?” dashboard and a form builder that lives in the database (no seed-SQL edits to change a CFP).

More product context: [PRODUCT.md](./PRODUCT.md).

## Try it in five minutes

Needs **Node.js 22** and a Cloudflare-oriented local setup.

```bash
npm ci
cp .dev.vars.example .dev.vars
# Set AUTH_SECRET (required for auth).
# For `npm run preview`, set APP_ORIGIN=http://127.0.0.1:8787
npm run db:reset:local
npm run preview
```

`npm run db:reset:local` **wipes local D1**, applies migrations, and seeds fixtures. Export anything you care about first.

| What | Local URL |
| --- | --- |
| Writable CFP sandbox | `/e/aie-sandbox/submit/cfp` |
| Form builder | `/admin/events/aie-sandbox/forms` |
| Review and decisions | `/admin/events/aie-sandbox/submissions` |
| Schedule editor | `/admin/events/aie-sandbox/schedule` |
| Outstanding-work dashboard | `/admin/events/aie-sandbox/dashboard` |
| Speaker portal | `/portal` |
| Public schedule | `/e/aie-sandbox/schedule` |
| Public speakers | `/e/aie-sandbox/speakers` |
| Embeddable schedule | `/embed/aie-sandbox/schedule` |
| Read-only product demo | `/demo` |

With `NEXTJS_ENV=development` or `ADMIN_BYPASS_ENABLED=1`, open `/admin/bypass` once for a local organiser cookie. Keep bypass **off** in production.

**`npm run preview`** builds the OpenNext Worker with local D1, R2, KV, and Durable Objects — best smoke environment. **`npm run dev`** is faster for UI work but does not match the full Cloudflare runtime (the dashboard falls back to polling if the WebSocket is unavailable).

### Sandbox vs `/demo` vs a real event

| | Purpose |
| --- | --- |
| **`aie-sandbox`** | Writable local fixture. Submit → review → schedule → publish without creating an event first. |
| **`/demo`** | Read-only seeded walkthrough. Safe to show publicly; mutations are blocked. |
| **Real event** | Create from `/admin` after sign-in. Owned by you; never replace with seed scripts. |

## What you get

- **CFP form builder** — fields, required rules, conditionals, sections, uploads, draft/resume, limits, category → track routing.
- **Review** — named reviewers, criteria, scores/comments, accept / waitlist / reject. Empty assignment list means empty board (fail closed).
- **Speaker portal** — bio, tasks, headshots/slides; co-speaker confirm links; reminders via daily cron.
- **Scheduling** — rooms and tracks; conflict checks serialised per event; `.ics` invites; bulk publish/unpublish.
- **Public surfaces** — schedule, speakers, session pages, iframe embed, headshot and `.ics` for published sessions.
- **Exports** — organiser CSV; optional one-way Airtable upsert; keyed `/api/v1` for submissions and schedule.

## Day-to-day use

**Organiser.** Sign in at `/login` → create or open an event in `/admin` → finish setup (dates, rooms, tracks, tasks) → build the form → open the CFP → assign reviewers → decide → chase tasks on the dashboard → place sessions → publish.

**Reviewer.** Open the emailed or copied `/review?token=...` link. Score only what you were assigned.

**Speaker.** Submit at `/e/[eventSlug]/submit/[formSlug]`. After acceptance, use `/portal` for the magic link and uploads. Co-speakers confirm at `/co-speaker/[token]`.

**Public / embed.** Published sessions only: `/e/[eventSlug]/schedule`, `/speakers`, `/embed/[eventSlug]/schedule`.

## Configure locally

Copy [`.dev.vars.example`](./.dev.vars.example). Keep secrets out of git.

| Key | Notes |
| --- | --- |
| `AUTH_SECRET` | Required. Strong random value (HMAC / login challenges). |
| `APP_ORIGIN` | Exact public origin for email links (`http://127.0.0.1:8787` for preview). |
| `ADMIN_BYPASS_ENABLED` | `1` local only; `0` in production. |
| `PUBLIC_API_KEY` | Protects `/api/v1` (name is historical — treat as a secret). |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Optional until you send real mail. |
| `AIRTABLE_*` | Optional one-way export only. |

```bash
npx wrangler secret put AUTH_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put PUBLIC_API_KEY
```

## Deploy (sketch)

Stack: Next.js App Router → OpenNext → Cloudflare Worker, with D1, R2, KV, and a per-event Durable Object for schedule writes.

1. Create D1 / R2 / KV (and DO) resources in *your* Cloudflare account — do not reuse this project’s production IDs.
2. Point `wrangler.jsonc` at those resources; set `APP_ORIGIN` and Resend from-address as vars.
3. Put secrets with `wrangler secret put`.
4. Apply D1 migrations in order (`migrations/`), then `npm run deploy`.
5. Optionally `npm run db:seed:demo:remote` for a read-only `/demo` (additive; leaves live events alone).

Before production migrations, export D1 (and back up R2). Details and rollback notes live in the longer ops history if you need them; the rule of thumb is: roll back the Worker first, then repair data with a forward migration — do not reseed production to undo a bad release.

## API (short)

`/api/v1` needs `Authorization: Bearer <PUBLIC_API_KEY>` or `x-api-key`. It returns submission and schedule data for operators — protect logs (emails included).

Public (no key): published schedule JSON, headshots, and session `.ics` under `/api/e/[eventSlug]/...`.

```bash
curl -sS http://127.0.0.1:8787/api/v1/events/aie-sandbox/schedule \
  -H "Authorization: Bearer $PUBLIC_API_KEY"
```

## Develop and test

```bash
npm test                 # unit + Worker integration tests
npx tsc --noEmit
npm run lint
npx opennextjs-cloudflare build
```

After a behaviour change, click through one real path in `npm run preview` (submit, decide, portal task, or publish).

## Repo map

| Path | Holds |
| --- | --- |
| `migrations/` | D1 schema |
| `scripts/` | local + demo seeds, preflights |
| `src/app/` | public, portal, review, admin, API |
| `src/lib/` | CFP, evaluation, events, sessions, speakers |
| `src/durable-objects/` | schedule serialisation + live updates |
| `PRODUCT.md` / `DESIGN.md` / `DECISIONS.md` | product, design, decision log |

## License

[MIT](./LICENSE)
