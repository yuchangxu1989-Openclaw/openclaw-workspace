# P1-1 实施报告：JSONL 事件总线 + Cron 调度器

> **状态**: ✅ 完成  
> **日期**: 2026-03-03  
> **提交**: `76e10d5` feat(P1-1): implement JSONL event bus + cron dispatcher

---

## 交付物

### 1. 事件总线 (`infrastructure/event-bus/`)

| 文件 | 说明 |
|:-----|:-----|
| `bus.js` | 核心模块，350行，零外部依赖 |
| `events.jsonl` | 事件日志（append-only） |
| `cursor.json` | 消费者游标 |
| `test-bus.js` | 25 个单元测试 |
| `README.md` | 完整文档 |

**API 摘要：**

```javascript
const bus = require('./bus.js');

bus.emit(type, payload, source)       // 发布事件
bus.consume(consumerId, { types })    // 消费未确认事件
bus.ack(consumerId, eventId)          // 确认消费
bus.history({ type, since, source })  // 查询历史
bus.stats()                           // 总线统计
bus.purge()                           // 清空（测试用）
```

**关键特性：**
- PID 文件锁防并发（`O_CREAT | O_EXCL` 原子操作 + 死锁进程检测）
- 10MB 自动轮转归档
- 通配符匹配（`isc.rule.*` 匹配 `isc.rule.created`/`isc.rule.updated` 等）
- 多消费者独立游标（Consumer A 的 ack 不影响 Consumer B）
- 幂等 ack（重复确认安全）
- 完整错误处理（参数校验、腐坏行跳过、锁超时）

### 2. 调度器 (`infrastructure/dispatcher/`)

| 文件 | 说明 |
|:-----|:-----|
| `dispatcher.js` | 核心调度，200行 |
| `routes.json` | 9 条路由规则 |
| `README.md` | 使用文档 |

**路由表覆盖：**

| 事件模式 | 处理器 | 优先级 |
|:---------|:-------|:-------|
| `isc.rule.*` | dto-sync | high |
| `dto.sync.*` | dto-orchestrate | high |
| `aeo.assessment.completed` | cras-ingest | normal |
| `aeo.assessment.failed` | aeo-retry | high |
| `seef.skill.evaluated` | seef-optimize | normal |
| `seef.skill.optimized` | cras-ingest | normal |
| `cras.insight.generated` | isc-feedback | normal |
| `system.error` | system-alert | high |
| `system.health` | system-monitor | low |

**调度特性：**
- 优先级排序分发（high → normal → low）
- `--dry-run` 模式预览
- `--type` 过滤特定事件类型
- 自动写心跳到 `observability/heartbeats.json`
- 无路由事件自动 ack 避免积压

### 3. 测试结果

```
🧪 Event Bus Unit Tests
  ✅ emit: creates event with correct structure
  ✅ emit: persists event to JSONL file
  ✅ emit: appends multiple events
  ✅ emit: throws on missing type
  ✅ emit: defaults source to "unknown"
  ✅ consume: returns all unconsumed events
  ✅ consume: filters by type pattern
  ✅ consume: respects limit
  ✅ consume: returns empty after all acked
  ✅ consume: different consumers see same events
  ✅ consume: throws on missing consumerId
  ✅ ack: marks event as consumed
  ✅ ack: idempotent - double ack is safe
  ✅ ack: different consumers tracked separately
  ✅ ack: throws on missing params
  ✅ history: returns all events
  ✅ history: filters by type pattern
  ✅ history: filters by since timestamp
  ✅ history: filters by source
  ✅ matchType: exact match
  ✅ matchType: wildcard match
  ✅ matchType: star matches everything
  ✅ stats: returns correct counts
  ✅ purge: clears all events and cursors
  ✅ integration: full emit → consume → ack lifecycle
📊 Results: 25/25 passed, 0 failed
```

---

## 设计决策说明

| 决策点 | 选择 | 理由 |
|:-------|:-----|:-----|
| 并发控制 | PID 文件锁 | 零依赖，Node.js 原生 `fs.openSync(O_EXCL)` 原子操作 |
| 事件存储 | 单 JSONL 文件 | 简单 append-only，`cat`/`grep` 即可调试 |
| 消费确认 | 双写（JSONL + cursor） | JSONL 中的 `consumed_by` 保证完整性，cursor 加速过滤 |
| 游标管理 | JSON 文件 | 每个消费者独立 offset + acked 列表，轮转时自动重置 |
| 调度器执行 | 写 dispatched/*.json | 当前阶段记录分发意图，P1-2 阶段接入 `sessions_spawn` 真实执行 |

## 后续集成点

1. **T1.2 (Cron 注册)**: 将 `dispatcher.js` 注册为 OpenClaw Cron 任务（每 5 分钟）
2. **T1.3 (DTO 改造)**: DTO 调度器改为调用 `bus.emit()` 发布事件
3. **T1.4 (SEEF)**: SEEF evaluator 完成后 emit `seef.skill.evaluated`
4. **各模块集成**: `require('../infrastructure/event-bus/bus.js')` 即可使用
