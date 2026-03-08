# Dispatch Index — P0/P1 Expansion — 2026-03-08

Generated from: `backlog/p0-p1-expansion-set-2026-03-08.md`

## Highest-priority dispatch now

1. `TASK-P0-DAY2-CANONICAL-STATUS`
2. `TASK-P0-DAY2-GAP2-OWNER-CARD`
3. `TASK-P1-GAP3-ACCEPTANCE-BACKFILL`
4. `TASK-P1-AEO-STANDARD-SPEC`

## Hold / serialize carefully

- `TASK-P1-AEO-REGISTRY-RECONCILE`
  - single-owner lane; hot file risk on `skills/aeo/unified-evaluation-sets/registry.json`

## Parallelizable micro-lanes

- `TASK-P1-AEO-MISSING-STANDARDS-AEO-VECTOR-SYSTEM`
- `TASK-P1-AEO-MISSING-STANDARDS-CRAS-INTENT`
- `TASK-P1-AEO-MISSING-STANDARDS-MR-ROUTER`
- `TASK-P1-COLLECTION-LOOP-AUDIT`
- `TASK-P1-GAP4-REVERIFICATION-PLAN`

## Conflict policy

- 1 agent = 1 key
- Prefer new-file report/backlog lanes first
- Never combine `registry.json` edits with eval-set directory edits in the same lane
- Do not modify `openclaw.json`
