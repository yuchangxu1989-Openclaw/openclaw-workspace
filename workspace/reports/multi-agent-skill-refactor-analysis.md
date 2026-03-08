# Multi-Agent Dispatch & Reporting 技能重构分析报告

**日期：** 2026-03-08
**作者：** 开发工程师

## 一、现状分析

### 1.1 multi-agent-dispatch 当前能力

- ✅ 完整的状态机：`queued → spawning → running → done/failed/cancelled`
- ✅ 19-lane 并发调度，优先级排序，自动回填
- ✅ 持久化状态文件 `engine-state.json`（含 `finished[]`，capped 500）
- ✅ 活跃看板文件 `live-board.json`（仅实时快照，无历史）
- ✅ 超时检测 + 自动 reap + timeout 决策（restart/replace/split/archive/handoff）
- ✅ 跨角色 key 借用
- ✅ CLI 工具链
- ✅ 事件发射 (`dispatched`, `running`, `finished`)

**缺失：**
- ❌ 无结构化历史查询 API（`finished[]` 是 flat array，无索引、无按时间/状态/任务过滤）
- ❌ 无 task board 登记概念（任务一完成就只在 finished 数组里，没有 "task board" 视角）
- ❌ 无自动汇总触发（完成 N 个任务后自动生成汇总报告）
- ❌ 无任务组/批次概念（无法查询"这批任务整体进度"）

### 1.2 multi-agent-reporting 当前能力

- ✅ 纯渲染层：接收 task array → 输出 text/card/HTML
- ✅ 状态归一化
- ✅ 10 分钟 done TTL（超时从实时视图隐藏）
- ✅ `report-trigger.js` 桥接 dispatch engine 事件
- ✅ `global-progress.js` 周期性全局进展摘要

**缺失：**
- ❌ 零持久化 — 纯函数，不记录任何历史
- ❌ 无历史汇报模式（无法查 "过去 2 小时完成了什么"）
- ❌ 10 分钟后 done 任务彻底消失，无法追溯
- ❌ 无 ISC-REPORT-SUBAGENT-BOARD-001 标准格式

### 1.3 关键能力缺口对照

| 能力 | dispatch | reporting | 需要 |
|------|----------|-----------|------|
| 任务登记 | ✅ enqueue | ❌ | ✅ |
| 实时状态追踪 | ✅ state machine | ✅ 渲染 | ✅ |
| 持久化历史 | ⚠️ finished[] 有但弱 | ❌ | ✅ 强化 |
| 历史查询 | ❌ | ❌ | ✅ 新增 |
| 自动汇总 | ❌ | ⚠️ global-progress 有但弱 | ✅ 强化 |
| 格式化输出 | ❌ | ✅ | ✅ |
| ISC 标准格式 | ❌ | ❌ | ✅ 新增 |

## 二、设计决策

### 2.1 合并 vs 拆分

**决策：保持拆分，增加共享持久化层。**

理由：
1. 职责清晰：dispatch = 调度引擎（状态机 + 队列 + 生命周期），reporting = 渲染引擎（格式化 + 展示）
2. dispatch 已经有完整的持久化基础（`engine-state.json`），只需增强查询能力
3. reporting 作为纯渲染层独立性好，可以被其他技能复用
4. 合并会导致单个技能过于臃肿（dispatch-engine.js 已经 600+ 行）

**新增共享层：task-board.js**
- 位于 dispatch 目录，提供结构化的 task board 查询 API
- reporting 通过读取 board 文件或直接 require 获取数据

### 2.2 边界划分

- **dispatch** 负责：任务登记、状态机、持久化、历史存储、自动汇总触发、task board 维护
- **reporting** 负责：数据渲染、格式化输出、ISC 标准格式、飞书卡片、HTML 看板
- **共享**：task board JSON schema、状态归一化规则

## 三、核心数据模型

### 3.1 Task Board Schema

```json
{
  "version": 1,
  "updatedAt": "ISO8601",
  "boardId": "board_<timestamp>",
  "summary": {
    "maxSlots": 19,
    "occupied": 5,
    "free": 14,
    "queued": 3,
    "totalRegistered": 42,
    "totalCompleted": 30,
    "totalFailed": 2,
    "totalCancelled": 1
  },
  "active": [TaskRecord],
  "queued": [TaskRecord],
  "history": [TaskRecord],
  "batches": {
    "batch_xxx": {
      "batchId": "batch_xxx",
      "label": "Day2 实现批次",
      "createdAt": "ISO8601",
      "taskIds": ["t_1", "t_2"],
      "status": "in_progress",
      "completedCount": 1,
      "totalCount": 5
    }
  },
  "autoSummaries": [
    {
      "triggeredAt": "ISO8601",
      "trigger": "batch_complete | threshold_reached | manual",
      "stats": {},
      "highlights": []
    }
  ]
}
```

### 3.2 关键流程

```
用户请求 → dispatch.enqueue() → 任务登记到 board
                                → 自动 drain → spawn
                                → markRunning → board 更新
                                → markDone/Failed → board 更新 + 历史归档
                                → 检查汇总触发条件
                                    → 达标 → 生成 autoSummary
                                    → reporting.renderReport() 输出
```

### 3.3 持久化方案

**JSON 文件**（不用 SQLite）。理由：
- 数据量小（百级任务，不是万级）
- 无需复杂查询（按时间范围 + 状态过滤足够）
- 与现有 engine-state.json 方案一致
- 零依赖，技能开箱即用

文件结构：
- `state/engine-state.json` — 引擎核心状态（已有）
- `state/live-board.json` — 实时看板快照（已有）
- `state/task-board.json` — **新增** 完整 task board（含历史）
- `state/summaries/` — **新增** 自动汇总历史目录

### 3.4 自动汇总触发条件

1. **批次完成**：一个 batch 中所有任务完成
2. **阈值触发**：每完成 N 个任务（默认 5）生成一次汇总
3. **时间触发**：距上次汇总超过 30 分钟且有新完成任务
4. **手动触发**：CLI `node cli.js summary`

### 3.5 ISC-REPORT-SUBAGENT-BOARD-001 标准

```
═══ SUBAGENT TASK BOARD ═══

Board: <boardId> | Updated: <timestamp>
Slots: <occupied>/<maxSlots> occupied | <queued> queued

── ACTIVE ──────────────────
#1  [running]  任务标题  model  HH:MM
#2  [spawning] 任务标题  model  HH:MM

── QUEUED ──────────────────
#3  [queued]   任务标题  model  priority

── SUMMARY ─────────────────
done: N | failed: N | cancelled: N | timeout: N
Total registered: N | Uptime: Xh Ym

── HIGHLIGHTS ──────────────
- 关键进展 1
- 关键进展 2

── RISKS ───────────────────
- 风险 1

═══ END BOARD ═══
```

## 四、实现计划

1. dispatch 新增 `task-board.js` — task board 持久化 + 查询 API
2. dispatch 修改 `dispatch-engine.js` — 集成 task board 写入 + 汇总触发
3. dispatch 更新 SKILL.md — 文档化新能力
4. reporting 新增 ISC board 格式 — `renderBoardReport()` 
5. reporting 新增历史模式 — `renderHistory()`
6. reporting 更新 SKILL.md — 文档化新能力
