# Decision trail (autonomous run)

## Exit predicate

All true with runtime evidence:

1. Conditional CFP: public submit + D1 row (verified)
2. Speaker portal: after accept, bio/headshot/slides via R2
3. Email on accept + ICS on schedule via Resend
4. Evaluation plan: assign, score, accept/reject
5. DnD schedule: room + speaker hard conflicts
6. Outstanding-tasks dashboard updates live (EventRoom fanout or equivalent)
7. Deployed at https://conference-engine.65labs.org
8. Public GitHub repo, step commits, no `research/`, README current

## Checkpoints

| When | Change | Predicate move |
|---|---|---|
| start | Goal armed; repo + Sat baseline next | 1 already true locally |
| Sat commit | Public repo + CFP baseline pushed | 1 ✅; 8 partial (repo exists) |
| Sun commit | Portal + accept→tasks + R2 (`3471e05`) | 2 ✅ |
| Mon commit | Eval + Resend + ICS (`df1aa86`) | 3–4 ✅ (Resend blocks `example.com` onboarding; real domains OK) |
| Tue commit | DnD + conflicts + public schedule (`c5adb83`) | 5 ✅ |
| Sun slice | Accept → speaker_tasks + /portal + R2 uploads | 2 ✅ locally (pending parent commit) |
| Mon slice | Eval scores + Resend templates + ICS schedule | 3–4 ✅ locally (pending parent commit) |
| Tue slice | DnD admin schedule + public schedule + hard conflicts | 5 ✅ locally (pending parent commit) |
| Wed slice | Outstanding dashboard + public API + deploy prep | 6 ✅ locally (pending parent commit/deploy) |

## Tue schedule notes

- Public `/e/[slug]/schedule` shows slots for submissions in `scheduled` **or** `published` (demo visibility; tighten later if organizers need draft-only).
- Rooms live in `event_rooms` (seeded: Main Stage, Room B, Workshop Lab); slots still store `room_name` text.
- `EventRoom` HTTP `POST /broadcast` on schedule mutate; soft-fails under plain `next dev` without DO.

## Wed realtime + API notes

- Dashboard at `/admin/events/[slug]/dashboard`. Groups incomplete `speaker_tasks` by `(submissionId, personId)`.
- Prefer EventRoom WebSocket (`broadcasted`); 2s poll fallback under `next dev` (`polling`). Worker intercepts `/api/admin/events/*/room` upgrades in production.
- Broadcast reasons: `tasks.complete`, `tasks.upload`, `tasks.accept`, `schedule.mutate`.
- Public API: `GET /api/v1/events/[slug]/{submissions,schedule}` behind `PUBLIC_API_KEY` (`Authorization: Bearer` or `x-api-key`).
