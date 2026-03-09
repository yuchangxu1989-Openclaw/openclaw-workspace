---
name: multi-agent-reporting
description: >
  多Agent任务看板汇报 — 飞书交互卡片(table组件) + 中文任务名 + 最新在前排序 + 直推飞书。
  读取 subagent-task-board.json，输出飞书卡片或JSON/文本格式。
version: 5.0.0
author: OpenClaw
license: MIT
tags:
  - multi-agent
  - reporting
  - feishu-card
  - task-board
---

# Multi-Agent Reporting v5.0.0

任务看板汇报技能。读取 `subagent-task-board.json`，输出飞书交互卡片（原生 table 组件）。

## What's New in v5.0

- **飞书交互卡片输出** — 使用飞书原生 `table` 组件，替代老的文本/markdown模板
- **中文任务名优先** — 优先显示 `description` 字段（中文名），回退到 `label`
- **最新在前排序** — 按 `spawnTime` 倒序，最新任务在最上面
- **直推飞书** — `push-feishu-board.sh` 脚本自行获取 token 并推送，不依赖主 Agent

## 核心脚本

### `register-task.sh`

任务登记脚本（写入/更新 `subagent-task-board.json` 的运行中任务项），用于在任务启动时注册：

```bash
bash register-task.sh "task-id" "label" "agent-id" "model"
```

### `update-task.sh`

任务状态更新脚本，用于将任务从 `running` 更新为 `done/failed/timeout` 等状态，并记录完成时间、摘要等信息：

```bash
bash update-task.sh "label" "done" "结果摘要"
```

### `completion-handler.sh`

任务完成处理入口脚本，封装任务完成后的状态落盘、摘要记录与后续处理流程：

```bash
bash completion-handler.sh "label" "done" "结果摘要"
```

### `show-task-board.sh`

任务看板文本输出脚本，读取任务板并输出简洁可扫描的文本看板：

```bash
bash show-task-board.sh
```

### `show-task-board-feishu.sh`

生成看板数据，支持两种模式：

```bash
# 文本模式（默认）— markdown表格
bash show-task-board-feishu.sh

# JSON模式 — 供飞书卡片table组件使用
bash show-task-board-feishu.sh --json

# 显示全部任务（默认只显示running + 最近5条completed）
bash show-task-board-feishu.sh --all
```

JSON输出格式：
```json
{
  "rows": [{"task":"任务名","model":"模型","status":"🟢运行中","duration":"3m20s"}, ...],
  "running": 5,
  "done": 30,
  "failed": 2,
  "summary": "done=30 / failed=2 / running=5"
}
```

### `push-feishu-board.sh`

生成看板 + 直接推送飞书交互卡片：

```bash
bash push-feishu-board.sh
```

卡片结构：
- 蓝色标题头：📋 Agent任务看板
- markdown组件：Agent并行总数
- **table组件**：任务/模型/状态/耗时 四列
- 底部汇总

## 核心规则

| # | 规则 |
|---|------|
| 1 | 表前输出 `Agent并行总数：X` |
| 2 | 主表固定列：`任务 / 模型 / 状态 / 耗时` |
| 3 | 模型列只放纯模型名，不含渠道前缀 |
| 4 | 任务列优先用 `description`（中文名） |
| 5 | 按 `spawnTime` 倒序排列 |
| 6 | 默认只显示 running + 最近5条 completed |
| 7 | 表后输出 `done / failed / running` 汇总 |
| 8 | 飞书卡片使用原生 table 组件 |
| 9 | 少废话，结构化、可扫描 |

## 数据源

读取 `/root/.openclaw/workspace/logs/subagent-task-board.json`，每条记录包含：
- `taskId`, `label`, `description`（中文名）, `agentId`, `model`
- `status`: running / done / failed / timeout
- `spawnTime`, `completeTime`, `result_summary`

## JS API（兼容）

```js
const { renderReport, renderText, renderCard } = require('./index.js');
const { renderBoardReport, renderBoardFromFile } = require('./board-report.js');
```

旧的 JS API 仍可用，但推荐使用 shell 脚本 + 飞书卡片方式。
