# conference-engine

Open-source **program** tool for conferences: call-for-papers → review → accept → speaker onboarding → schedule → calendar.

Built as a Sessionboard Program alternative for the AI Engineer hackathon. Job-to-be-done over pixel clone. Fast on Cloudflare.

## Status

| Requirement | State |
|---|---|
| 1. Conditional CFP forms + category routing | ✅ Live (format→category at submit, `closes_at` enforced) |
| 2. Speaker portal (bio, headshot, slides, docs) | ✅ Live (magic-link sign-in) |
| 3. Templated email + calendar ICS | ✅ Live (Resend `team@65labs.org`, daily reminder cron + admin trigger) |
| 4. Evaluation / scoring workflows | ✅ Live (named reviewers, per-reviewer upsert) |
| 5. DnD schedule + conflict detection | ✅ Live (views: list/day/week/track/room) |
| 6. Realtime outstanding-tasks dashboard | ✅ Live (EventRoom WS + poll fallback) |
| Deploy `conference-engine.65labs.org` | ✅ Live |

**Prod:** https://conference-engine.65labs.org · repo https://github.com/agrimsingh/conference-engine

## Stack

- **Next.js** (App Router) via **OpenNext** on **Cloudflare Workers**
- **D1** system of record
- **R2** file uploads
- **KV** sessions
- **Durable Object** `EventRoom` (hibernatable WebSockets for live admin)
- **Resend** transactional email + `.ics` attachments

## Quick start

```bash
npm install
cp .dev.vars.example .dev.vars   # fill RESEND_API_KEY, AUTH_SECRET, PUBLIC_API_KEY
npm run db:reset:local           # migrate + seed aie-sandbox
npm run dev                      # http://localhost:3000
```

### Seeded demo

- Public CFP: `/e/aie-sandbox/submit/cfp`
- Public schedule: `/e/aie-sandbox/schedule` (list/day; shows `scheduled` + `published`)
- Admin bypass (local): `/admin/bypass` → `/admin/events/aie-sandbox/submissions`
- Admin schedule (DnD): `/admin/events/aie-sandbox/schedule`
- Outstanding tasks (live): `/admin/events/aie-sandbox/dashboard`
- Speaker portal: `/portal` (email + KV token)
- Admin tasks (static): `/admin/events/aie-sandbox/tasks`
- Review board: activate plan from submissions admin, then `/review?token=…` (or `/review?event=aie-sandbox` with bypass)
- Seeded rooms: Main Stage, Room B, Workshop Lab

### Live dashboard transport

- Production / Workers preview: WebSocket to `EventRoom` via `/api/admin/events/[slug]/room`. Badge shows `broadcasted`.
- Plain `next dev`: DO upgrade is often awkward; UI falls back to **2s poll** of `/api/admin/events/[slug]/tasks/outstanding`. Badge shows `polling`.
- Task complete, upload, accept, and schedule mutate call `broadcastEventInvalidate` and return `broadcasted: boolean`.

### Public API (API key)

Set `PUBLIC_API_KEY` in `.dev.vars` (local) or as a Wrangler secret (prod).

Auth: `Authorization: Bearer <key>` **or** `x-api-key: <key>`.

```bash
# Submissions
curl -sS http://localhost:3000/api/v1/events/aie-sandbox/submissions \
  -H "Authorization: Bearer $PUBLIC_API_KEY"

# Schedule (public-visible slots only)
curl -sS http://localhost:3000/api/v1/events/aie-sandbox/schedule \
  -H "x-api-key: $PUBLIC_API_KEY"
```

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/v1/events/[eventSlug]/submissions` | Status, title, speakers |
| `GET` | `/api/v1/events/[eventSlug]/schedule` | Rooms + public slots |

Unauthorized requests return `401`. Missing secret returns `503`.

### API smoke

```bash
# 1) Submit a talk (sends thank-you via Resend; logs outbound_messages)
curl -sS -X POST http://localhost:3000/api/e/aie-sandbox/submit/cfp \
  -H 'content-type: application/json' \
  -d '{
    "submitterName": "Ada",
    "submitterEmail": "ada@example.com",
    "answers": {
      "format": "stage",
      "title": "Hello",
      "abstract": "Talk abstract",
      "duration_minutes": 30,
      "speakers": [{"name":"Ada","email":"ada@example.com"}]
    }
  }'

# 2) Admin bypass + activate evaluation plan
curl -sS -c /tmp/ce-admin.txt -b /tmp/ce-admin.txt \
  http://localhost:3000/admin/bypass
curl -sS -b /tmp/ce-admin.txt -X POST \
  http://localhost:3000/api/admin/events/aie-sandbox/evaluation/activate \
  -H 'content-type: application/json' \
  -d '{"name":"Default review"}'

# 3) Score via review token
curl -sS -X POST http://localhost:3000/api/review/score \
  -H 'content-type: application/json' \
  -d '{"token":"<TOKEN>","submissionId":"<SUBMISSION_ID>","score":4,"comment":"Solid"}'

# 4) Accept / reject (emails; idempotent on re-accept)
curl -sS -b /tmp/ce-admin.txt -X POST \
  http://localhost:3000/api/admin/events/aie-sandbox/submissions/<SUBMISSION_ID>/accept
# curl -sS -b /tmp/ce-admin.txt -X POST \
#   http://localhost:3000/api/admin/events/aie-sandbox/submissions/<SUBMISSION_ID>/reject

# 5) Schedule → agenda_slots + ICS calendar invite email
#    Hard conflicts: same room overlap OR same speaker double-book → 409, no write
curl -sS -b /tmp/ce-admin.txt -X POST \
  http://localhost:3000/api/admin/events/aie-sandbox/submissions/<SUBMISSION_ID>/schedule \
  -H 'content-type: application/json' \
  -d '{"startsAt":"2026-10-01T17:00:00.000Z","endsAt":"2026-10-01T17:30:00.000Z","roomName":"Main Stage"}'

# 6) Mint speaker portal token / complete tasks (unchanged)
curl -sS -X POST http://localhost:3000/api/portal/session \
  -H 'content-type: application/json' \
  -d '{"email":"ada@example.com"}'
```

## Deploy (`conference-engine.65labs.org`)

Custom domain is already in `wrangler.jsonc` (`routes` → `conference-engine.65labs.org`).

```bash
# 1) Secrets (do not commit values)
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put AUTH_SECRET
npx wrangler secret put PUBLIC_API_KEY

# 2) Remote D1 migrate + seed (first deploy / schema changes)
npx wrangler d1 migrations apply conference-engine --remote
npx wrangler d1 execute conference-engine --remote --file=scripts/seed.sql

# 3) Build + deploy (OpenNext)
npm run deploy

# 4) Smoke
curl -sS -o /dev/null -w '%{http_code}\n' https://conference-engine.65labs.org/
curl -sS https://conference-engine.65labs.org/api/v1/events/aie-sandbox/submissions \
  -H "Authorization: Bearer $PUBLIC_API_KEY"
```

Optional local production-shaped check (no deploy):

```bash
npx opennextjs-cloudflare build
# or: npm run preview   # build + wrangler preview
```

## Domain model (short)

Spine: `Event → CFPForm → Submission → Evaluation → Acceptance → SpeakerTask → AgendaSlot`.

A `Submission` *is* the session once accepted. Status transitions are enforced in `src/lib/domain/submission-status.ts`. Speaker onboarding task types live in `SPEAKER_TASK_TYPE_REGISTRY` (`bio`, `headshot`, `slides`); accept spawns `speaker_tasks` idempotently on `(submission_id, person_id, template_key)`. Form field types and visibility rules live in typed registries under `src/lib/domain/`.

Schedule conflicts are pure in `src/lib/domain/schedule.ts` (`detectConflicts`): room overlap and speaker double-book. Public schedule lists slots whose submission is `scheduled` or `published` (demo choice; document in `DECISIONS.md`).

Outstanding tasks are grouped by `(submissionId, personId)` in `src/lib/domain/outstanding-tasks.ts`. Live admin UI prefers EventRoom invalidate fanout, with poll fallback for local demo.

## License

MIT (pending). Hackathon submission code is yours to keep.
