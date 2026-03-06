---
name: multi-agent-dispatch
description: >
  Zero-delay multi-agent dispatch engine. Enqueue = immediate dispatch.
  19-lane high-utilisation scheduler with auto-backfill.
  This skill is DISPATCH ONLY — no reporting, no dashboards.
  For status boards use multi-agent-reporting.
version: 1.0.0
author: OpenClaw Community
license: MIT
tags:
  - multi-agent
  - dispatch
  - orchestration
  - scheduler
  - acp
---

# Multi-Agent Dispatch Skill

**Purpose:** Schedule and dispatch tasks to ACP agent slots at maximum utilisation.
**NOT for:** Status reports, dashboards, summaries → use `multi-agent-reporting`.

## Core Axioms

1. **Dispatch first.** Every conversation turn that identifies a dispatchable task → enqueue it before saying anything else.
2. **enqueue = dispatch.** There is no separate "dispatch" step. `enqueue()` auto-fills a free slot.
3. **No "待发" state.** Tasks are `queued` (waiting for slot) or `spawning`/`running`. No human-gated hold.
4. **Slot freed = instant backfill.** `markDone`/`markFailed` auto-drains the queue.
5. **19 lanes, ≥90% target.** If free slots > 0 and queue > 0, something is wrong.
6. **Accurate counts.** `running` = sessions that are actually executing. No inflation.
7. **New tasks don't wait.** Even mid-conversation, if you identify a deterministic task, enqueue immediately.
8. **Conversation ≠ gate.** Typing a response to the user does not pause dispatch.

## State Machine

```
queued  →  spawning  →  running  →  done | failed | cancelled
  ▲            │
  │       (spawn fail → failed, slot freed → drain)
  │
  └─── new task arrives via enqueue()
```

## Usage in Agent Prompt

### Step 1: Initialise (once per orchestration session)

```js
const { DispatchEngine } = require('./skills/public/multi-agent-dispatch/dispatch-engine');
const engine = new DispatchEngine({ maxSlots: 19 });
```

### Step 2: Enqueue tasks as soon as they are identified

```js
// Single task — dispatches immediately if slot available
engine.enqueue({
  title: 'Build payment API',
  model: 'codex/gpt-5.4',
  source: 'user-request',
  priority: 'high',       // critical > high > normal > low
  payload: { task: '...prompt...' },
});

// Batch — all enqueued, then drain runs once
engine.enqueueBatch([
  { title: 'Task A', model: 'codex/gpt-5.4' },
  { title: 'Task B', model: 'codex/gpt-5.4' },
  { title: 'Task C', model: 'codex/gpt-5.4' },
]);
```

### Step 3: Wire to sessions_spawn

Set `onDispatch` to actually spawn the ACP session:

```js
const engine = new DispatchEngine({
  maxSlots: 19,
  onDispatch: (task) => {
    // This is called synchronously during drain().
    // The agent should call sessions_spawn here.
    // After spawn success, call engine.markRunning(task.taskId, { sessionKey });
    // On spawn failure, engine auto-marks it failed.
  }
});
```

Or handle dispatch events externally:

```js
engine.on('dispatched', (tasks) => {
  for (const task of tasks) {
    // spawn each task via sessions_spawn
  }
});
```

### Step 4: Lifecycle callbacks (from subagent results)

```js
engine.markRunning(taskId, { sessionKey: 'agent:...' });
engine.markDone(taskId, { result: 'PR merged' });
engine.markFailed(taskId, { error: 'build failed' });
engine.cancel(taskId);
engine.heartbeat(taskId, { progress: '75%' });
```

### Step 5: Read state (for reporting skill)

```js
const board = engine.liveBoard();   // structured snapshot
const tasks = engine.allTasks();    // flat list for formatReport()
```

## CLI

```bash
BASE=skills/public/multi-agent-dispatch

# Enqueue (auto-dispatches)
node $BASE/cli.js enqueue '{"title":"Build auth","priority":"high"}'

# Batch enqueue
node $BASE/cli.js enqueue-batch '[{"title":"A"},{"title":"B"}]'

# Lifecycle
node $BASE/cli.js running <taskId>
node $BASE/cli.js done <taskId> '{"result":"ok"}'
node $BASE/cli.js failed <taskId> '{"error":"timeout"}'
node $BASE/cli.js cancel <taskId>

# Monitoring
node $BASE/cli.js status    # compact summary
node $BASE/cli.js board     # full live board JSON

# Maintenance
node $BASE/cli.js reap      # auto-fail stale tasks
node $BASE/cli.js drain     # force fill slots from queue
node $BASE/cli.js clear-queue
node $BASE/cli.js reset
```

## Integration with Main Agent

The main agent should follow this protocol:

1. **Parse user request** → identify discrete tasks
2. **For each task: `enqueue()` immediately** — do NOT batch "for later"
3. **Continue conversation** — dispatch is non-blocking
4. **On subagent completion announcement** → `markDone()` or `markFailed()`
5. **Backfill is automatic** — no need to manually trigger
6. **For reporting** → read `liveBoard()` or `allTasks()` and pass to reporting skill

### Anti-patterns (DO NOT)

- ❌ "I'll dispatch these after explaining the plan" → dispatch FIRST
- ❌ "Waiting for wave 1 to finish before starting wave 2" → enqueue everything now
- ❌ "3 tasks dispatched (2 pending)" → there is no pending; they're queued or dispatched
- ❌ Manually counting slots → engine tracks this
- ❌ Reporting running count that doesn't match actual sessions
