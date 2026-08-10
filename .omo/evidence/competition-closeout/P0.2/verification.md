# P0.2 CFP-17/18 verification

## Acceptance

| Criterion | Result | Evidence |
| --- | --- | --- |
| Create Forward Summit 2028 beside existing events | Pass | `POST /api/admin/events` → `{"ok":true,"slug":"forward-summit-2028"}`; events list screenshot |
| Second event submissions/sessions/speakers empty | Pass | Local D1: `forward-summit-2028` submissions=0; empty UI shots |
| Workers isolation test | Pass | `npm run test:workers -- test/workers/multi-event-isolation.test.ts` |
| Screenshot evidence | Pass | PNGs below |

## Runtime

- Branch: `feat/p0.2-multi-event`
- Local admin: `http://localhost:3022/admin` with `ce_admin_bypass=1`
- Existing seeded events: `aie-sandbox` (8 submissions), `demo-cfp-to-stage` (20)
- Created: Forward Summit 2028 (`forward-summit-2028`) via create API (not clone)

## Artifacts

- `admin-events-list.png` / `.txt` — both/all events in switcher list including Forward Summit 2028
- `aie-sandbox-submissions.png` — populated first-event submissions
- `forward-summit-2028-submissions.png` — empty second-event submissions
- `forward-summit-2028-speakers.png` — empty speakers
- `forward-summit-2028-sessions.png` — empty sessions
- `workers-isolation.log` — focused workers test pass

## Test command

```bash
npm run test:workers -- test/workers/multi-event-isolation.test.ts
```
