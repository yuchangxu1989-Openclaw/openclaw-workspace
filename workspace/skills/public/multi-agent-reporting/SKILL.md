---
name: multi-agent-reporting
description: Standardized reporting protocol for multi-agent orchestration — format, validate, and summarize agent task reports with coverage metrics and next-step suggestions.
version: 1.0.0
author: OpenClaw Community
license: MIT
tags:
  - multi-agent
  - reporting
  - orchestration
  - protocol
  - validation
---

# Multi-Agent Reporting Skill

A portable, framework-agnostic reporting engine for multi-agent systems. Generates standardized progress reports, validates report completeness, and computes coverage metrics — all without depending on any specific orchestrator.

## Features

| Feature | Description |
|---------|-------------|
| **Report Formatter** | Renders agent task data into Markdown tables, lists, or compact format |
| **Report Validator** | Checks each entry for required fields, model names, commit hashes, error reasons |
| **Statistics Engine** | Computes totals, completion rate, coverage, and per-status breakdowns |
| **Next-Step Advisor** | Suggests actionable next steps based on current report state |
| **Parameterized Config** | Every field, icon, and format is configurable via JSON |

## Quick Start

```js
const { formatReport, validateReport, generateTemplate } = require('./index.js');

const tasks = [
  {
    agentId: 'agent-1',
    model: 'claude-sonnet-4-20250514',
    task: 'Implement auth module',
    status: 'completed',
    duration: '3m 42s',
    commit: 'a1b2c3d'
  },
  {
    agentId: 'agent-2',
    model: 'gpt-4o-2024-08-06',
    thinking: 'high',
    task: 'Design API schema',
    status: 'running',
    duration: '1m 20s'
  }
];

// Format a report
const report = formatReport(tasks);
console.log(report);

// Validate entries
const validation = validateReport(tasks);
console.log(validation);

// Generate a blank template from a task list
const template = generateTemplate([
  { agentId: 'agent-1', task: 'Build frontend' },
  { agentId: 'agent-2', task: 'Build backend' }
]);
console.log(template);
```

## API Reference

### `formatReport(tasks, options?)`

Formats an array of task entries into a Markdown report.

**Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `tasks` | `Array<TaskEntry>` | *(required)* | Array of task report entries |
| `options.outputFormat` | `string` | `"table"` | `"table"`, `"list"`, or `"compact"` |
| `options.statusIcons` | `object` | *(see config.json)* | Map of status → emoji |
| `options.showThinking` | `boolean` | `true` | Show thinking level annotation |
| `options.showSummary` | `boolean` | `true` | Append summary statistics |
| `options.showNextSteps` | `boolean` | `true` | Append next-step suggestions |
| `options.title` | `string` | `"Multi-Agent Progress Report"` | Report title |

**Returns:** `string` — Markdown-formatted report.

---

### `validateReport(tasks, options?)`

Validates each task entry for completeness and correctness.

**Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `tasks` | `Array<TaskEntry>` | *(required)* | Array of task report entries |
| `options.requiredFields` | `string[]` | `["agentId","model","task","status"]` | Fields that must be present |
| `options.requireCommitOnComplete` | `boolean` | `true` | Completed tasks must have a commit |
| `options.requireErrorOnFail` | `boolean` | `true` | Failed tasks must have an error reason |
| `options.requireFullModelName` | `boolean` | `true` | Model name must look like a full identifier |

**Returns:** `ValidationResult` — structured validation output.

```js
{
  valid: boolean,
  totalEntries: number,
  passedEntries: number,
  failedEntries: number,
  issues: [
    { index: number, agentId: string, field: string, message: string, severity: 'error'|'warning' }
  ],
  markdown: string   // Pre-rendered validation report in Markdown
}
```

---

### `generateTemplate(taskList, options?)`

Generates a pre-filled report template from a task list.

**Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `taskList` | `Array<{agentId, task, model?}>` | *(required)* | Planned tasks |
| `options.outputFormat` | `string` | `"table"` | `"table"`, `"list"`, or `"compact"` |
| `options.defaultStatus` | `string` | `"pending"` | Default status for template rows |
| `options.statusIcons` | `object` | *(see config.json)* | Map of status → emoji |

**Returns:** `string` — Markdown template.

---

### `computeStats(tasks, options?)`

Computes summary statistics from task entries.

**Returns:** `StatsResult`

```js
{
  total: number,
  completed: number,
  running: number,
  failed: number,
  blocked: number,
  pending: number,
  other: number,
  completionRate: string,    // e.g. "75.0%"
  coverageRate: string,      // e.g. "87.5%" (completed + running) / total
  byAgent: { [agentId]: { total, completed, ... } },
  byModel: { [model]: { total, completed, ... } }
}
```

## TaskEntry Schema

```typescript
interface TaskEntry {
  agentId: string;          // Agent identifier
  model: string;            // Full model name (e.g. "claude-sonnet-4-20250514")
  task: string;             // Task description
  status: string;           // "completed" | "running" | "failed" | "blocked" | "pending" | custom
  duration?: string;        // Human-readable duration
  commit?: string;          // Git commit hash (required for completed tasks)
  thinking?: string;        // Thinking level: "none" | "low" | "medium" | "high"
  error?: string;           // Error reason (required for failed tasks)
  [key: string]: any;       // Additional custom fields are preserved
}
```

## Output Formats

### Table (default)

```
## Multi-Agent Progress Report

| Agent | Model | Task | Status | Duration | Commit |
|-------|-------|------|--------|----------|--------|
| agent-1 | claude-sonnet-4-20250514 | Implement auth | ✅ completed | 3m 42s | a1b2c3d |
| agent-2 | gpt-4o(high) | Design API | 🔄 running | 1m 20s | — |

### Summary
- **Total:** 2 | **Completed:** 1 | **Running:** 1 | **Failed:** 0 | **Blocked:** 0
- **Completion:** 50.0% | **Coverage:** 100.0%

### Next Steps
- 🔄 agent-2: Design API — still running, monitor for completion
```

### List

A bulleted list format suitable for chat / Discord / WhatsApp.

### Compact

Single-line per task, minimal decoration — ideal for log output or CI.

## Configuration

All defaults live in `config.json`. Override any value by passing an `options` object to any function.

## Integration

This skill is **framework-agnostic**. It works with:

- OpenClaw multi-agent orchestration
- LangGraph / CrewAI / AutoGen
- Custom agent frameworks
- CI/CD pipelines
- Any system that produces `TaskEntry[]` data

No external dependencies. Pure Node.js (≥14).

## License

MIT
