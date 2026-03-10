# 调度技能重做报告

**日期**: 2026-03-06  
**执行者**: System Architect (opus-thinking)  
**状态**: ✅ 完成，26/26 测试通过

---

## 1. 做了什么

按用户 10 条纠偏要求，从零重建了调度技能。不是修补旧的 `dispatch-layer.js`，而是全新设计。

**核心交付：两个独立技能**

| 技能 | 路径 | 职责 |
|------|------|------|
| `multi-agent-dispatch` | `skills/public/multi-agent-dispatch/` | 纯调度：入队、派发、补位、状态机 |
| `multi-agent-reporting` | `skills/public/multi-agent-reporting/` | 纯汇报：看板、统计、格式化 (已有，不动) |

## 2. 用户纠偏 → 设计决策映射

| # | 用户要求 | 设计决策 |
|---|---------|---------|
| 1 | 调度和汇报拆两个技能 | `dispatch` 和 `reporting` 完全独立，各有 SKILL.md |
| 2 | 调度优先于解释/汇报 | SKILL.md Axiom 1: "dispatch first, explain later" |
| 3 | 确定性任务立刻入队并发出 | `enqueue()` 内部自动调用 `drain()`，无需额外 dispatch 步骤 |
| 4 | 空闲槽立刻补位 | `markDone/markFailed/cancel` 内部自动调用 `drain()` |
| 5 | 对话不中断调度 | SKILL.md 明确：conversation ≠ gate |
| 6 | 不能出现"待发"状态 | 状态机无 `pending`，只有 `queued → spawning → running → done/failed` |
| 7 | 新确定性任务即时加入 | `enqueue()` 随时可调用，立即进入调度循环 |
| 8 | 不能假并发 | `liveBoard()` 严格从实际 spawning+running maps 计数 |
| 9 | 19 路资源高利用率 | `maxSlots` 默认 19，测试验证 100% 填满 |
| 10 | 不改 gateway 核心 | 纯 workspace 技能，零 gateway 依赖 |

## 3. 架构

### 状态机

```
queued  →  spawning  →  running  →  done | failed | cancelled
  ▲            │
  │       (spawn fail → failed, slot freed → drain())
  │
  └─── enqueue() / enqueueBatch()
```

### 自动补位机制

```
任何释放槽位的操作
  → markDone() / markFailed() / cancel() / reapStale()
    → _finish()
      → drain()           ← 立即从 queue 补位
        → 如果有 onDispatch 回调 → 触发 ACP spawn
```

### 即时入队机制

```
enqueue(task)
  → makeTask() → 加入 queued map
  → drain()    ← 如果有空槽，立即移入 spawning
    → onDispatch(task) ← 触发实际 spawn
```

### 优先级调度

`critical > high > normal > low`，同级 FIFO。drain() 每次取最高优先级。

## 4. 产出文件清单

```
skills/public/multi-agent-dispatch/
├── SKILL.md                          # 技能说明（Agent 读这个）
├── dispatch-engine.js                # 核心引擎（346 行）
├── cli.js                            # CLI 入口
├── test/
│   └── dispatch-engine.test.js       # 26 个测试
├── examples/
│   └── integration.js                # 集成示例
└── state/                            # 运行时状态（自动创建）
    ├── engine-state.json
    └── live-board.json
```

## 5. API 速查

| 方法 | 说明 | 自动 drain? |
|------|------|:-----------:|
| `enqueue(input)` | 单任务入队 | ✅ |
| `enqueueBatch(inputs)` | 批量入队 | ✅ |
| `markRunning(taskId, patch)` | spawning → running | ❌ |
| `markDone(taskId, patch)` | → done, 释放槽 | ✅ |
| `markFailed(taskId, patch)` | → failed, 释放槽 | ✅ |
| `cancel(taskId)` | 取消任意状态任务 | ✅ |
| `heartbeat(taskId, patch)` | 更新进度不改状态 | ❌ |
| `drain()` | 手动填槽 | — |
| `reapStale(opts)` | 清理超时任务 | ✅ |
| `liveBoard()` | 只读快照 | ❌ |
| `allTasks()` | 全量列表(给 reporting) | ❌ |

## 6. 测试结果

```
26 passed, 26 total, 0.6s

✓ state machine lifecycle (queued→spawning→running→done/failed)
✓ enqueue === dispatch (Axiom 2)
✓ auto-backfill on done/failed/cancel (Axiom 4)
✓ 19-lane 100% utilisation (Axiom 5)
✓ accurate counts (Axiom 6)
✓ priority ordering (critical first)
✓ stale detection and auto-reap
✓ persistence across process restart
✓ onDispatch callback + failure recovery
✓ no "pending" status exists
✓ bulk operations (clearQueue, reset)
```

## 7. 与旧代码的关系

| 旧文件 | 处置 |
|--------|------|
| `infrastructure/dispatcher/dispatch-layer.js` | **保留不动**。旧的是 event-bus dispatcher 路由层，不同职责 |
| `infrastructure/dispatcher/dispatch-layer-cli.js` | 保留，与新技能无冲突 |
| `skills/public/multi-agent-reporting/` | **保留不动**。汇报技能独立存在，通过 `engine.allTasks()` 读取数据 |

新技能完全独立，零侵入。

## 8. 下一步建议

1. **主 Agent SKILL.md 更新**: 在 main agent 的技能列表中注册 `multi-agent-dispatch`
2. **实际 sessions_spawn 集成**: 在 `onDispatch` 回调中对接 `sessions_spawn`
3. **Heartbeat 集成**: subagent 结果自动回调 `markDone/markFailed`
4. **报告联动**: reporting skill 从 `engine.liveBoard()` 读数据，而非自行维护状态
