---
name: multi-agent-reporting
description: 多Agent状态汇报 — 统一输出“当前active总数 + 任务/模型/状态表 + done/timeout/blocked汇总”，并可追加关键进展/风险/待决策项。纯汇报，不含调度。
version: 3.1.0
author: OpenClaw
license: MIT
tags:
  - multi-agent
  - reporting
  - live-board
  - feishu-card
---

# Multi-Agent Reporting v3.1

纯汇报技能。接收任务数组，输出稳定统一的状态汇报。**与调度技能完全分离。**

## 核心规则

| # | 规则 |
|---|------|
| 1 | 表前必须输出：`当前 active 总数：X` |
| 2 | 主表固定三列：`任务 / 模型 / 状态` |
| 3 | 模型列只放纯模型名，不混入渠道、provider 前缀、角色名 |
| 4 | 不显示 Agent 名、人设名、label、渠道前缀 |
| 5 | 表后必须输出：`done / timeout / blocked` 汇总 |
| 6 | 如存在再追加：`关键进展 / 风险 / 待决策项` |
| 7 | 少废话，优先结构化、稳定、可扫描 |
| 8 | 0 active 也照常输出总数、表格、汇总，不切换口径 |

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
  }
];

const report = renderReport(tasks, {
  highlights: ['Gap3 主闭环脚本与 gate handler 已落地'],
  risks: ['Gap3 当前 gate 仍 BLOCKED / CONDITIONAL_PASS'],
  decisions: ['是否立即并行派发 Gap3 benchmark 路径修复 + E2E 剩余 3 case 修复']
});
```

## 文本输出模板

```md
当前 active 总数：0

| 任务 | 模型 | 状态 |
|---|---|---|
| Day2 Gap3：AEO功能质量测试与数据评测闭环 / 主实现 | gpt-5.4 | done |
| Day2 Gap2：全局自主决策流水线监控升级 / 主实现 | gpt-5.4 | timeout |

- done：1
- timeout：1
- blocked：0

关键进展
- Gap3 主闭环脚本与 gate handler 已落地

风险
- Gap3 当前 gate 仍 BLOCKED / CONDITIONAL_PASS

待决策项
- 是否立即并行派发 Gap3 benchmark 路径修复 + E2E 剩余 3 case 修复
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

- `running` / `active` → `active`
- `completed` / `done` → `done`
- `blocked` / `failed` → `blocked`
- `timeout` → `timeout`
- 其他状态保留原样

## 配置选项

| 选项 | 默认 | 说明 |
|------|------|------|
| `highlights` | `[]` | 关键进展列表 |
| `risks` | `[]` | 风险列表 |
| `decisions` | `[]` | 待决策项列表 |
| `title` | 自动 | 卡片标题 |

## 与调度技能的关系

本技能 **只做汇报渲染**。调度逻辑（任务分配、队列管理、并发控制）由调度技能负责。
