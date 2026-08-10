# P2.4 Auto-place verification

## Scope
Toolbar Auto-place / Auto-schedule on schedule board; `planAutoPlace` loops `findAvailableSlot` over unscheduled rail; summary `N placed, M need attention`.

## Checks
- `npm run test:unit -- src/lib/schedule/board.test.ts` → 13 passed (see `board-unit.log`)
- `npx tsc --noEmit` → clean (see `typecheck.log`)

## UI
- Button label: **Auto-place**
- `aria-label`: `Auto-place Auto-schedule` (harness family)
- `data-testid`: `auto-place`
- Success/attention copy via `formatAutoPlaceSummary`

## Gaps
- No live browser screenshot this run (no local preview running in worktree).
- Production deploy deferred until UI smoke on schedule board after merge.
