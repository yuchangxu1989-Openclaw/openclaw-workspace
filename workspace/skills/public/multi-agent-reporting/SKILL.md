---
name: multi-agent-reporting
description: 多Agent状态汇报 — 渲染实时看板，支持文本和飞书卡片双输出。纯汇报，不含调度。
version: 3.0.0
author: OpenClaw
license: MIT
tags:
  - multi-agent
  - reporting
  - live-board
  - feishu-card
---

# Multi-Agent Reporting v3

纯汇报技能。接收任务数组，输出实时看板。**与调度技能完全分离。**

## 核心规则

| # | 规则 |
|---|------|
| 1 | 主表只放进行中的任务 |
| 2 | 0 活跃时不给空表 — 补新完成、风险、待决策 |
| 3 | 标题精准描述当前并发状态，不写并发上限 |
| 4 | Agent 名用人物角色全称（`displayName`） |
| 5 | 表头：# / Agent / 任务 / 模型 / 状态 / 用时 |
| 6 | 没有"下一步"列 |
| 7 | 列宽尽量窄（模型名自动缩写） |
| 8 | 少废话，结论极短 |

## 快速使用

```js
const { renderReport, renderText, renderCard } = require('./index.js');

const tasks = [
  {
    agentId: 'writer',
    displayName: '创作大师',
    model: 'claude-opus-4-20250514',
    task: '写技术文档',
    status: 'running',
    duration: '3m12s'
  },
  // ...
];

// 统一入口 — 同时获取文本 + 卡片
const { text, card, title, stats } = renderReport(tasks);

// 或分别调用
const textBoard = renderText(tasks);
const feishuCard = renderCard(tasks);
```

## 输出示例

### 有活跃任务时

```
## 🔄 3 Agent 并行执行中 · ⚠️1风险

| # | Agent | 任务 | 模型 | 状态 | 用时 |
|---|-------|------|------|------|------|
| 1 | 创作大师 | 写文档 | opus-4 | 🔄执行 | 3m12s |
| 2 | 研究员 | 调研 | gpt-4o | 🔄执行 | 1m45s |
| 3 | 分析师 | 分析 | gem-2.5-pro | 🔄执行 | 2m03s |

**✅ 新完成 (2)**
- 架构师「系统设计」5m20s
- 测试专家「单元测试」2m10s

**⚠️ 关键风险 (1)**
- ⏸️ DBA专家「DB迁移」schema lock 未释放
```

### 0 活跃任务时

```
## ⏸️ 0 活跃 · ⚠️1风险 · ✅1完成

### ✅ 新完成 (1)

| # | Agent | 任务 | 模型 | 用时 |
|---|-------|------|------|------|
| 1 | 架构师 | 系统设计 | sonnet-4 | 5m |

**⚠️ 关键风险 (1)**
- ⏸️ DBA专家「DB迁移」schema lock

**⚖️ 待决策 (1)**
- 产品经理「选方案」Redis vs Memcached
```

## API

### `renderReport(tasks, opts?)`

统一入口。返回：

```js
{
  text: string,     // Markdown 文本看板
  card: object,     // 飞书交互卡片 JSON
  title: string,    // 动态标题
  stats: object     // 统计数据
}
```

### `renderText(tasks, opts?)`

纯文本 Markdown 输出。

### `renderCard(tasks, opts?)`

飞书交互卡片 JSON。结构：

```json
{
  "config": { "wide_screen_mode": true },
  "header": {
    "title": { "tag": "plain_text", "content": "🔄 3 Agent 并行执行中" },
    "template": "blue"
  },
  "elements": [ ... ]
}
```

卡片颜色逻辑：
- 🟠 orange — 有风险或待决策
- 🔵 blue — 有活跃任务
- 🟢 green — 全部完成
- ⚪ grey — 空/无任务

### `computeStats(tasks)`

```js
{ total, active, completed, blocked, decisions, queued, other }
```

### `classify(tasks)`

```js
{ active: [], completed: [], blocked: [], decisions: [], queued: [], other: [] }
```

### `generateTitle(stats, opts?)`

动态生成标题。

### `shortModel(model)`

缩写模型名：`claude-opus-4-20250514` → `opus-4`

### `agentName(task)`

获取 Agent 全称：优先 `displayName` → `agentName` → `agentId`

## TaskEntry Schema

```typescript
interface TaskEntry {
  agentId: string;         // Agent 标识
  displayName?: string;    // 人物角色全称（优先显示）
  agentName?: string;      // Agent 名（备选）
  model: string;           // 完整模型名
  task: string;            // 任务描述
  status: string;          // 见下方状态表
  duration?: string;       // 用时（如 "3m12s"）
  thinking?: string;       // 思考级别 "none"|"low"|"medium"|"high"
  blocker?: string;        // 阻塞原因（blocked 状态）
  error?: string;          // 错误信息（failed 状态）
  decision?: string;       // 决策问题（needs_decision 状态）
  decisionOwner?: string;  // 决策人
}
```

## 状态

| 状态 | 图标 | 简称 | 分组 |
|------|------|------|------|
| `running` | 🔄 | 执行 | 主表 |
| `completed` | ✅ | 完成 | 新完成 |
| `blocked` | ⏸️ | 阻塞 | 关键风险 |
| `failed` | ❌ | 失败 | 关键风险 |
| `needs_decision` | ⚖️ | 待决 | 待决策 |
| `pending` | ⏳ | 排队 | 排队（可选显示） |
| `queued` | ⏳ | 排队 | 排队（可选显示） |

## 配置选项

| 选项 | 默认 | 说明 |
|------|------|------|
| `title` | 自动 | 覆盖标题 |
| `showThinking` | `false` | 模型名后显示思考级别 |
| `showQueued` | `false` | 显示排队中的任务 |
| `maxCompletedInline` | `5` | 有活跃时，完成列表最大行数 |
| `maxCompletedTable` | `10` | 0 活跃时，完成表格最大行数 |
| `maxCompletedInCard` | `5` | 卡片中完成列表最大行数 |

## CLI

```bash
node live-board-cli.js tasks.json          # 文本输出
node live-board-cli.js tasks.json --card   # 飞书卡片 JSON
node live-board-cli.js tasks.json --json   # 完整结构
```

## 与调度技能的关系

本技能 **只做渲染**。调度逻辑（任务分配、队列管理、并发控制）由调度技能负责。

### 手动调用

调度技能产出任务状态数组 → 本技能渲染为看板。

```
调度器 → tasks[] → renderReport() → { text, card }
```

### 自动触发（ReportTrigger）

`report-trigger.js` 是调度引擎和汇报渲染的桥接层。**调度事件即汇报触发器**：

```js
const { DispatchEngine } = require('../multi-agent-dispatch/dispatch-engine');
const { ReportTrigger } = require('./report-trigger');

const engine = new DispatchEngine({ maxSlots: 19 });
const trigger = new ReportTrigger(engine, {
  agentRegistry: {
    writer: '创作大师',
    coder: '开发工程师',
    analyst: '洞察分析师',
    // ...
  },
  onReport: ({ text, card, title, stats, event }) => {
    // event: 'dispatched' | 'running' | 'finished' | 'manual'
    console.log(`[${event}] ${title}`);
    // 发送飞书卡片、更新看板等
  },
});

// 以下操作会自动触发汇报：
engine.enqueue({ ... });         // → dispatched
engine.markRunning(taskId);      // → running
engine.markDone(taskId);         // → finished
engine.markFailed(taskId);       // → finished

// 手动刷新：
const report = trigger.buildReport('manual');
```

触发规则：
| 事件 | 触发时机 |
|------|----------|
| `dispatched` | 任务入队并分配到槽位 |
| `running` | spawn 确认，任务开始执行 |
| `finished` | 完成/失败/取消，槽位释放 |

### Agent 名称注册

内置注册表（可覆盖）：

| agentId | displayName |
|---------|-------------|
| `main` | 战略家 |
| `writer` | 创作大师 |
| `coder` | 开发工程师 |
| `analyst` | 洞察分析师 |
| `researcher` | 系统架构师 |
| `reviewer` | 质量仲裁官 |
| `scout` | 情报专家 |

运行时更新：`trigger.updateRegistry({ myAgent: '我的Agent' })`

## License

MIT
