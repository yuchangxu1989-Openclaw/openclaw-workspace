# P0–P1 Backlog Expansion Set — 2026-03-08

Scope: expand currently known P0–P1 leftovers **without touching `openclaw.json`**. Grounded in current workspace evidence summarized in `reports/aeo-day2-gap-audit-2026-03-08.md`.

Discipline rule: **1 agent = 1 key**. Each dispatchable item below is scoped to a single primary key/file family to minimize conflicts.

## Source evidence

Primary evidence reviewed:
- `reports/aeo-day2-gap-audit-2026-03-08.md`

## Current known P0–P1 leftover map

### P0
1. **Day2 Gap2 closure missing / canonical status hole**
   - Current state: explicitly still open in the audit.
   - Why P0: blocks truthful top-level closure and keeps Day2 status non-canonical.
2. **Day2 canonical closure matrix not reconciled**
   - Current state: contradictory/stale status narrative across artifacts.
   - Why P0: decision-makers can dispatch against the wrong truth.

### P1
3. **AEO eval-set standards incomplete**
   - Current state: 3 migrated eval-set dirs missing `standard.json`.
   - Why P1: governance/integrity gap, but not a current functional runtime blocker.
4. **AEO registry metadata mismatch**
   - Current state: `goldenStandardCount` does not match the visible set entries per audit.
   - Why P1: invalidates the registry as a trustworthy control plane.
5. **AEO generated-set naming / quality debt**
   - Current state: `cras-generated-*` debt remains flagged.
   - Why P1: hygiene and standards debt, likely independent of runtime.
6. **AEO collection loop evidence weak / not operationally proven**
   - Current state: collection meta indicates only tiny/inactive loop.
   - Why P1: weakens closure on regression intake/governance, but likely separable from current functional pass.
7. **Gap3 acceptance artifact stale vs latest gate evidence**
   - Current state: functional gate now passed, but acceptance report remains partial/stale.
   - Why P1: closure/reporting inconsistency.
8. **Gap4 remains partial / in-progress and needs isolated re-verification lane**
   - Current state: still not closable per audit.
   - Why P1: known leftover, but should stay isolated from AEO governance tasks.

## Prioritized non-conflicting expansion candidates

### Candidate A — P0 — Canonical Day2 status reconciliation pack
- **Goal:** create/update one canonical Day2 status matrix reflecting: Gap1 passed, Gap2 open, Gap3 partial, Gap4 partial, Gap5 passed.
- **Primary key / file family:** `reports/day2-status-*` (new file family only).
- **Recommended artifact:** `reports/day2-status-reconciled-2026-03-08.md`
- **Why non-conflicting:** uses a new report path, does not mutate product config, and does not overlap with eval-set content files.
- **Dispatchability:** high; doc-only truth-reconciliation lane.

### Candidate B — P0 — Gap2 closure evidence hunt + task card
- **Goal:** determine whether Gap2 has missing evidence vs genuinely missing implementation/acceptance, then produce an explicit closure blocker card.
- **Primary key / file family:** `backlog/day2-gap2-owner-card.md`
- **Why non-conflicting:** standalone owner/evidence card in backlog; does not require editing active AEO or Gap4 artifacts.
- **Dispatchability:** high; investigation lane with single deliverable.

### Candidate C — P1 — AEO missing `standard.json` completion lane
- **Goal:** add/normalize `standard.json` for exactly the 3 cited eval-set dirs: `aeo-vector-system`, `cras-intent`, `mr-router`.
- **Primary key / file family:** one eval-set directory per agent.
- **Why non-conflicting:** can be split as 3 separate single-key agents, one directory each, avoiding overlap.
- **Dispatchability:** very high if those dirs exist in the main tree.

### Candidate D — P1 — Unified registry metadata reconciliation lane
- **Goal:** reconcile registry metadata counts with actual registry entries, especially `goldenStandardCount`.
- **Primary key / file family:** `skills/aeo/unified-evaluation-sets/registry.json`
- **Why non-conflicting:** single-file lane; should not be combined with per-set standard file edits in the same agent.
- **Dispatchability:** high, but only one agent should own `registry.json`.

### Candidate E — P1 — AEO eval-set standard-definition spec
- **Goal:** publish a one-page standard describing required files, naming, standard levels, minimum case count, and source legitimacy.
- **Primary key / file family:** `reports/aeo-eval-set-standard-definition-2026-03-08.md` (new file).
- **Why non-conflicting:** new-file governance doc; safe parallel lane.
- **Dispatchability:** high.

### Candidate F — P1 — Gap3 acceptance backfill lane
- **Goal:** write a refreshed acceptance/backfill report splitting `functional gate = pass` from `governance/collection = partial`.
- **Primary key / file family:** `reports/day2-gap3-acceptance-reconciled-2026-03-08.md`
- **Why non-conflicting:** new-file reporting lane; does not require touching benchmark code or registry.
- **Dispatchability:** high.

### Candidate G — P1 — Collection-loop operational evidence lane
- **Goal:** inspect/expand `tests/collection/meta.json` evidence into an explicit audit, including exact missing proof for reviewed samples and regression archival.
- **Primary key / file family:** `reports/aeo-collection-loop-audit-2026-03-08.md`
- **Why non-conflicting:** report-only lane against collection evidence, not the registry or eval-set directories.
- **Dispatchability:** high.

### Candidate H — P1 — Gap4 isolated re-verification plan
- **Goal:** extract the remaining Gap4 failing checks into a dispatchable plan with acceptance criteria and owner slots.
- **Primary key / file family:** `backlog/day2-gap4-reverification-plan.md`
- **Why non-conflicting:** isolated backlog artifact; does not edit Gap4 implementation.
- **Dispatchability:** medium-high.

## Recommended dispatch order

1. **A / Canonical Day2 status reconciliation pack** — P0
2. **B / Gap2 closure evidence hunt + task card** — P0
3. **F / Gap3 acceptance backfill lane** — P1
4. **E / AEO eval-set standard-definition spec** — P1
5. **D / Unified registry metadata reconciliation lane** — P1 (single owner only)
6. **C / Missing `standard.json` completion lane** — P1 (split into 3 separate agents if tree exists)
7. **G / Collection-loop operational evidence lane** — P1
8. **H / Gap4 isolated re-verification plan** — P1

## Safe parallelization matrix

- **Can run together safely:** A + B + E + F + G + H
  - Reason: all are new-file doc/backlog artifacts with distinct file keys.
- **Run alone:** D
  - Reason: single hot file `registry.json`.
- **Run as separate micro-lanes:** C1 / C2 / C3
  - `skills/aeo/evaluation-sets/aeo-vector-system/*`
  - `skills/aeo/evaluation-sets/cras-intent/*`
  - `skills/aeo/evaluation-sets/mr-router/*`
  - Reason: one agent per directory key.

## Dispatchable task cards

### TASK-P0-DAY2-CANONICAL-STATUS
- Priority: P0
- Owner key: `reports/day2-status-*`
- Deliverable: reconciled Day2 status matrix document
- Acceptance:
  - states all 5 gaps explicitly
  - cites current evidence
  - marks stale contradictions
  - does not modify `openclaw.json`

### TASK-P0-DAY2-GAP2-OWNER-CARD
- Priority: P0
- Owner key: `backlog/day2-gap2-owner-card.md`
- Deliverable: explicit Gap2 blocker/owner/evidence card
- Acceptance:
  - explains whether evidence is missing vs implementation missing
  - lists unblock steps
  - names exact evidence sought

### TASK-P1-AEO-STANDARD-SPEC
- Priority: P1
- Owner key: `reports/aeo-eval-set-standard-definition-2026-03-08.md`
- Deliverable: one-page AEO eval-set standard spec
- Acceptance:
  - defines required files
  - defines standard levels and naming policy
  - sets minimum case-count guidance
  - distinguishes generated vs authoritative sources

### TASK-P1-AEO-REGISTRY-RECONCILE
- Priority: P1
- Owner key: `skills/aeo/unified-evaluation-sets/registry.json`
- Deliverable: corrected metadata counts or justified exceptions
- Acceptance:
  - metadata matches entries
  - changes explained in accompanying note/report
  - single-owner lane only

### TASK-P1-AEO-MISSING-STANDARDS-AEO-VECTOR-SYSTEM
- Priority: P1
- Owner key: `skills/aeo/evaluation-sets/aeo-vector-system/`
- Deliverable: `standard.json` for that set

### TASK-P1-AEO-MISSING-STANDARDS-CRAS-INTENT
- Priority: P1
- Owner key: `skills/aeo/evaluation-sets/cras-intent/`
- Deliverable: `standard.json` for that set

### TASK-P1-AEO-MISSING-STANDARDS-MR-ROUTER
- Priority: P1
- Owner key: `skills/aeo/evaluation-sets/mr-router/`
- Deliverable: `standard.json` for that set

### TASK-P1-GAP3-ACCEPTANCE-BACKFILL
- Priority: P1
- Owner key: `reports/day2-gap3-acceptance-reconciled-2026-03-08.md`
- Deliverable: refreshed Gap3 acceptance split by functional vs governance status

### TASK-P1-COLLECTION-LOOP-AUDIT
- Priority: P1
- Owner key: `reports/aeo-collection-loop-audit-2026-03-08.md`
- Deliverable: audit of collection/review/regression proof gaps

### TASK-P1-GAP4-REVERIFICATION-PLAN
- Priority: P1
- Owner key: `backlog/day2-gap4-reverification-plan.md`
- Deliverable: isolated remaining-checks plan for Gap4

## Notes

- No `openclaw.json` changes proposed or made.
- Because the current workspace is trimmed and does not contain the cited Day2/AEO tree, this expansion set is **grounded in the current audit report** rather than direct artifact mutation of absent files.
- If dispatched into the full repo, use the owner keys above to preserve non-conflict discipline.
