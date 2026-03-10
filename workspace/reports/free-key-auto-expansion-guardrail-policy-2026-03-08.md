# Workspace-only free-key auto expansion guardrail policy

Date: 2026-03-08
Scope: workspace only; do not modify `openclaw.json`
Applies to: free-key-driven auto expansion, backlog remediation selection, queue expansion, reporting

## Goal

Use newly free model keys to pull in **high-value, ready, non-duplicate** backlog/remediation work, while preventing:

- over-expansion
- file conflict
- duplicate work
- fake utilisation
- “busy-looking” low-signal task inflation

## Reused sources of truth

Expansion must reuse existing workspace artifacts before inventing new tasks.

Primary sources, in order:

1. `PROJECT-TRACKER.md`
2. `memory/tasks/*.json`
3. `memory/runtime/active-task-queue.json`
4. `reports/task-queue/*.json`
5. existing dispatch/runtime state and reporting already produced by the multi-agent dispatch layer

If a candidate task cannot be traced back to at least one of the above, it is **not eligible** for free-key expansion.

---

## 1. Eligibility: which backlog/remediation tasks are high-value enough to expand

A task is eligible for free-key expansion only if **all** of the following are true:

### 1.1 Traceable backlog origin
- has an existing root task or subtask record in `memory/tasks/*.json`, **or**
- is explicitly listed in `PROJECT-TRACKER.md` as pending / blocked / doing / queued-next, **or**
- is already represented in runtime queue/report artifacts.

### 1.2 Remediation or delivery value
At least one of these must be true:
- fixes a blocker, timeout, stale gate, dispatch failure, routing gap, missing validation, or integration gap
- completes a missing lane for an already-active root task
- closes an explicit acceptance gap from tracker/report/test artifacts
- converts “analysis only” work into executable/validated work

### 1.3 Ready-to-run
- has a clear parent root task or root issue
- has acceptance criteria or can inherit parent acceptance
- has a bounded lane scope
- does **not** require changing global platform config outside workspace

### 1.4 Non-duplicate
- no existing open/active/queued task with same `parent_task + lane`
- no existing task whose normalized title matches same root+lane intent
- no active task already occupying the same execution lane for the same root

### 1.5 Conflict-safe
- declared or inferable file/module scope does not overlap with another active task on same root unless lane is explicitly non-code/report-only

---

## 2. Allowed expansion lanes

Free-key expansion may only create the following canonical lanes for a root task:

1. `implementation`
2. `validation`
3. `reporting`
4. `governance`
5. `integration`
6. `risk`

### Lane semantics

#### implementation
Use when the root still lacks core functional change.

#### validation
Use when implementation exists or is in progress but missing tests, benchmark rerun, repro, acceptance verification, or gate evidence.

#### reporting
Use when execution exists but status/evidence/acceptance write-up is missing.

#### governance
Use when the gap is policy, queue hygiene, auditability, dedupe, timeout handling, budget/model governance, or tracker sync.

#### integration
Use when the root requires wiring between router/dispatcher/event-bus/runner/reporting/skill boundaries.

#### risk
Use when the root needs rollback, blast-radius reduction, guardrails, conflict prevention, or failure containment.

### Lane restrictions

- Max **one open lane task per `(parent_task, lane)`**.
- Do not create custom lane names during free-key auto expansion.
- `reporting` and `governance` must not be used to inflate utilisation when no implementation/validation/integration/risk signal exists.

---

## 3. Expansion priority rules

When a free key appears, rank candidates by this order:

1. **active-root missing-lane completion**  
   Example: root task is already doing, but validation/risk/integration lane missing.
2. **timeout / dispatch / stale-gate remediation**
3. **blocked acceptance closure**
4. **tracker-listed P0/P1 backlog with explicit acceptance**
5. **reporting/governance follow-up for already-shipped work**

### Hard deprioritization
Never spend a free key first on:
- pure status rewriting
- duplicate report generation
- speculative root creation without tracker/task evidence
- creating more children for a root that already has all canonical lanes present
- low-value “busy filler” tasks meant only to show occupancy

---

## 4. Anti-over-expansion rules

### 4.1 Expand only from real free capacity
Expansion can only happen when reporting/dispatch confirm a genuinely free model key, not merely a queued task count change.

### 4.2 Root saturation cap
For a given root task:
- canonical cap = 6 lanes total
- soft cap = 3 simultaneously active/open lanes unless root is P0 remediation
- hard cap = do not auto-create any additional lane if all 6 canonical lanes already exist

### 4.3 Global burst cap
Per expansion cycle:
- create at most `min(freeKeys, 2)` new tasks by default
- if candidate pool is only reporting/governance, create at most 1

### 4.4 No recursive fan-out
Auto-expanded subtasks cannot themselves free-key-expand into another layer unless they become a tracker-backed root later.

### 4.5 No shell artifacts
Do not spawn a lane if its acceptance would be only “write a stub”, “create placeholder”, or “record that we should do work later”.

---

## 5. File conflict prevention rules

Before spawning, infer affected scope using available fields:
- explicit `files`, `modules`, `paths`, `scope`, or acceptance references if present
- otherwise infer from lane and parent title

### Conflict deny rules
Do not auto-expand if another active task under same root appears to target:
- the same file
- the same directory subtree
- the same integration boundary with write intent

### Safe parallel combinations under same root
Usually allowed:
- `implementation` + `reporting`
- `implementation` + `risk` when risk is policy/rollback doc only
- `validation` + `reporting`
- `governance` + `reporting`

Usually not allowed without explicit isolation:
- `implementation` + `integration` on same files
- `implementation` + another implementation-like task
- `integration` + `risk` if both modify dispatcher/router/runtime code
- `validation` that rewrites fixtures used by active implementation

If scope cannot be inferred confidently, **do not auto-expand**.

---

## 6. Duplicate-work prevention rules

A candidate is duplicate if any existing task matches one of these:

1. same `parent_task` and same canonical `lane`
2. normalized title equality after removing punctuation, whitespace variants, and lane suffixes
3. same root issue + same acceptance intent
4. same remediation already represented in runtime queue as queued/active/open

### Required dedupe key
Use:
`dedupeKey = parent_task + '::' + lane`

Optional strengthened key:
`dedupeKey = parent_task + '::' + lane + '::' + normalizedScope`

If dedupe key already exists in non-terminal status, skip expansion.

---

## 7. Fake utilisation prevention rules

Free-key expansion must never exist to make dashboards look busy.

### Forbidden signals for expansion
Do not expand solely because:
- active count is low
- utilisation is low
- a report expects a fuller queue
- a root has many possible subtasks in theory

### Required value signal
At least one must be present:
- blocker removal
- timeout remediation
- acceptance closure
- explicit tracker backlog
- missing canonical lane on active high-priority root

### Reporting truthfulness
Reports must distinguish:
- real running tasks occupying keys
- queued-next tasks
- newly auto-created tasks this cycle

Never count newly created queued tasks as active utilisation.

---

## 8. Directly implementable selection algorithm

### Step A — collect candidates
From existing workspace sources, gather root and subtask records.

### Step B — normalize
For each item derive:
- `parent_task`
- `priority`
- `lane`
- `status`
- `acceptancePresent`
- `isActiveRoot`
- `isRemediation`
- `normalizedTitle`
- `normalizedScope`

### Step C — score
Recommended additive scoring:

- +50 P0
- +30 P1
- +35 timeout/dispatch/stale-gate remediation
- +25 active root missing canonical lane
- +20 explicit tracker blocker
- +15 acceptance present
- +10 integration/validation/risk for active implementation root
- -40 duplicate lane exists
- -50 scope conflict detected
- -30 root already has all canonical lanes
- -20 reporting/governance with no executional signal

Only candidates with final score `>= 40` are eligible.

### Step D — cap and select
- sort descending by score
- select up to `min(realFreeKeys, 2)`
- no more than one candidate per root in a cycle unless root is explicit timeout-remediation fan-in/fan-out work

### Step E — spawn canonical task
Create only one lane task per selected root/lane using existing task file format and acceptance inheritance.

---

## 9. Exact expansion rules

These are the exact rules to enforce for workspace-only free-key expansion:

1. Expand **only** when a real model key is free.
2. Expand **only** from existing tracker/task/runtime artifacts.
3. Expand **only** into canonical lanes: `implementation|validation|reporting|governance|integration|risk`.
4. Create **at most one** open task per `(parent_task, lane)`.
5. Prefer missing lanes on active P0/P1 roots before creating work for inactive roots.
6. Prefer timeout/dispatch/stale-gate/acceptance remediation over net-new speculative work.
7. Do not auto-expand a root that already has all six canonical lanes.
8. Do not create more than `min(freeKeys, 2)` tasks per cycle.
9. Do not create more than one task for the same root in one cycle, unless the root is an explicit timeout-remediation root.
10. Skip any candidate whose file/module scope overlaps an active sibling task.
11. Skip any candidate lacking acceptance criteria or parent acceptance inheritance.
12. Never count queued newly-created tasks as active utilisation.
13. Never create reporting/governance-only filler tasks to consume free keys.
14. If dedupe or conflict confidence is low, default to **skip**, not expand.

---

## 10. Suggested code touchpoints (workspace-safe)

If implementing, update workspace code only at these touchpoints:

- `scripts/task-queue-expand.js`
- optionally helper module under `infrastructure/dispatcher/` or `scripts/`
- optionally reporting summary under `reports/task-queue/`

Do **not** modify `openclaw.json`.

---

## 11. Minimal implementation contract

A safe implementation should add:

- canonical lane list including `governance`
- source loading from tracker + task files + active queue
- dedupe by `parent_task::lane`
- score-based candidate selection
- free-key cap input/env/CLI option
- conflict skip + reason logging
- summary output including:
  - selected candidates
  - skipped duplicates
  - skipped conflicts
  - skipped over-cap roots
  - created task count

---

## 12. Acceptance for this policy

This policy is acceptable when workspace expansion can prove:

1. a free key does not automatically generate filler tasks
2. missing high-value remediation lanes are selected first
3. duplicate `(parent_task, lane)` tasks are blocked
4. active-utilisation reporting remains tied to real key occupancy, not queue inflation
5. conflicting same-root file-touching work is skipped by default
