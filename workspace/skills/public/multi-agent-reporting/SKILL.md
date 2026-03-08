---
name: multi-agent-reporting
description: 多Agent状态汇报 — 默认只显示当前 active/未完成任务；当任务表格条目超过20时直接刷新，清空已完成任务，并输出统一“Agent并行总数 + 任务/模型/状态表 + done/timeout/blocked汇总”。纯汇报，不含调度。
version: 3.2.0
author: OpenClaw
license: MIT
tags:
  - multi-agent
  - reporting
  - live-board
  - feishu-card
---

# Multi-Agent Reporting v3.2.0

纯汇报技能。接收任务数组，输出稳定统一的状态汇报。**与调度技能完全分离。**

## 默认新口径

从现在起，汇报默认按以下口径输出：

1. **主表只显示当前 active / 未完成任务**
2. **已完成任务默认不进入主表**
3. **当任务表格条目超过 20 时，直接刷新表格，只保留当前 active / 未完成任务，已完成任务清空**
4. `done / timeout / blocked` 汇总按**当前展示口径**计算；因此默认刷新后 `done` 会归零

这意味着后续所有基于本技能的汇报，默认都会变成“当前在做什么 / 还没收尾什么”，而不再把已完成任务持续堆积在表格里。

## 核心规则

| # | 规则 |
|---|------|
| 1 | 表前必须输出：`Agent并行总数：X` |
| 2 | 主表固定三列：`任务 / 模型 / 状态` |
| 3 | 模型列只放纯模型名，不混入渠道、provider 前缀、角色名 |
| 4 | 不显示 Agent 名、人设名、label、渠道前缀 |
| 5 | 主表默认只显示 active / 未完成任务 |
| 6 | 当任务总条目超过 20 时，直接刷新表格，清空已完成任务 |
| 7 | 表后必须输出：`done / timeout / blocked` 汇总 |
| 8 | 如存在再追加：`关键进展 / 风险 / 待决策项` |
| 9 | 少废话，优先结构化、稳定、可扫描 |
| 10 | 0 active 也照常输出总数、表格、汇总，不切换口径 |

## 快速使用

```js
const { renderReport, renderText, renderCard } = require('./index.js');

const tasks = [
  {
    task: 'Day2 Gap3：AEO功能质量测试与数据评测闭环 / 主实现',
    model: 'boom-writer/gpt-5.4',
    status: 'done'
  },
  {
    task: 'Day2 Gap2：全局自主决策流水线监控升级 / 主实现',
    model: 'boom-researcher/gpt-5.4',
    status: 'timeout'
  },
  {
    task: 'Day2 Gap5：回归验证与收口',
    model: 'boom-coder/gpt-5.4',
    status: 'running'
  }
];

const report = renderReport(tasks, {
  highlights: ['Gap5 回归验证仍在执行'],
  risks: ['Gap2 超时，需要重试'],
  decisions: ['是否立即补派 timeout 任务']
});
```

上例实际渲染时：
- `done` 的 Gap3 不会进入主表
- 主表只显示 `timeout` 与 `running` 等未完成项

## 文本输出模板

```md
Agent并行总数：1

| 任务 | 模型 | 状态 |
|---|---|---|
| Day2 Gap2：全局自主决策流水线监控升级 / 主实现 | gpt-5.4 | timeout |
| Day2 Gap5：回归验证与收口 | gpt-5.4 | active |

- done：0
- timeout：1
- blocked：0

关键进展
- Gap5 回归验证仍在执行

风险
- Gap2 超时，需要重试

待决策项
- 是否立即补派 timeout 任务
```

## API

### `renderReport(tasks, opts?)`

返回：

```js
{
  text: string,
  card: object,
  title: string,
  stats: object
}
```

### `renderText(tasks, opts?)`

纯文本 Markdown 输出，强制遵循统一模板。

### `renderCard(tasks, opts?)`

飞书卡片 JSON，内容与文本模板对齐。

### `computeStats(tasks)`

```js
{ total, active, done, timeout, blocked, completed, decisions, queued, other }
```

### `selectVisibleTasks(tasks, opts?)`

返回当前应进入主表的任务列表。默认规则：
- 过滤掉 `done/completed/success`
- 仅保留 active / timeout / blocked / queued / pending / waiting / needs_decision / other unfinished 项
- 若任务总数超过 `refreshThreshold`（默认 20），仍按同一口径直接刷新，只显示未完成任务

## TaskEntry Schema

```typescript
interface TaskEntry {
  task: string;            // 任务描述
  model: string;           // 模型名，可包含渠道前缀，渲染时会自动净化为纯模型名
  status: string;          // active | running | done | completed | timeout | blocked | failed ...

  // 以下字段不在主表显示，但可被上游保留
  agentId?: string;
  displayName?: string;
  agentName?: string;
  duration?: string;
  blocker?: string;
  error?: string;
  decision?: string;
  decisionOwner?: string;
}
```

## 状态归一化

- `running` / `active` / `in_progress` → `active`
- `completed` / `done` / `success` → `done`
- `blocked` / `failed` / `error` → `blocked`
- `timeout` / `timed_out` → `timeout`
- `queued` / `pending` / `waiting` 保持未完成态
- 其他状态保留原样，但仍按“未完成”对待，除非被归一化为 `done`

## 配置选项

| 选项 | 默认 | 说明 |
|------|------|------|
| `highlights` | `[]` | 关键进展列表 |
| `risks` | `[]` | 风险列表 |
| `decisions` | `[]` | 待决策项列表 |
| `title` | 自动 | 卡片标题 |
| `refreshThreshold` | `20` | 当任务条目超过该阈值时，直接刷新，只显示未完成任务 |

## 与调度技能的关系

本技能 **只做汇报渲染**。调度逻辑（任务分配、队列管理、并发控制）由调度技能负责。

## 落地约束

后续凡是复用本技能的汇报：
- 默认不得持续展示历史已完成任务
- 默认不得在任务超过 20 条后继续累积 completed 条目
- 默认应输出当前 active / 未完成视图，确保汇报聚焦“还要处理什么”
