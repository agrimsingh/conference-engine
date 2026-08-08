# conference-engine

Open-source **program** tool for conferences: call-for-papers → review → accept → speaker onboarding → schedule → calendar.

Built as a Sessionboard Program alternative for the AI Engineer hackathon. Job-to-be-done over pixel clone. Fast on Cloudflare.

## Status

| Requirement | State |
|---|---|
| 1. Conditional CFP forms + category routing | ✅ Local (AIE preset) |
| 2. Speaker portal (bio, headshot, slides, docs) | ✅ Local (accept → tasks → R2) |
| 3. Templated email + calendar ICS | ✅ Local Resend+ICS |
| 4. Evaluation / scoring workflows | ✅ Local basic scoring |
| 5. DnD schedule + conflict detection | 🚧 |
| 6. Realtime outstanding-tasks dashboard | 🚧 |
| Deploy `conference-engine.65labs.org` | 🚧 |

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
cp .dev.vars.example .dev.vars   # fill RESEND_API_KEY, AUTH_SECRET
npm run db:reset:local           # migrate + seed aie-sandbox
npm run dev                      # http://localhost:3000
```

### Seeded demo

- Public CFP: `/e/aie-sandbox/submit/cfp`
- Admin bypass (local): `/admin/bypass` → `/admin/events/aie-sandbox/submissions`
- Speaker portal: `/portal` (email + KV token)
- Admin tasks: `/admin/events/aie-sandbox/tasks`
- Review board: activate plan from submissions admin, then `/review?token=…` (or `/review?event=aie-sandbox` with bypass)

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
curl -sS -b /tmp/ce-admin.txt -X POST \
  http://localhost:3000/api/admin/events/aie-sandbox/submissions/<SUBMISSION_ID>/schedule \
  -H 'content-type: application/json' \
  -d '{"startsAt":"2026-10-01T17:00:00.000Z","endsAt":"2026-10-01T17:30:00.000Z","roomName":"Main Stage"}'

# 6) Mint speaker portal token / complete tasks (unchanged)
curl -sS -X POST http://localhost:3000/api/portal/session \
  -H 'content-type: application/json' \
  -d '{"email":"ada@example.com"}'
```

## Deploy

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put AUTH_SECRET
npm run deploy
```

Custom domain is configured in `wrangler.jsonc` as `conference-engine.65labs.org`.

## Domain model (short)

Spine: `Event → CFPForm → Submission → Evaluation → Acceptance → SpeakerTask → AgendaSlot`.

A `Submission` *is* the session once accepted. Status transitions are enforced in `src/lib/domain/submission-status.ts`. Speaker onboarding task types live in `SPEAKER_TASK_TYPE_REGISTRY` (`bio`, `headshot`, `slides`); accept spawns `speaker_tasks` idempotently on `(submission_id, person_id, template_key)`. Form field types and visibility rules live in typed registries under `src/lib/domain/`.

## License

MIT (pending). Hackathon submission code is yours to keep.
