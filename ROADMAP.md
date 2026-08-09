# Conference Engine Roadmap

Execution order for the agreed product depth work. Presets are named `minimal` and `conference` (not brand-coded).

## Done predicate

All phases below land on `main` with green `npm test` / `tsc` / `lint` for each unit, and a final fable council finds no missing links against the original gap list.

## Phase 0. Cheap wins

1. Fix submissions `ActivatePlanButton` when plan already active.
2. Fix `PRODUCT.md` demo slug to `demo-cfp-to-stage`.
3. Settings UI for `track_conflict_policy` (`hard` | `allow`).
4. Form-builder editors for placeholder, maxLength, rows, number min/max/step; public HTML `maxLength`.
5. Expose visibility `neq` (and `never` if cheap) in builder + write-path allowlist.
6. Render track on public session detail.
7. Criterion scale/description editors in review workspace.
8. Session clone picker from accepted sessions.
9. Remove or fix dead plaintext token helpers and unused exports.

## Phase 1. Program cockpit

Blocker snapshot queries + dashboard UI + inline actions wired to existing APIs. Widen realtime invalidate prefixes.

## Phase 2. Review depth

`reviewers.email` migration, invite emails, bulk labels, bulk decide with editable email, score matrix, keyboard J/K workflow.

## Phase 3. Form builder UX

DnD reorder, live preview, advanced field keys, sections schema, CFP file-upload field type.

## Phase 4. Applicant experience

Autosave with draft-save rate limit, progress/char counts, review-before-submit, section navigation when sections exist.

## Phase 5. Setup and cloning

Preset selector (`minimal` | `conference`), communications checklist item, event clone, guided setup polish.

## Phase 6. Scheduling polish

Rail search/filter, find available slot, publish confirmation, conflict warn policy when feasible.

## Phase 7. Public surface

Headshot route + render, public ICS download, share/copy link, speaker profiles/gallery.

## Phase 8. Platform

Unauth public schedule JSON (no emails), nightly Airtable opt-in, Queues for durable email when ready.

## Phase 9. Release verification

Full-lifecycle workers test, Playwright multi-browser in CI, backup/restore scripts, harness isolation fix.
