# P2.3 verification

## Tests
- `npm run test:unit -- src/lib/email/ics.test.ts` — 4 passed (UID/SEQUENCE multi-event PUBLISH)
- `npm run test:workers -- test/workers/public-schedule-ics.test.ts` — 2 passed (published-only + empty/404)

## Runtime (local)
- `GET http://localhost:3013/api/e/demo-cfp-to-stage/schedule.ics` → 200 `text/calendar; method=PUBLISH`
- Headers: `schedule.ics.headers`
- Body: `schedule.ics` (7 VEVENTs, METHOD:PUBLISH, SEQUENCE, no ATTENDEE)
- Public schedule page 200; button label "Subscribe to calendar"
- Screenshot 375×812: `schedule-subscribe-375.png`

## Demo-mode
- Feed is read-only GET against published sessions; safe for `demo-cfp-to-stage`.
