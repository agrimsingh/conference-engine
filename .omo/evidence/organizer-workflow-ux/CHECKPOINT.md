# Organizer workflow UX — throughput checkpoint

Branch: `feat/organizer-workflow-ux` @ `main`/`dddca08`

## Feature step 3 dimensions

| Dimension | Decision |
| --- | --- |
| **Blocking first steps** | Dig CE schedule board / auto-place, submissions notify, event config checklist, sessions schema, resources/files, email templates, admin nav. Architect U5 service-block kind before any migration. |
| **Independent workstreams** | Wave A (parallel): U9, U7, U8. Wave B: U1, U2. Wave D: U3 + U4. Wave E: U5. Wave F: U6 already shipped. |
| **Shared mutable state** | `schedule-board.tsx` (U1/U3/U5) serialized. Submissions notify UI (U2) alone. Dashboard (U4) + nav (U9) lightly shared. |
| **Smallest safe decomposition** | One branch; one coherent PR (tightly related organizer workflow). |

## Principles that shaped decisions

- **Laziness / Subtract Before You Add:** CE-native chrome; no external component port. U6 reused existing FilesLibrary ZIP.
- **Experience First:** preview→confirm, Review-and-notify, readiness strip, empty→next action.
- **Model the Domain:** U5 `item_kind`+`agenda_visibility` on submissions (agenda_slots requires submission_id). U4 ordered lifecycle SM. U2 `uniform|mixed|none` template selection.
- **Sequence Verifiable Units:** verify per unit after tests.
- **Prove It Works:** focused vitest + workers + tsc.
- **Never Block on the Human:** PRs land; **prod deploy paused** for human ship.

## Unit status

| Unit | Status | Notes |
| --- | --- | --- |
| U9 View speaker portal | done | SPEAKER_PORTAL_HREF + nav link |
| U7 Gmail-tone email | done | Hey + reply CTA; Reply-To untouched |
| U8 Empty states | done | EmptyState + emptyNextActionHref |
| U1 Auto-place preview | done | preview dialog → Apply N |
| U2 Accept/decline + Review-and-notify | done | Review and notify dialog |
| U3 Agenda readiness strip | done | Accepted→…→Published counts |
| U4 Program lifecycle | done | Sequential dashboard checklist |
| U5 Service blocks | done | migration 0044; placeable service rows |
| U6 Deliverables ZIP | done (pre-existing) | FilesLibrary select→ZIP latest R2 versions |

## U5 design (shipped)

`item_kind` talk|service + `agenda_visibility` public|private on submissions. Public schedule: published AND public. Private refuse publish. Accelevents skips service.

## Verification

- `npx tsc --noEmit` green (`.omo/evidence/organizer-workflow-ux/tsc.log`)
- Focused unit: see `focused-tests.log`
- Workers: see `workers-service-blocks.log`

## PR

https://github.com/agrimsingh/conference-engine/pull/19

## Prod deploy

**PAUSE.** Human must say ship before remote migrate `0044` + prod deploy.
