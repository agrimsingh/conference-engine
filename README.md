# conference-engine

conference-engine runs the programme side of a conference: a call for proposals (CFP), review, decisions, speaker preparation, scheduling, and a published agenda. It is an open-source alternative to the programme module of tools such as Sessionboard, shaped around the work an organiser must complete before doors open.

It does not try to be an attendee CRM, ticketing system, payments product, marketing platform, website CMS, or bidirectional Airtable integration. D1 is the source of record; CSV, the authenticated operator API, and the optional Airtable push are ways to use that record elsewhere without creating a second one.

The domain flow is:

```text
Event -> CFP form -> Submission -> Evaluation -> Decision -> Speaker tasks -> Agenda slot -> Published schedule
```

An accepted proposal becomes a session. A scheduled session is still organiser-only; attendees and embeds see it only after it is published.

## Run it in five minutes

Use Node.js 22, then create a local-only environment file and seed D1:

```bash
npm ci
cp .dev.vars.example .dev.vars
# Change APP_ORIGIN in .dev.vars to http://127.0.0.1:8787 for npm run preview.
npm run db:reset:local
npm run preview
```

Set `AUTH_SECRET` in `.dev.vars` before using any authentication flow. `npm run db:reset:local` destroys the existing local D1 database, applies every migration, creates the writable `aie-sandbox` fixture, and adds the separate read-only `/demo` fixture. It is for a disposable local fixture only; export any local data you care about before running it.

`npm run preview` builds the OpenNext Worker and starts it with local D1, R2, KV, and Durable Object bindings, so it is the best local smoke environment. `npm run dev` is faster for normal UI work, but it does not reproduce the whole Cloudflare runtime and the outstanding-work dashboard will use its polling fallback when a Durable Object WebSocket is unavailable.

With `NEXTJS_ENV=development` or `ADMIN_BYPASS_ENABLED=1`, visit `/admin/bypass` once to set a local organiser-bypass cookie. Production keeps that setting at `0`; the cookie is otherwise useless.

Start with these routes:

| Purpose | Local route |
| --- | --- |
| Writable CFP fixture | `/e/aie-sandbox/submit/cfp` |
| Form builder | `/admin/events/aie-sandbox/forms` |
| Review and decisions | `/admin/events/aie-sandbox/submissions` |
| Schedule editor | `/admin/events/aie-sandbox/schedule` |
| Live outstanding-work dashboard | `/admin/events/aie-sandbox/dashboard` |
| Speaker portal | `/portal` |
| Public schedule | `/e/aie-sandbox/schedule` |
| Public speakers | `/e/aie-sandbox/speakers` |
| Iframe-friendly schedule | `/embed/aie-sandbox/schedule` |
| Read-only product demo | `/demo` |

## Demo versus a real event

`aie-sandbox` is a local working fixture. It exists so a contributor can submit, review, accept, schedule, and publish without manufacturing an event first. It can be claimed once in local development because it is deliberately marked as an ownership-claimable legacy fixture.

`/demo` is different. It reads the additive `demo-cfp-to-stage` D1 fixture and blocks all event mutations, including CFP, schedule, portal, and organiser writes. That makes it suitable for a public demonstration without turning sample data into an accidental shared workspace. The demo seed is intentionally separate from the writable local fixture so a remote deploy can add the demo without resetting a real event.

Create a real event from `/admin` after signing in, then use its setup, settings, forms, and team pages. A real event is owned immediately by the organiser who creates it and its data should never be replaced with either seed script.

## What is in the product

Organisers can create events, manage an event-scoped team, configure the event day, rooms, tracks, speaker tasks, and forms, then open or close a CFP. The form builder stores fields in D1, including required rules, conditional visibility, section groupings, CFP file uploads, speaker limits, draft/resume behaviour, submission limits, and category-to-track routing. Those choices are applied at submission time; no seed-SQL edit is needed to change a real CFP.

Reviewers receive tokenised links; an optional stored email can deliver the invite, otherwise the organiser copies the link. They see only their assigned submissions. Evaluation plans support named reviewers, reusable criteria, per-criterion scores and comments, and accept, waitlist, or reject decisions. The review board fails closed: a reviewer with no assignments receives an empty board rather than the full pool.

After acceptance, the portal lets speakers update a bio, complete required tasks, and upload headshots, slides, and supporting files. Co-speakers receive a separate confirmation link. Organisers can schedule sessions using rooms and tracks; a per-event Durable Object serialises schedule changes and rejects room or speaker conflicts before a conflicting agenda slot is written. Scheduling can generate an `.ics` invitation, and a daily Worker cron groups incomplete task reminders by person and event.

The latest lifecycle work is present in the current code paths: category routing for CFPs, durable rubric scores and reviewer revocation, event-level message templates and delivery history, a session workbench for manual or invited sessions, CSV preview/import, clone lineage, media URLs, bulk publish/unpublish, optional reviewer invite email (`0022`), per-event Airtable sync opt-in (`0023`), form sections and CFP upload assets (`0024`), a public speaker directory, and unauthenticated schedule/headshot/ICS endpoints. Migrations `0017` through `0024` must be applied before deploying code that depends on those paths.

## Runtime and data boundaries

The app is a Next.js App Router application bundled by OpenNext into a Cloudflare Worker.

| Binding or service | Holds | Why it is separate |
| --- | --- | --- |
| D1 (`DB`) | Events, forms, submissions, people, review state, ownership, invites, tasks, agenda slots, delivery records, and rate-limit state | It is the relational, searchable source of record and provides the atomic state needed for decisions and limits. |
| R2 (`FILES`) | Headshots, slides, and supporting documents | D1 stores the asset metadata and pointer, while large file bytes stay out of the database. |
| KV (`SESSIONS`) | Organiser and speaker session records | Sessions tolerate KV's consistency model; one-time challenges and authoritative rate limits stay in D1 instead. |
| Durable Object (`EVENT_ROOM`) | Per-event schedule queue and WebSocket invalidations | It prevents two schedule writes from checking the same free slot at once, then fans out updates to organiser dashboards. |
| Resend | Transactional mail and `.ics` attachments | Provider delivery is recorded with idempotency keys so a retry does not silently create a second message. |

The Worker also uses `ASSETS`, `IMAGES`, and `WORKER_SELF_REFERENCE` bindings declared in `wrangler.jsonc`. A fork must change the Worker name, self-service target, resource IDs/names, and route rather than pointing at this project's production resources.

## Environment and secrets

Copy `.dev.vars.example`; it lists every application environment key used for local development. Keep values out of Git, screenshots, and issue comments.

| Key | Local default or required value | Production treatment |
| --- | --- | --- |
| `NEXTJS_ENV` | `development` | Runtime mode; not required as a production secret. |
| `ADMIN_BYPASS_ENABLED` | `1` only for local bypass | Set `0`; do not enable the bypass on a public Worker. |
| `AUTH_SECRET` | Required, strong random value | Wrangler secret. It protects HMAC-derived state such as login challenges and limits. |
| `APP_ORIGIN` | Exact local origin: `http://127.0.0.1:8787` for `npm run preview` | Non-secret Wrangler variable, an absolute `https://` origin without a path. It is used in emailed links. |
| `RESEND_FROM_EMAIL` | Sender address | Non-secret Wrangler variable for a verified sender domain. |
| `RESEND_API_KEY` | Leave empty unless sending real mail | Wrangler secret. |
| `PUBLIC_API_KEY` | Required to call `/api/v1` | Wrangler secret, despite the historical name; it grants access to submission contact data. |
| `AIRTABLE_API_KEY` | Optional | Wrangler secret, only for the one-way export. |
| `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE_NAME` | Optional | Non-secret Wrangler variables paired with the Airtable key. |
| `APP_NAME` | Optional display/configuration value | Non-secret Wrangler variable. |

Set secrets interactively rather than putting them in configuration:

```bash
npx wrangler secret put AUTH_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put PUBLIC_API_KEY
# Only when Airtable export is intentionally enabled:
npx wrangler secret put AIRTABLE_API_KEY
```

Email links will point to the wrong place if `APP_ORIGIN` is stale. Reminder links are disabled when it is invalid rather than falling back to a hard-coded domain.

## Migrations and seed safety

Every D1 schema change lives under `migrations/` and should be applied in order. Local reset applies those migrations and then runs two distinct seed paths:

- `scripts/seed.sql` creates the writable `aie-sandbox` fixture. It must never run against a remote or real-event database because it is a local reset fixture.
- `scripts/seed-demo.sql` is additive, idempotent, and collision-safe. Its joins require the exact reserved demo event and parent rows, so it will not attach demo children to an unrelated event. It is the only seed intended for deliberate remote demo provisioning.

For a new disposable local database, use `npm run db:reset:local`; it destroys any existing local D1 data. To add only the read-only fixture, use `npm run db:seed:demo:local`; to add it to the configured remote D1 database after migrations, use `npm run db:seed:demo:remote`.

Before migrating an existing production database, inspect legacy ownership and then fail closed if a migration leaves an event without an authorised owner:

```bash
npx wrangler d1 execute conference-engine --remote \
  --file=scripts/preflight-legacy-ownership.sql
npx wrangler d1 migrations apply conference-engine --remote
npx wrangler d1 execute conference-engine --remote \
  --file=scripts/preflight-production.sql
```

The preflight intentionally stops for duplicate owners or unexpected ownerless events. Resolve those records explicitly; do not weaken the check or use a seed file to paper over production data.

## Deploy to Cloudflare

Provision the bindings in `wrangler.jsonc` before deployment: D1 `DB`, R2 `FILES`, KV `SESSIONS`, Durable Object `EVENT_ROOM`, assets/image bindings, and the Worker self-reference. Verify the custom domain and the Resend sender domain before expecting authentication or reminders to arrive.

Deploy in this order. Remote D1 migrations must finish before the Worker deploy; a build that reads a column D1 does not have will fail at runtime. A remote demo seed should not run until the guarded Worker is live:

1. **Back up D1 and R2.** Export the remote D1 database and take an R2 object backup before changing production state. This preserves a recoverable record before an additive migration or data repair.
2. **Inspect legacy ownership.** Run `scripts/preflight-legacy-ownership.sql` against remote D1 and resolve any duplicate or ownerless records it reports before the migration changes ownership storage.
3. **Apply the migrations.** Run `npx wrangler d1 migrations apply conference-engine --remote`, including `0017` through `0024` when the deployed code needs their lifecycle paths. Do not deploy the Worker until this step succeeds.
4. **Run the post-0012 fail-closed preflight.** Execute `scripts/preflight-production.sql` after migration. It intentionally aborts when an event would have no authorised owner, so a failed check is a data-repair task rather than a deploy override.
5. **Build and dry-run.** `npx opennextjs-cloudflare build` generates the artefact; `npx wrangler deploy --dry-run` checks the configured Worker and bindings without uploading it.
6. **Deploy the guarded Worker.** Run `npm run deploy`, which rebuilds and deploys through OpenNext with production bypass disabled and the migration-backed ownership and demo-write guards in place.
7. **Optionally add the read-only demo.** Run `npm run db:seed:demo:remote` only after the Worker is deployed. It is additive and leaves live events untouched.
8. **Check visible behaviour.** Visit the home page, submit or load a CFP, request organiser sign-in, view a published schedule and embed, and call one authenticated API endpoint. A successful Git push proves none of these things.

For a fork, do this under a distinct Worker name and Cloudflare account. Do not copy the checked-in production identifiers or route to another project.

## Role workflows

**Organiser.** Sign in at `/login`, create or select an event from `/admin`, then use `/admin/events/[eventSlug]/setup` to finish dates, rooms, tracks, tasks, and CFP readiness. Build the form at `/forms`, activate the review plan from `/submissions`, assign reviewers, make decisions, track incomplete speaker work on `/dashboard` or `/tasks`, schedule in `/schedule`, and publish selected placed sessions in `/sessions`. Owners invite admins at `/team`, transfer ownership when handing over an event, and cannot leave until another owner exists.

**Reviewer.** Open the tokenised `/review?token=...` link, score assigned proposals against the plan's criteria, and leave comments. The token is scoped to assignments; it is not an organiser login.

**Speaker or submitter.** Submit at `/e/[eventSlug]/submit/[formSlug]`. When drafts are enabled, a resume link is sent by email; saving rotates the bearer token and finalising is safe against duplicate concurrent submissions. After acceptance, use `/portal` to receive a magic link, update the event-scoped profile, and complete task uploads. Co-speakers confirm through `/co-speaker/[token]`.

**Attendee or embed consumer.** Read only published sessions at `/e/[eventSlug]/schedule`, the speaker directory at `/e/[eventSlug]/speakers`, individual public session pages at `/e/[eventSlug]/sessions/[sessionId]`, or the app-chrome-free embed at `/embed/[eventSlug]/schedule`. Headshots and per-session `.ics` downloads are at `/api/e/[eventSlug]/people/[personId]/headshot` and `/api/e/[eventSlug]/sessions/[sessionId]/ics` for confirmed speakers on published sessions only. The `/demo` route is another public read-only view of the seeded example, not an editable event.

## API and exports

`/api/v1` is an operator API protected by `PUBLIC_API_KEY`; it is not public despite the variable name. Send `Authorization: Bearer <key>` or `x-api-key: <key>` and protect downstream logs because submissions include email addresses.

| Method | Endpoint | Response scope |
| --- | --- | --- |
| `GET` | `/api/v1/events/[eventSlug]/submissions` | Event submissions, labels, submitter details, and non-removed speakers. |
| `GET` | `/api/v1/events/[eventSlug]/schedule` | Event rooms and published agenda slots with confirmed speakers and safe public media URLs. |
| `GET` | `/api/admin/events/[eventSlug]/export/submissions.csv` | Current D1 submission records, for an authorised organiser. |
| `POST` | `/api/admin/events/[eventSlug]/export/airtable` | Optional one-way Airtable upsert keyed by the submission ID, for an authorised organiser. |
| `GET` | `/api/e/[eventSlug]/schedule` | Published agenda JSON; no submitter email or raw answers. |
| `GET` | `/api/e/[eventSlug]/people/[personId]/headshot` | Headshot bytes for a confirmed speaker on a published session. |
| `GET` | `/api/e/[eventSlug]/sessions/[sessionId]/ics` | PUBLISH `.ics` attachment without attendee PII. |

The three `/api/e/...` routes are public and need no API key. For example:

```bash
curl -sS http://localhost:8787/api/v1/events/aie-sandbox/schedule \
  -H "Authorization: Bearer $PUBLIC_API_KEY"
```

The Airtable endpoint requires all three Airtable settings. Per-event opt-in (`0023`) gates the nightly cron push; manual export still works without it. D1 pushes outward and never reads Airtable back, so a failed or changed Airtable base cannot overwrite the programme database. CSV stays available when Airtable is not configured.

## Test and verify changes

Run the fast checks before handing off a change:

```bash
npm test
npx tsc --noEmit
npm run lint
npx opennextjs-cloudflare build
npx wrangler deploy --dry-run
```

`npm test` runs both `test:unit` and `test:workers`. The unit suite exercises domain rules, form validation and draft semantics, ownership, email helpers, session data, and schedule time handling. The Worker suite applies every migration to an isolated Cloudflare runtime and covers real bindings and failure paths: demo immutability, ownership guards, rate limits, draft-finalisation contention, R2 compensation after a failed D1 update, WebSocket ticket consumption, cross-event rejection, and concurrent schedule conflicts through `EventRoom`.

Tests are necessary but not a release proof. In `npm run preview`, complete at least one visible path that touches the change: submit a CFP, make a reviewer decision, complete a portal task, place and publish a session, or load the public and embedded schedule. For any production change, repeat the matching route after deployment and verify an authenticated API request as well.

## Production safety, backup, and rollback

Keep `ADMIN_BYPASS_ENABLED=0`, rotate `AUTH_SECRET`, `RESEND_API_KEY`, and `PUBLIC_API_KEY` through Wrangler if they are exposed, and never put sensitive request payloads or bearer links in logs. Event membership and ownership checks gate organiser APIs; reviewer links and portal links must be treated as credentials.

Take a D1 export before every production migration and store it outside the deployment checkout with the same access controls as the database. The installed Wrangler supports:

```bash
npx wrangler d1 export conference-engine --remote --output=conference-engine-before-migration.sql
```

Back up the R2 objects alongside the D1 export, then practise restoring the pair into a separate Cloudflare account or database before relying on the procedure. D1 schema migrations are additive here, but rolling back Worker code does not remove a migrated column or recreate a deleted row.

If a Worker release is bad, use the known-good Cloudflare Worker version with `npx wrangler rollback <version-id> --name conference-engine`. Roll back the Worker first to stop new incompatible writes, inspect the D1 rows and migration state, then make a forward corrective migration if data needs repair. Do not restore or reseed production simply to reverse an application deploy.

## Repository map

```text
migrations/                 D1 schema and additive lifecycle changes
scripts/                    local fixtures, remote demo fixture, and ownership preflights
src/app/                    public, portal, review, admin, and API routes
src/durable-objects/        EventRoom schedule serialisation and WebSocket runtime
src/lib/cfp/                form loading, validation, drafts, and submission delivery
src/lib/evaluation/         reviewers, assignments, criteria, and score handling
src/lib/events/             event creation, settings, ownership, and membership
src/lib/sessions/           manual, imported, and cloned session handling
src/lib/speakers/           decisions, portal access, tasks, and upload completion
test/workers/               isolated Cloudflare integration tests
worker.ts                   OpenNext wrapper plus daily reminder/rate-limit cron
wrangler.jsonc              production binding declaration
wrangler.vitest.jsonc       isolated test binding declaration
```

## License

Released under the [MIT License](./LICENSE).
