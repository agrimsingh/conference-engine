# P2.5 Embed enable/disable — verification

## Changes
- Migration `0043_public_embed_status.sql`: `public_embeds.status` (`active` | `paused`, default `active`)
  - Renumbered from `0041` to avoid collision with P0.3 `0041_event_contact_email.sql` (0042 reserved for CRM)
- Serve-time gate: `buildPublicEmbedPayload` and loader.js return not-found when paused
- Admin list toggle (Pause/Resume) via `PATCH { status }`
- Worker test: paused embeds stop serving

## Evidence
- Worker: `worker-public-embeds.log` (3/3 pass, includes pause gate)
- Unit: `unit-loader-builder.log` (loader + builder)
- Local migration: `local-d1-migration.log` (applied under old name `0041` before renumber to `0043`)
- Curl: `curl-pause-gate.log`
  - active JSON → HTTP 200
  - pause via D1 → JSON + loader HTTP 404
  - resume → HTTP 200
