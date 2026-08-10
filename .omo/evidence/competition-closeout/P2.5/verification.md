# P2.5 Embed enable/disable — verification

## Changes
- Migration `0041_public_embed_status.sql`: `public_embeds.status` (`active` | `paused`, default `active`)
- Serve-time gate: `buildPublicEmbedPayload` and loader.js return not-found when paused
- Admin list toggle (Pause/Resume) via `PATCH { status }`
- Worker test: paused embeds stop serving

## Evidence
- Worker: `worker-public-embeds.log` (3/3 pass, includes pause gate)
- Unit: `unit-loader-builder.log` (loader + builder)
- Local migration: `local-d1-migration.log` (0041 applied)
- Curl: `curl-pause-gate.log`
  - active JSON → HTTP 200
  - pause via D1 → JSON + loader HTTP 404
  - resume → HTTP 200
