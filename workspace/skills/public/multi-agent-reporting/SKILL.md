---
name: multi-agent-reporting
description: Dispatch-board style reporting for multi-agent orchestration — renders a scheduler-style dashboard with Overview, Running, Completed, Blocked, Needs-Decision, Model Breakdown, and per-task Next-Hop actions. Replaces verbal status summaries with a structured task board.
version: 2.0.0
author: OpenClaw Community
license: MIT
tags:
  - multi-agent
  - reporting
  - orchestration
  - dashboard
  - dispatch
  - protocol
  - validation
---

# Multi-Agent Reporting Skill — v2 Dashboard

A portable, framework-agnostic reporting engine for multi-agent systems.
In v2 the default output is a **dispatch-board / scheduler-style dashboard**, not a plain summary table.
The dashboard groups tasks into status zones, shows per-model workload, and surfaces per-task next-hop actions.

## Dashboard Output (default)

```
## Multi-Agent Sprint Board

### Overview
`█████████████▓▓░░····` 65.0% complete

✅ Done: **13** · 🔄 Running: **3** · ⏸️ Blocked: **1** · ⚖️ Decision: **1** · ⏳ Pending: **2**

Coverage: 80.0% · Blocked/Stalled: 10.0%

### Running (3)

| Agent    | Model              | Task                 | Duration | Next Action       |
|----------|--------------------|----------------------|----------|-------------------|
| agent-4  | claude-sonnet-4    | Build payment flow   | 4m 12s   | PR review         |
| agent-5  | gpt-4o             | Write migration SQL  | 2m 05s   | —                 |

### Completed (13)
...

### Blocked / Failed (1)
...

### Needs Decision (1)
...

### Model Breakdown
...

### Next Actions
- ⏸️ agent-7: DB migration — blocked: schema lock held by dev-env
- ⚖️ agent-9: Auth provider — awaiting decision: use Auth0 or Cognito? → cc @tech-lead
```

## Quick Start

```js
const { formatReport, formatDashboard, validateReport, computeStats } = require('./index.js');

const tasks = [
  {
    agentId: 'agent-1',
    model: 'claude-sonnet-4-20250514',
    task: 'Implement auth module',
    status: 'completed',
    duration: '3m 42s',
    commit: 'a1b2c3d',
    thinking: 'high'
  },
  {
    agentId: 'agent-2',
    model: 'gpt-4o-2024-08-06',
    task: 'Design API schema',
    status: 'running',
    duration: '1m 20s',
    nextAction: 'Open PR for review',
    nextOwner: 'agent-lead',
    nextETA: '15m'
  },
  {
    agentId: 'agent-3',
    model: 'gemini-2.5-pro-preview-06-05',
    task: 'DB migration',
    status: 'blocked',
    blocker: 'Schema lock held by dev-env'
  },
  {
    agentId: 'agent-4',
    model: 'claude-sonnet-4-20250514',
    task: 'Choose auth provider',
    status: 'needs_decision',
    decision: 'Auth0 vs Cognito',
    decisionOwner: 'tech-lead',
    nextETA: '1h'
  }
];

// Full dashboard (new default)
console.log(formatReport(tasks));

// Or call directly:
console.log(formatDashboard(tasks));

// Legacy table format still works:
console.log(formatReport(tasks, { outputFormat: 'table' }));
```

## API Reference

### `formatReport(tasks, options?)`

Main entry point. When `outputFormat` is `"dashboard"` (the new default), delegates to `formatDashboard()`.
For `"table"`, `"list"`, or `"compact"` falls back to legacy renderers.

**Returns:** `string` — Markdown report.

---

### `formatDashboard(tasks, options?)`

Renders the full dispatch-board view. Sections are conditionally included based on data.

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | `string` | `"Multi-Agent Progress Report"` | Dashboard title |
| `showSummary` | `boolean` | `true` | Show Overview bar |
| `showStatusSections` | `boolean` | `true` | Show Running / Completed / Blocked sections |
| `showDecisions` | `boolean` | `true` | Show Needs Decision section |
| `showModelBreakdown` | `boolean` | `true` | Show Model Breakdown section |
| `showNextHop` | `boolean` | `true` | Show per-task Next Hop detail table |
| `showNextSteps` | `boolean` | `true` | Show actionable Next Actions bullets |
| `showThinking` | `boolean` | `true` | Show thinking level on model names |
| `statusGroups` | `object` | see config | Map zone names to status lists |
| `sectionTitles` | `object` | see config | Rename any section heading |

---

### `validateReport(tasks, options?)`

Validates task entries. v2 adds support for:
- `blocker` as alternative to `error` for blocked tasks
- `artifact` as alternative to `commit` for completed tasks
- `decisionOwner` required check (opt-in)
- `nextAction` required check on active tasks (opt-in)

**Returns:** `ValidationResult`

```js
{
  valid: boolean,
  totalEntries: number,
  passedEntries: number,
  failedEntries: number,
  issues: [
    { index, agentId, field, message, severity: 'error'|'warning' }
  ],
  markdown: string
}
```

---

### `generateTemplate(taskList, options?)`

Same as v1 but includes v2 optional fields in each row.

---

### `computeStats(tasks, options?)`

**Returns:** `StatsResult`

```js
{
  total, completed, running, failed, blocked, pending,
  needs_decision, waiting, cancelled, other,
  completionRate,   // "65.0%"
  coverageRate,     // "(completed + running) / total"
  blockedRate,      // "(blocked + failed + needs_decision) / total"
  byAgent: { [agentId]: { total, completed, ... } },
  byModel: { [model]:   { total, completed, ... } }
}
```

## TaskEntry Schema — v2

```typescript
interface TaskEntry {
  // Required
  agentId: string;          // Agent identifier (e.g. "agent-1", "seef", "cras")
  model: string;            // Full model name (e.g. "claude-sonnet-4-20250514")
  task: string;             // Task description
  status: string;           // See statuses below

  // Timing
  duration?: string;        // Human-readable elapsed (e.g. "3m 42s")
  updatedAt?: string;       // ISO timestamp of last update

  // Completion
  commit?: string;          // Git commit hash (completed tasks)
  artifact?: string;        // Alternative to commit (e.g. "doc link", "PR #42")
  branch?: string;          // Branch name

  // Thinking / model config
  thinking?: string;        // "none" | "low" | "medium" | "high"

  // Error / block
  error?: string;           // Error message (failed tasks)
  blocker?: string;         // Blocker description (blocked tasks)

  // Decision gate
  decision?: string;        // The decision question
  decisionOwner?: string;   // Who must decide (e.g. "tech-lead")

  // Next hop (dispatch board)
  nextAction?: string;      // What happens next
  nextOwner?: string;       // Who does it
  nextETA?: string;         // When (e.g. "15m", "EOD")
  handoffTo?: string;       // Downstream agent/system

  [key: string]: any;       // Custom fields are preserved
}
```

## Statuses

| Status | Icon | Zone |
|--------|------|------|
| `running` | 🔄 | Running |
| `completed` | ✅ | Completed |
| `failed` | ❌ | Blocked / Failed |
| `blocked` | ⏸️ | Blocked / Failed |
| `needs_decision` | ⚖️ | Needs Decision |
| `pending` | ⏳ | (pending, counted only) |
| `waiting` | 🕒 | (custom zones) |
| `cancelled` | 🚫 | (custom zones) |

## Configuration

All defaults live in `config.json`. Override any value per-call via `options`.

### Custom status groups

```js
formatReport(tasks, {
  statusGroups: {
    running:       ['running', 'in_review'],
    completed:     ['completed', 'merged'],
    blocked:       ['blocked', 'failed', 'cancelled'],
    needsDecision: ['needs_decision', 'awaiting_approval']
  }
});
```

### Custom section titles (localization)

```js
formatReport(tasks, {
  sectionTitles: {
    overview:      'Übersicht',
    running:       'In Arbeit',
    completed:     'Abgeschlossen',
    blocked:       'Blockiert',
    needsDecision: 'Entscheidung erforderlich',
    modelBreakdown:'Modell-Auslastung',
    nextActions:   'Nächste Schritte'
  }
});
```

## Output Formats

| Format | Description |
|--------|-------------|
| `dashboard` | (**default v2**) Full dispatch-board: Overview + zone sections + model breakdown + next-hop |
| `table` | Single Markdown table (v1 default) |
| `list` | Numbered bullet list (good for Discord/WhatsApp) |
| `compact` | One line per task in a code block (CI logs) |

## Migration from v1

v2 is backward-compatible. Existing `formatReport(tasks)` calls now render
the dashboard instead of the plain table. To keep the old table output:

```js
formatReport(tasks, { outputFormat: 'table' });
```

New fields (`blocker`, `nextAction`, `needs_decision`, etc.) are optional —
existing TaskEntry objects without them render cleanly with `—` placeholders.

## Integration

Framework-agnostic. Works with:
- OpenClaw multi-agent orchestration
- LangGraph / CrewAI / AutoGen
- Custom agent frameworks
- CI/CD pipelines
- Any system that produces `TaskEntry[]` data

No external dependencies. Pure Node.js (≥14).

## License

MIT
