---
name: multi-agent-reporting
description: >
  多Agent状态汇报 — 支持实时看板、历史汇报、ISC-REPORT-SUBAGENT-BOARD-001标准格式。
  读取持久化task board数据，输出统一格式的文本/卡片/HTML报告。
  纯汇报，不含调度。
version: 4.0.0
author: OpenClaw
license: MIT
tags:
  - multi-agent
  - reporting
  - live-board
  - task-board
  - history
  - feishu-card
---

# Multi-Agent Reporting v4.0.0

纯汇报技能。读取任务数据，输出稳定统一的状态汇报。**与调度技能完全分离。**

## What's New in v4.0

- **ISC-REPORT-SUBAGENT-BOARD-001 标准格式** — `renderBoardReport()` 输出标准 board 视图
- **历史汇报模式** — `renderHistoryReport()` 查询和渲染已完成任务历史
- **自动汇总渲染** — `renderSummaryReport()` 渲染自动/手动生成的汇总
- **持久化数据源** — 从 `task-board.json` 读取完整历史，不再只看运行时状态

## 三种汇报模式

### 1. 实时看板（默认）

显示当前 active / queued / blocked 任务。done 任务 10 分钟后从实时视图隐藏。

```js
const { renderReport, renderText, renderCard } = require('./index.js');
const report = renderReport(tasks, { highlights: [...] });
```

### 2. ISC Board 汇报（NEW）

从持久化 task board 读取，输出 ISC-REPORT-SUBAGENT-BOARD-001 标准格式。
包含：active + queued + history + batches + summary。

```js
const { renderBoardReport, renderBoardFromFile } = require('./board-report.js');

// 从 engine 获取
const board = engine.getTaskBoard();
const report = renderBoardReport(board, {
  highlights: ['Gap5 回归验证完成'],
  risks: ['Gap2 超时'],
  historyLimit: 10,
});

// 从文件读取
const report = renderBoardFromFile(
  'skills/public/multi-agent-dispatch/state/task-board.json',
  { historyLimit: 20 }
);
```

输出格式：

```
═══ SUBAGENT TASK BOARD ═══

Board: board_xxx | Updated: 15:30
Slots: 5/19 occupied | 3 queued
Registered: 42 | Done: 30 | Failed: 2

── ACTIVE ──────────────────
  #1  🔄 [running]  Build payment API  gpt-5.4  14:20
  #2  ⏳ [spawning]  Setup CI/CD  gpt-5.4  14:25

── QUEUED ──────────────────
  #1  ⏳ [queued]  Write docs  gpt-5.4  normal

── SUMMARY ─────────────────
  done: 30 | failed: 2 | cancelled: 1
  Total registered: 42

── RECENT HISTORY ──────────
  ✅ Auth module  gpt-5.4  3m 20s  14:15
  ✅ DB migration  gpt-5.4  1m 45s  14:10

── HIGHLIGHTS ──────────────
  - Gap5 回归验证完成

═══ END BOARD ═══
```

### 3. 历史查询汇报（NEW）

渲染特定时间段/条件的已完成任务历史。

```js
const { renderHistoryReport } = require('./board-report.js');

const history = engine.queryHistory({ since: '2026-03-08T13:00:00Z', limit: 50 });
const report = renderHistoryReport(history, { since: '13:00', until: 'now' });
```

### 4. 自动汇总渲染（NEW）

```js
const { renderSummaryReport } = require('./board-report.js');

const summaries = engine.getSummaries(5);
const report = renderSummaryReport(summaries[0]);
```

## 核心规则

| # | 规则 |
|---|------|
| 1 | 表前必须输出：`Agent并行总数：X` |
| 2 | 主表固定列：`任务 / 模型 / 状态 / 时间` |
| 3 | 模型列只放纯模型名，不混入渠道、provider 前缀 |
| 4 | 不显示 Agent 名、人设名、label、渠道前缀 |
| 5 | 实时模式默认只显示 active / 未完成任务 |
| 6 | Board 模式包含历史和批次信息 |
| 7 | 表后必须输出：`done / timeout / blocked` 汇总 |
| 8 | ISC Board 格式用 `═══` 标题框，sections 用 `──` |
| 9 | 少废话，优先结构化、稳定、可扫描 |
| 10 | 0 active 也照常输出总数、表格、汇总 |

## API

### 实时模式（已有）

```js
const { renderReport, renderText, renderCard } = require('./index.js');
```

- `renderReport(tasks, opts?)` → `{ text, card, title, stats }`
- `renderText(tasks, opts?)` → Markdown 文本
- `renderCard(tasks, opts?)` → 飞书卡片 JSON
- `computeStats(tasks)` → `{ total, active, done, timeout, blocked, ... }`
- `selectVisibleTasks(tasks, opts?)` → 实时可见任务列表

### Board 模式（NEW）

```js
const { renderBoardReport, renderHistoryReport, renderSummaryReport, renderBoardFromFile } = require('./board-report.js');
```

- `renderBoardReport(board, opts?)` → ISC-REPORT-SUBAGENT-BOARD-001 格式文本
- `renderHistoryReport(history, opts?)` → 历史任务表格
- `renderSummaryReport(summary)` → 汇总报告
- `renderBoardFromFile(path, opts?)` → 从文件读取 board 并渲染

### Options

| 选项 | 默认 | 说明 |
|------|------|------|
| `highlights` | `[]` | 关键进展列表 |
| `risks` | `[]` | 风险列表 |
| `decisions` | `[]` | 待决策项列表 |
| `title` | 自动 | 卡片标题 |
| `historyLimit` | `10` | Board 模式显示的历史条数 |
| `refreshThreshold` | `20` | 实时模式刷新阈值 |

## 数据源

### 实时模式

接收 task array 作为输入（从 dispatch engine 的 `allTasks()` 或 `liveBoard()` 获取）。

### Board 模式

读取 `task-board.json`，包含：
- `active[]` — 当前活跃任务
- `queued[]` — 排队任务
- `history[]` — 已完成任务历史（最多 1000 条）
- `batches{}` — 批次信息
- `autoSummaries[]` — 自动汇总历史
- `summary{}` — 全局统计计数器

## 与调度技能的关系

本技能 **只做汇报渲染**。数据来源：

1. **实时数据** ← `dispatch-engine.allTasks()` 或 `dispatch-engine.liveBoard()`
2. **持久化数据** ← `dispatch-engine.getTaskBoard()` 或直接读 `task-board.json`
3. **历史查询** ← `dispatch-engine.queryHistory(opts)`
4. **汇总数据** ← `dispatch-engine.getSummaries(limit)`

调度技能负责数据写入和生命周期管理，汇报技能负责数据读取和格式化输出。

## ISC-REPORT-SUBAGENT-BOARD-001 标准

此标准定义了 subagent task board 的标准输出格式：

1. `═══ SUBAGENT TASK BOARD ═══` 头部标识
2. Board ID + 时间戳 + 槽位信息
3. `── ACTIVE ──` section：当前活跃任务
4. `── QUEUED ──` section：排队任务
5. `── SUMMARY ──` section：统计汇总
6. `── RECENT HISTORY ──` section（可选）：近期完成历史
7. `── HIGHLIGHTS / RISKS / DECISIONS ──` sections（可选）
8. `── BATCHES ──` section（可选）：活跃批次
9. `═══ END BOARD ═══` 尾部标识
