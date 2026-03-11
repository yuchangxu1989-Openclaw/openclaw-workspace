---
name: multi-agent-dispatch
description: >
  Zero-delay multi-agent dispatch engine with persistent task board.
  19-lane high-utilisation scheduler with auto-backfill, history tracking,
  batch management, and auto-summary triggers.
  For status boards and formatted reports use multi-agent-reporting.
version: 2.0.0
author: OpenClaw Community
license: MIT
tags:
  - multi-agent
  - dispatch
  - orchestration
  - scheduler
  - acp
  - task-board
---

# Multi-Agent Dispatch Skill v2.0.0

**Purpose:** Schedule, dispatch, and track tasks across ACP agent slots with full lifecycle persistence.
**NOT for:** Status reports, dashboards, summaries → use `multi-agent-reporting`.

## What's New in v2.0

- **Persistent Task Board** — All tasks registered, tracked, and archived with full history
- **History Query API** — Query completed tasks by time range, status, search text
- **Batch Management** — Group tasks into batches, track batch-level completion
- **Auto-Summary Triggers** — Automatic summary generation on threshold/interval/batch completion
- **ISC Board Integration** — Task board data feeds ISC-REPORT-SUBAGENT-BOARD-001 format

## Core Axioms

1. **Dispatch first.** Every conversation turn that identifies a dispatchable task → enqueue it before saying anything else.
2. **enqueue = dispatch.** There is no separate "dispatch" step. `enqueue()` auto-fills a free slot.
3. **No "待发" state.** Tasks are `queued` (waiting for slot) or `spawning`/`running`. No human-gated hold.
4. **Slot freed = instant backfill.** `markDone`/`markFailed` auto-drains the queue.
5. **19 lanes, ≥90% target.** If free slots > 0 and queue > 0, something is wrong.
6. **Accurate counts.** `running` = sessions that are actually executing. No inflation.
7. **Every task persists.** Completion → history archive. Nothing is lost.

## State Machine

```
queued  →  spawning  →  running  →  done | failed | cancelled
  ▲            │                         │
  │       (spawn fail → failed)    (archived to task board history)
  │
  └─── new task arrives via enqueue()
```

## Usage

### Step 1: Initialise

```js
const { DispatchEngine } = require('./skills/public/multi-agent-dispatch/dispatch-engine');
const engine = new DispatchEngine({ maxSlots: 19 });
```

### Step 2: Enqueue tasks

```js
engine.enqueue({
  title: 'Build payment API',
  model: 'codex/gpt-5.4',
  source: 'user-request',
  priority: 'high',
  payload: { task: '...prompt...' },
});

// Batch enqueue
engine.enqueueBatch([
  { title: 'Task A', model: 'codex/gpt-5.4' },
  { title: 'Task B', model: 'codex/gpt-5.4' },
]);
```

### Step 3: Lifecycle callbacks

```js
engine.markRunning(taskId, { sessionKey: 'agent:...' });
engine.markDone(taskId, { result: 'PR merged' });
engine.markFailed(taskId, { error: 'build failed' });
engine.cancel(taskId);
```

### Step 4: Query history (NEW)

```js
// Recent completions
const recent = engine.queryHistory({ limit: 20 });

// Filter by time range
const last2h = engine.queryHistory({ since: '2026-03-08T15:00:00Z' });

// Filter by status
const failures = engine.queryHistory({ status: 'failed' });

// Search by title
const apiTasks = engine.queryHistory({ search: 'API' });
```

### Step 5: Batch management (NEW)

```js
// Create a batch
const batchId = engine.createBatch('Day2 Implementation', ['t_1', 't_2', 't_3']);

// Add task to batch
engine.addToBatch(batchId, 't_4');

// Check batch status
const batches = engine.getBatches();
```

### Step 6: Summaries (NEW)

```js
// Manual summary
const summary = engine.generateSummary('manual');

// Get recent auto-summaries
const summaries = engine.getSummaries(5);

// Listen for auto-summaries
engine.on('autoSummary', (summary) => {
  // Triggered when threshold reached (default: every 5 completions)
  console.log('Auto summary:', summary);
});

// Get full task board
const board = engine.getTaskBoard();
```

### Step 7: Read state (for reporting skill)

```js
const board = engine.liveBoard();       // real-time snapshot
const taskBoard = engine.getTaskBoard(); // full board with history
const tasks = engine.allTasks();         // flat list for renderReport()
```

## Persistent Files

| File | Purpose |
|------|---------|
| `state/engine-state.json` | Engine core state (queued/spawning/running/finished) |
| `state/live-board.json` | Real-time snapshot for quick reads |
| `state/task-board.json` | **Full task board with history, batches, summaries** |
| `state/summaries/*.json` | Individual auto-summary files |

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

# History (NEW)
node $BASE/cli.js history                    # recent 20
node $BASE/cli.js history --status=failed    # failed only
node $BASE/cli.js history --since=2h         # last 2 hours
node $BASE/cli.js history --search="API"     # search

# Summaries (NEW)
node $BASE/cli.js summary          # generate manual summary
node $BASE/cli.js summaries        # list recent summaries

# Maintenance
node $BASE/cli.js reap      # auto-fail stale tasks
node $BASE/cli.js drain     # force fill slots from queue
node $BASE/cli.js clear-queue
node $BASE/cli.js reset
```

## Auto-Summary Triggers

| Trigger | Condition | Default |
|---------|-----------|---------|
| Threshold | Every N task completions | 5 |
| Interval | Min time between summaries | 30 min |
| Batch complete | All tasks in a batch done | Immediate |
| Manual | CLI or API call | On demand |

## Task Board Schema

```typescript
interface TaskBoard {
  version: number;
  boardId: string;
  createdAt: string;
  updatedAt: string;
  summary: {
    maxSlots: number;
    occupied: number;
    free: number;
    queued: number;
    totalRegistered: number;
    totalCompleted: number;
    totalFailed: number;
    totalCancelled: number;
  };
  active: TaskRecord[];
  queued: TaskRecord[];
  history: TaskRecord[];    // completed tasks, newest first, capped at 1000
  batches: Record<string, Batch>;
  autoSummaries: Summary[];
}
```

## Integration with Reporting

The reporting skill reads from the task board:

```js
const { renderBoardReport } = require('./skills/public/multi-agent-reporting/board-report');
const board = engine.getTaskBoard();
const report = renderBoardReport(board, { highlights: [...], risks: [...] });
// Output follows ISC-REPORT-SUBAGENT-BOARD-001 standard
```

## Anti-patterns (DO NOT)

- ❌ "I'll dispatch these after explaining the plan" → dispatch FIRST
- ❌ "Waiting for wave 1 to finish before starting wave 2" → enqueue everything now
- ❌ "Task completed but I don't know the history" → query `engine.queryHistory()`
- ❌ Manually tracking completed tasks → the board does it automatically
- ❌ Polling for task status → listen to events or query the board

## 🚨 强制规则：spawn必须登记

主Agent每次调用sessions_spawn后，必须立即调用task-board登记。

标准流程：
1. sessions_spawn(agentId, label, task) → 获得sessionKey和runId
2. 立即执行：将任务信息写入task-board
   - exec: bash /root/.openclaw/workspace/scripts/register-task.sh <runId> <label> <agentId> <model>

违反此规则 = Badcase（ISC-SPAWN-TASKBOARD-HOOK-001）

### completion event必须回写

收到子Agent completion event后，立即执行：
```bash
bash /root/.openclaw/workspace/scripts/update-task.sh <taskId或label> <done|failed> "简要结果"
```
不回写 = 看板数据不准 = Badcase。

完整流程：spawn → register-task.sh → 等completion → update-task.sh

## 收编脚本

| 脚本 | 原路径 | 用途 |
|:-----|:------|:-----|
| `check-stale-tasks.js` | `scripts/check-stale-tasks.js`（已symlink） | 检测看板中的僵尸running任务，对比session实际状态，可自动修正 |
| `cleanup-stale-tasks.sh` | `scripts/cleanup-stale-tasks.sh`（已symlink） | 清理任务看板中的陈旧timeout任务，按模式匹配归档 |

### check-stale-tasks.js

```bash
node skills/public/multi-agent-dispatch/check-stale-tasks.js           # 只报告
node skills/public/multi-agent-dispatch/check-stale-tasks.js --fix     # 自动修正
node skills/public/multi-agent-dispatch/check-stale-tasks.js --fix --timeout 15  # 自定义超时阈值
```

### cleanup-stale-tasks.sh

```bash
node skills/public/multi-agent-dispatch/cleanup-stale-tasks.sh
```
