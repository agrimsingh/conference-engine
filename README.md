# conference-engine

conference-engine is an open-source conference program system: collect proposals, review them, accept speakers, gather their materials, build the agenda, and publish the schedule.

It is the program-management slice of Sessionboard, built around the work an organizer must finish rather than the surrounding CRM, marketing, CMS, and payment products. The reference implementation runs on Cloudflare and is shaped for fast, high-volume event operations.

An existing deployment is reachable at [conference-engine.65labs.org](https://conference-engine.65labs.org). A push to `main` does not apply D1 migrations or deploy the Worker; use the release sequence below when promoting a commit.

## What the product covers

| Workflow | What is implemented |
|---|---|
| CFP intake | Database-backed form builder, conditional fields, category routing, opening and closing controls, required-field validation, speaker limits, submission caps, anonymous submission, and save-and-resume links delivered by email |
| Submitter portal | Every proposal tied to the verified email is visible before a decision; accepted talks expose editable bio, headshot, slides, and supporting-document tasks |
| Review | Evaluation plans, named reviewers, per-submission assignment, 1–5 scores, comments, and accept, waitlist, or reject decisions with editable email copy |
| Communications | Submission confirmations, co-speaker invitations, decision emails, daily task reminders, and `.ics` calendar invitations through Resend |
| Scheduling | Organizer list, day, week, track, and room views; drag, click, and keyboard placement; hard room and speaker conflict rejection; explicit publish and unpublish controls |
| Public agenda | Published sessions only, with list, day, week, track, and room views plus an iframe-friendly embed |
| Program operations | Realtime outstanding-task dashboard, polling fallback, owner/admin team membership, CSV export, optional one-way Airtable upsert, and a keyed operator API |

The speaker and reviewer surfaces use links that work without account setup. Organizers use email magic links and event-scoped membership in production; the all-events bypass exists only for local development.

## What it deliberately does not cover

The product is English-only and has no attendee CRM, ticket sales, payments, marketing automation, website CMS, or bidirectional Airtable sync. D1 remains the source of record. Airtable and the keyed API are exits for downstream operations, not parallel databases.

## Runtime architecture

The application is Next.js App Router bundled by OpenNext into a Cloudflare Worker.

| Component | Responsibility |
|---|---|
| D1 | Events, forms, submissions, people, review state, ownership, pending invites, one-time auth challenges, durable email deliveries, tasks, agenda slots, and atomic rate-limit buckets |
| R2 | Headshots, slides, and supporting documents; D1 stores the asset metadata and pointer |
| KV | Organizer and speaker session records; one-time login challenges and concurrency-sensitive limits stay in D1 |
| `EventRoom` Durable Object | Per-event schedule serialization, one-time WebSocket ticket consumption, and realtime invalidation fanout |
| Resend | Transactional messages and calendar attachments, with provider retries and idempotency keys |

The domain spine is `Event → CFPForm → Submission → Evaluation → Acceptance → SpeakerTask → AgendaSlot`.

A submission becomes the session after acceptance. `scheduled` remains private to organizers; only `published` appears on public and embedded agendas.

Several boundaries are intentionally stronger than a normal demo implementation:

- Event ownership has one canonical D1 relation. Claim, transfer, demotion, and leave operations preserve it, and migration preflight rejects ambiguous legacy data.
- Magic-link challenges and CFP abuse limits use atomic D1 state keyed by HMAC-derived identifiers. KV's eventual consistency is unsuitable for one-time consumption or an authoritative limit.
- Draft resume tokens are random, stored only as hashes, rotated after saves, and finalized with a deterministic submission ID. Concurrent finalizers cannot create two submissions or overrun a form's submission cap.
- Every schedule mutation enters one per-event Durable Object queue. Conflict reads and D1 writes cannot interleave with another mutation for that event.
- R2 upload completion compensates for a failed D1 write by deleting only the newly uploaded object and retaining any prior asset.
- One-shot delivery records make confirmation and co-speaker email repair safe when a client retries after the submission committed.

## Run it locally

Node.js 22 is the CI version.

```bash
npm ci
cp .dev.vars.example .dev.vars
```

Set a strong `AUTH_SECRET`, and set `APP_ORIGIN` to the exact public origin used in email links. Add `RESEND_API_KEY` only when you intend to send real mail, and set `PUBLIC_API_KEY` before exercising the operator API. Never commit `.dev.vars`.

Create the local D1 schema and the `aie-sandbox` demo event:

```bash
npm run db:reset:local
```

Run the production-shaped Cloudflare preview so requests use the same binding model as the deployed Worker:

```bash
npm run preview
```

The preview builds the OpenNext bundle and serves it with local D1, R2, KV, and Durable Object bindings. Plain `npm run dev` is useful for frontend work, but it does not reproduce the complete Cloudflare runtime and the realtime UI may fall back to polling.

With `NEXTJS_ENV=development` or `ADMIN_BYPASS_ENABLED=1`, open `/admin/bypass` once to set the local organizer-bypass cookie.

### Demo routes

- CFP: `/e/aie-sandbox/submit/cfp`
- Organizer submissions: `/admin/events/aie-sandbox/submissions`
- Form builder: `/admin/events/aie-sandbox/forms`
- Review: activate the evaluation plan from submissions, then open the generated `/review?token=…` link
- Speaker portal: `/portal`
- Schedule editor: `/admin/events/aie-sandbox/schedule`
- Outstanding work: `/admin/events/aie-sandbox/dashboard`
- Public agenda: `/e/aie-sandbox/schedule`
- Embed: `/embed/aie-sandbox/schedule`

The demo has Main Stage, Room B, and Workshop Lab. Its event dates are stored in D1; the schedule no longer relies on a hard-coded browser date.

## Verify a change

`npm test` runs both suites in sequence:

```bash
npm test
npx tsc --noEmit
npm run lint
npx opennextjs-cloudflare build
npx wrangler deploy --dry-run
```

The unit suite covers domain rules, form copy and validation, draft replay behavior, ownership, email helpers, and schedule time handling. The Cloudflare suite starts an isolated Worker runtime, applies every D1 migration, and exercises the real bindings. It proves:

- ownership constraints and fail-closed production preflight;
- concurrent atomic rate limiting;
- concurrent draft finalization at the submission limit;
- R2 cleanup after a D1 failure while an older object survives;
- simultaneous schedule conflicts through `EventRoom`;
- one-time ticket consumption and cross-event WebSocket rejection; and
- exclusion of local Resend, Airtable, and public API secrets from the test Worker.

The two suites can also run independently:

```bash
npm run test:unit
npm run test:workers
```

CI runs tests, TypeScript, and ESLint on pushes and pull requests to `main`.

## Authentication and permissions

### Organizers

`/login` requests an email magic link. The callback creates an organizer session, then event access is resolved through `event_memberships`. Owners can invite admins, transfer ownership, and leave only after another owner exists. The seeded `aie-sandbox` event may be claimed once when it has no owner; arbitrary ownerless legacy events are rejected by migration safeguards.

`/admin/bypass` is a local convenience. Production configuration keeps `ADMIN_BYPASS_ENABLED=0`, and a bypass cookie has no effect unless the environment also enables the bypass.

### Speakers

`/portal` sends a generic response whether or not an email is eligible, which avoids account enumeration. A valid portal session shows all proposals connected to that person. Onboarding tasks appear only for accepted, scheduled, or published talks, and task APIs recheck that the session person owns the task.

### Reviewers

Evaluation plans issue tokenized review links. Named reviewers see only assigned submissions; a reviewer with zero assignments gets an empty board rather than access to the whole pool. Organizers may use the same board to make decisions when their organizer session is present.

## Email and reminders

Set the sender as a non-secret Wrangler variable and the provider key as a secret:

```bash
npx wrangler secret put RESEND_API_KEY
```

Forms can override welcome, confirmation, and reminder copy with `{{event_name}}`, `{{submitter_name}}`, `{{title}}`, and `{{resume_url}}`. The resume URL is appended even if custom text omits the placeholder, so an edited template cannot produce an unusable draft email.

The Worker cron runs daily at 01:00 UTC. It groups pending tasks by person and event, suppresses duplicate reminders within the reminder window, and links back to the portal. Scheduling creates a stable calendar UID and sends an `.ics` attachment.

## Operator API and exports

The `/api/v1` routes are protected by `PUBLIC_API_KEY`. Despite the historical variable name, this is an operator credential and the responses contain submitter and speaker contact details. Treat it as a secret.

Authentication accepts either `Authorization: Bearer <key>` or `x-api-key: <key>`.

| Method | Path | Contents |
|---|---|---|
| `GET` | `/api/v1/events/[eventSlug]/submissions` | Submission status, labels, submitter, and speaker records |
| `GET` | `/api/v1/events/[eventSlug]/schedule` | Rooms and published agenda slots |

```bash
curl -sS http://localhost:8787/api/v1/events/aie-sandbox/schedule \
  -H "Authorization: Bearer $PUBLIC_API_KEY"
```

Organizer exports live on the submissions page:

- `GET /api/admin/events/[eventSlug]/export/submissions.csv` downloads the current D1 records.
- `POST /api/admin/events/[eventSlug]/export/airtable` performs a one-way Airtable upsert on the `id` field. It requires `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, and `AIRTABLE_TABLE_NAME`.

Airtable is never read back into D1.

## Deploy on Cloudflare

Create or update the resources referenced by `wrangler.jsonc`: `DB`, `FILES`, `SESSIONS`, `EVENT_ROOM`, and the Worker self-service binding. Set a unique Worker name, service binding, and route when deploying a fork.

Configure secrets without putting values in the repository:

```bash
npx wrangler secret put AUTH_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put PUBLIC_API_KEY
# Optional:
# npx wrangler secret put AIRTABLE_API_KEY
```

`APP_ORIGIN` is a non-secret Wrangler variable and must be an absolute `https://` (or local `http://`) origin without a path. Reminder links are disabled when it is invalid rather than falling back to a hard-coded domain.

For an existing database, inspect legacy ownership before applying migrations:

```bash
npx wrangler d1 execute conference-engine --remote \
  --file=scripts/preflight-legacy-ownership.sql
npx wrangler d1 migrations apply conference-engine --remote
npx wrangler d1 execute conference-engine --remote \
  --file=scripts/preflight-production.sql
```

The migration is additive, but the ownership guards intentionally stop on duplicate owners or unexpected ownerless events. Resolve those records deliberately instead of weakening the migration. `scripts/seed.sql` is demo data; do not run it against a real event database.

Build the OpenNext artifact, inspect the bindings without changing remote state, and then deploy that artifact:

```bash
npx opennextjs-cloudflare build
npx wrangler deploy --dry-run
npm run deploy
```

After deployment, verify the home page, CFP, organizer sign-in, a published schedule, and an authenticated operator-API request. A successful Git push is not evidence that the D1 migration or Worker deployment happened.

## Repository map

```text
migrations/                 D1 schema and production guards
scripts/                    seed and preflight SQL
src/app/                    public, portal, review, admin, and API routes
src/durable-objects/        EventRoom schedule and WebSocket runtime
src/lib/cfp/                form loading, validation, drafts, and delivery repair
src/lib/domain/             state transitions and pure program rules
src/lib/realtime/           shared Worker WebSocket authorization boundary
src/lib/speakers/           decisions, onboarding, portal, and upload completion
test/workers/               isolated Cloudflare integration tests
worker.ts                   OpenNext Worker wrapper and daily reminder trigger
wrangler.jsonc              production Cloudflare bindings
wrangler.vitest.jsonc       isolated, no-production-resource test bindings
```

## License

Released under the [MIT License](./LICENSE).
