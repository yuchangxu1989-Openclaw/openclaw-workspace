# Day2 / P0 / P1 Execution Roadmap (Non-conflicting)

Time: 2026-03-08
Owner discipline: 1 agent = 1 key
Scope source: Day2 leftover reports + known P0/P1 reports already in workspace
Constraint: do not modify `openclaw.json`

## Purpose
Turn scattered Day2 leftovers and known P0/P1 issues into an execution-oriented map that can expand safely without lane collisions.

## Operating rules
1. One lane owns one primary artifact family at a time.
2. Code-change lanes and validation lanes must be split when touching the same module family.
3. `openclaw.json` stays frozen.
4. Queue/reporting artifacts must be updated before spawning more work, so later expansion reads the same map.
5. Prefer additive roadmap/report artifacts over live config churn.

## Canonical dependency picture

### Immediate blockers that affect many other lanes
- **B1. Handler resolution split-brain**  
  Two dispatcher systems and mixed short-name/full-path handler references mean some rules never execute. This blocks trustworthy progress on event routing, git routing, intent routing, system.error, and some Day2 closeout claims.
- **B2. Event routing rule coverage gaps**  
  Missing/incorrect rule triggers for `intent.detected`, `intent.ruleify|reflect|directive`, `aeo.evaluation.completed`, `git.commit.completed`, `system.error`.
- **B3. Runtime reliability noise**  
  context-less handler crashes, cron timeout noise, stale/manual queue drift, unprotected api-probe lock gap.
- **B4. Reporting/occupancy clarity**  
  Mostly improved already, but future expansion needs one execution map so new lanes do not double-count active capacity.

## Execution lanes

### Lane A — Event routing contract closure (P0)
**Primary owner surface:** `skills/isc-core/rules/`  
**Goal:** make high-value event types match real executable routes.

Includes:
- P0-01 `intent.detected` trigger name correction
- P0-02 rule files for `intent.ruleify`, `intent.reflect`, `intent.directive`, optionally `intent.feedback`
- P0-03 `git.commit.completed` rule hook
- P0-05 AEO trigger normalization for n023/n024/n026
- P0-06 `system.error` consumption rule

Parallel safety:
- Can run **in parallel with Lane C and Lane D**
- Should **not** run in parallel with Lane B if both edit same rule files/handler references without file ownership split

Definition of done:
- Rule JSON exists/corrected
- Matching event names align with actually emitted events
- Acceptance commands from `event-routing-p0-fix-priority.md` pass
- Updated evidence report appended

### Lane B — Handler resolution unification (P0)
**Primary owner surface:** `infrastructure/event-bus/`, `infrastructure/dispatcher/`  
**Goal:** make both dispatch paths resolve the same handlers reliably.

Includes either strategy, but one strategy only:
- Strategy B1: normalize rule `action.handler` values to short names
- Strategy B2: extend both resolvers to support slash/path-based handler references

Also fold in:
- resolve `completeness-check` cross-directory miss
- verify 19 full-path handler references are executable

Parallel safety:
- Can run **in parallel with Lane D and Lane E**
- **Should wait before broad Lane A validation**, because event-routing proof is weak until handler resolution is trustworthy
- Avoid concurrent edits with Lane A on same rule files unless ownership is pre-split: Lane A edits triggers only, Lane B edits handler reference style only

Definition of done:
- Known 19 affected rules resolve in real execution path
- dispatcher and event-bus both pass smoke execution on representative rules
- No new alias-only dead routes introduced

### Lane C — Failure recovery hardening (P1 but unblocker)
**Primary owner surface:** handler robustness and recovery tree

Includes:
- batch-fix `context.logger || console` class of crashes across the 11 named handlers
- standardize minimal context fallback for `bus`, `notify`, logger where applicable
- close `isc-change-alignment.js` Class/function mismatch
- consolidate timeout/permission/not-found/flaky recovery tree artifact

Parallel safety:
- Can run **now in parallel** with Lane A or Lane B
- Low conflict if one owner stays in handler files and another stays in rule/resolver files

Definition of done:
- Empty/minimal context no longer crashes handlers in named P1 set
- Regression tests or smoke scripts exist
- Recovery-tree artifact updated for future lanes

### Lane D — Runtime hygiene / queue integrity (P0/P1 mixed)
**Primary owner surface:** runtime queues, cron/runtime hygiene artifacts

Includes:
- `api-probe.js` flock protection gap
- inspect and classify `event-dispatch-runner` timeout issue
- stale/manual queue observability update
- keep dispatched/manual queue from becoming false backlog again

Parallel safety:
- Can run **now in parallel** with Lane A/B/C
- Should avoid touching core rule files

Definition of done:
- lock/timeout/hygiene status documented with exact next action
- queue artifacts reflect actionable backlog, not mixed stale noise

### Lane E — Reporting + expansion control plane (P1)
**Primary owner surface:** reports/queue artifacts only

Includes:
- connect roadmap to queue/state artifacts
- clarify what can be spawned now vs wait
- preserve 1-agent-1-key discipline in execution planning
- optional follow-up on reporting ↔ dispatch-engine wiring, but only after B/C are stable

Parallel safety:
- Can run anytime; should prefer **artifact-only changes**
- No code conflicts with A/B/C/D if it stays in `workspace/reports` and queue json

Definition of done:
- current execution map published
- queue artifact updated with lane status and wait conditions

## What can run in parallel now

### Safe now
1. **Lane B — Handler resolution unification**
2. **Lane C — Failure recovery hardening**
3. **Lane D — Runtime hygiene / queue integrity**
4. **Lane E — Reporting/control-plane artifact updates**

Reason:
- These four can be split by artifact family: resolver core / handlers / runtime hygiene / reports.
- They satisfy 1 agent = 1 key and minimize file overlap.

### Conditionally parallel now
5. **Lane A — Event routing contract closure**

Condition:
- safe if Lane A edits only trigger/rule coverage, while Lane B owns handler resolution/reference style.
- if no such split is enforced, Lane A should wait for Lane B to publish its handler-resolution decision.

## What should wait

### Wait W1 — Broad event-routing acceptance sweep
Wait until:
- Lane B done enough to prove handlers actually resolve
- Lane C done enough that handler crashes do not create false negatives

### Wait W2 — New engine grey rollout / dispatch-engine activation
Wait until:
- P0 routing closure is stable
- timeout classification from Lane D exists
- no `openclaw.json` edits are required for the step being proposed

### Wait W3 — Deep reporting integration with dispatch engine
Wait until:
- B and D stabilize execution semantics
- otherwise the system risks polishing metrics on top of unresolved route failures

## Recommended execution order

### Wave 1 (start now, parallel)
- **B** handler resolution unification
- **C** failure recovery hardening
- **D** runtime hygiene / queue integrity
- **E** reporting/control-plane updates

### Wave 2 (start once B has chosen/fixed resolution path)
- **A** event routing contract closure

### Wave 3 (after A+B+C pass smoke checks)
- cross-lane validation sweep for P0 acceptance commands
- queue cleanup / archive decisions based on validated status

## Artifact updates required

### Must update now
1. **This roadmap**  
   `workspace/reports/day2-p0-p1-execution-roadmap-2026-03-08.md`
2. **Execution queue map**  
   `workspace/reports/task-queue/day2-p0-p1-execution-map-2026-03-08.json`

### Should update as lanes progress
3. append/refresh issue evidence in:
- `workspace/reports/event-routing-p0-fix-priority.md`
- `workspace/reports/day2-final-open-gaps-only.md`
- `workspace/reports/day2-remaining-gap-scan-final.md`

4. if runtime backlog classification changes, refresh:
- `workspace/infrastructure/dispatcher/manual-queue.jsonl` consumers/reporting summary
- `workspace/reports/task-queue/latest-report.md` or adjacent queue summaries

## Collision-avoidance ownership matrix

| Lane | Owner surface | Do not overlap with |
|---|---|---|
| A | `skills/isc-core/rules/*` trigger coverage | B on same rule files unless split by field ownership |
| B | resolver logic + handler reference normalization | A on same rule files if mass handler renames |
| C | handler robustness files | another C-like batch fixer |
| D | cron/queue/hygiene scripts and status artifacts | B if resolver timeout investigation edits same runner path |
| E | reports + queue json only | none if artifact-only |

## Minimal success criteria for “system can keep expanding”
- There is one published lane map with wait conditions.
- High-conflict surfaces are explicitly owned.
- Queue/report artifacts distinguish **ready now** vs **blocked by dependency**.
- No expansion requires `openclaw.json` edits.
- Validation is delayed until handler resolution and crash-hardening are credible.

## Ready-now lane summary
- **Ready now:** B, C, D, E
- **Ready with ownership split:** A
- **Wait:** broad acceptance sweep, grey rollout, deep reporting integration

## One-line execution map
**Stabilize handler resolution + handler robustness + runtime hygiene first, then close event-trigger coverage, then run P0 acceptance and queue-state refresh.**
