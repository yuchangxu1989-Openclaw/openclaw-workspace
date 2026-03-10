# Dispatch Occupancy Audit — 2026-03-08

## Task-card Summary
- **Finding:** Reported "running/busy" counts were partly inflated at the task-layer because `spawning` was intentionally counted as active/busy, while report text already excluded most non-running work. This created metric drift between board/global summaries and true model-key occupancy.
- **Finding:** Main-agent work is **not** included in model-key occupancy. Current occupancy only measures dispatch-engine managed subagent keys (`spawning + running` with a runtime model key). If the user expected the main agent itself to consume one lane/key, that is currently excluded by design.
- **Finding:** Overcount risk existed mainly in **workspace/global progress summaries**, not in the strict per-report `Agent并行总数`. `report-trigger` already counts only `state.running` records with unique runtime model keys.
- **Root causes:**
  1. `dispatch-engine.liveBoard().summary.busySlots` counted active dispatch tasks (`spawning + running`) rather than exposing lifecycle-stage counts beside true occupied key counts.
  2. `multi-agent-reporting/global-progress.js` used `summary.busySlots` as utilisation numerator, so it could display task-layer activity as if it were real occupied runtime keys.
  3. Delivery-layer states (`pending/acked/spawned/delivered`) lived in `pending-dispatches.json`, but board summary did not surface distinct counters, making `accepted`, `queued`, `spawning`, `running`, and `delivered` easy to conflate.

## Audit Scope
Investigated current accounting across:
- **Task layer:** `skills/public/multi-agent-dispatch/dispatch-engine.js`
- **Execution/delivery layer:** `skills/public/multi-agent-dispatch/dispatch-runner.js`, `dispatch-bridge.js`
- **Reporting/resource layer:** `skills/public/multi-agent-reporting/report-trigger.js`, `global-progress.js`
- **Live persisted state:** `skills/public/multi-agent-dispatch/state/{engine-state,live-board,pending-dispatches}.json`

## What the code does now

### 1) Task-layer accounting
`DispatchEngine` state machine is:
- `queued -> spawning -> running -> done/failed/cancelled`

Important implementation points:
- `activeTasks()` returns **`spawning + running` only**, filtered to tasks that have a runtime model key.
- `activeKeyMap()` groups those active tasks by runtime model key.
- `assertKeyOccupancyInvariant()` enforces:
  - no duplicate active tasks on same key
  - `active task count === occupied model key count`

So inside the engine, **true occupied model keys already equal active tasks**, as long as active means `spawning + running`.

### 2) Execution-layer / delivery accounting
`dispatch-bridge.js` tracks a richer delivery chain in `pending-dispatches.json`:
- `pending`
- `acked`
- `spawned`
- `delivered`
- `failed`

`dispatch-runner.js` transitions:
- `ackTask()` before spawn call
- `markSpawned()` after `sessions_spawn` success
- `markDelivered()` after handoff to runtime
- `engine.markRunning()` on spawn success
- `engine.markFailed()` on spawn failure

This means the system already had enough lifecycle data to distinguish **accepted/queued/acked/spawned/delivered**, but the live board summary did not expose those counts clearly.

### 3) Reporting/resource-layer accounting
There are two different reporting paths:

#### Strict per-report path (`report-trigger.js`)
This path is already conservative:
- it only takes `state.running`
- requires unique runtime model keys
- sets `stats.active = runtimeActiveTasks.length`

Conclusion: **`Agent并行总数` was not inflated by spawning tasks in this path.**

#### Global progress path (`global-progress.js`)
This path previously used:
- `summary.busySlots`
- `summary.maxSlots`

Because `busySlots` came from `activeTasks()` (`spawning + running`), the global progress/utilisation view could be interpreted as "currently occupied runtime keys" even though it was really a broader dispatch activity count.

## Evidence from current persisted state
At audit time, workspace live board showed:
- `busySlots: 0`
- `occupiedModelKeyCount: 0`
- `runningCount: 0`
- `spawningCount: 0`
- multiple recent finished tasks with error `sessions_spawn not available in current runtime`

This confirms the current mismatch observed by the user was plausibly historical / presentation-level, not a present live occupancy leak.

## Answers to the user’s concrete questions

### A. Are running counts inflated?
**Partially yes, depending on which count you read.**
- **No** for `report-trigger`’s `Agent并行总数`: it already uses only real running tasks with unique keys.
- **Yes / ambiguous** for board/global summaries if a reader interpreted `busySlots` as true runtime occupancy, because that metric mixed `spawning` with `running`.

### B. Is main agent work excluded from occupancy?
**Yes.**
Current occupancy covers only dispatch-engine-managed subagent tasks that have runtime model keys. The main orchestrating agent is not represented in `engine-state.json` and therefore not included in occupied model key counts.

### C. Where are statuses being overcounted?
Main overcount/overmerge points:
1. **`dispatch-engine.liveBoard().summary.busySlots`** — task-layer active (`spawning + running`) shown without adjacent lifecycle breakdown.
2. **`multi-agent-reporting/global-progress.js`** — used `busySlots` as utilisation numerator, effectively treating task-layer active as resource-layer occupancy.
3. **Board presentation in general** — lacked explicit counters for `accepted/queued/acked/delivered/trueOccupiedModelKeys`, so different layers were easy to confuse.

## Minimal safe fixes implemented

### 1) Added explicit lifecycle/resource counters to live board
File changed:
- `skills/public/multi-agent-dispatch/dispatch-engine.js`

Added summary fields:
- `acceptedCount`
- `queuedCount`
- `ackedCount`
- `deliveredCount`
- `trueOccupiedModelKeys`

This keeps existing fields backward-compatible while making stage/resource distinctions explicit.

### 2) Switched global progress to use true occupied keys for utilisation
File changed:
- `skills/public/multi-agent-reporting/global-progress.js`

Now utilisation and busy summary prefer:
- `summary.trueOccupiedModelKeys`
- fallback to `summary.occupiedModelKeyCount`
- only then fallback to old `summary.busySlots`

Also surfaced in progress payload:
- `acceptedCount`
- `queuedCount`
- `ackedCount`
- `deliveredCount`
- `trueOccupiedModelKeys`

## Validation
Executed:
- `node skills/public/multi-agent-dispatch/test/runtime-model-key-hardening.min.test.js`

Result:
- all tests passed

Also performed a local smoke check confirming board/global-progress now expose distinct lifecycle counts while keeping occupied-key utilisation consistent.

## Non-changes / intentionally not done
- **Did not modify `openclaw.json`**.
- Did not redefine `busySlots` semantics globally because that could break existing callers expecting `spawning + running` as "busy" dispatch slots.
- Did not inject main-agent occupancy into dispatch-engine state, because that would be a product/architecture decision rather than a minimal safe fix.

## Recommended follow-up
1. If product intent is "show total model-key occupancy including main agent", add a separate metric such as `orchestratorOccupiedKeys` or `systemOccupiedKeysTotal` rather than overloading dispatch counts.
2. In Feishu/report text, label metrics explicitly:
   - **accepted**
   - **queued**
   - **acked**
   - **spawning**
   - **running**
   - **delivered**
   - **true occupied model keys**
3. Consider adding a tiny audit CLI/report that joins:
   - engine state
   - pending dispatch state
   - session inventory (if available)
   to prove occupancy end-to-end.

## Files changed
- `skills/public/multi-agent-dispatch/dispatch-engine.js`
- `skills/public/multi-agent-reporting/global-progress.js`

## One-line verdict
**The hard inflation bug is mostly a metrics-labeling/layer-mixing issue: true report active counts were already conservative, but board/global summaries blurred lifecycle stages with real occupied model keys.**
