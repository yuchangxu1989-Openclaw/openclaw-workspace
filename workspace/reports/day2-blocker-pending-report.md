# Day2 Blocker: 239条 pending dispatched 清理报告

**生成时间:** 2026-03-05 09:xx CST  
**执行人:** day2-blocker-pending 子Agent  
**状态:** ✅ 完成 — pending_execution 归零

---

## TL;DR

239条 pending_execution 记录全部处理完毕：
- 1条重放执行（memory-archiver handler）
- 236条归档（ISC事件幂等归档 / 过期清理）
- 2条已完成归档
- 新增防堆积机制：dispatcher每次运行自动清理>24h的stale记录

---

## 问题根因分析

### 为什么会有239条 pending_execution？

Dispatcher在 `resolveHandler()` 找不到可执行handler函数时，会把dispatch记录写入 `infrastructure/dispatcher/dispatched/` 目录（文件式分发机制）。

**根本原因：** routes.json 里的别名映射（`dto-sync` → `skill-dto-handler`）在旧版本中，dispatcher用的是原始handler名（`dto-sync`），而 `handlers/` 目录里没有 `dto-sync.js` 文件。结果每次有 `isc.rule.*` 事件，都会写一个 `pending_execution` 文件，但没有任何东西消费它们。

### 澄清：文件式分发 ≠ 执行失败

`pending_execution` 状态的文件是dispatcher的**意向记录**，不是真正的执行失败。dispatcher写文件就算完成了dispatch。但由于没有消费者读这些文件来真正执行handler，导致文件持续堆积。

---

## 记录分布分析

| 状态 | 数量 |
|------|------|
| pending_execution | 194 |
| pending | 43 |
| completed | 2 |
| **总计** | **239** |

### Handler分布

| Handler | 数量 | 说明 |
|---------|------|------|
| dto-sync | 215 | ISC规则变更触发的DTO同步（别名，旧bug产物） |
| seef-optimize | 6 | SEEF优化 |
| cras-ingest | 5 | CRAS知识摄取 |
| isc-feedback | 4 | ISC反馈循环 |
| aeo-retry | 3 | AEO重试 |
| dto-orchestrate | 3 | DTO编排 |
| memory-archiver | 1 | 架构变更归档 |
| unknown.event | 1 | 未知事件（测试产物） |
| test-success | 1 | 测试产物 |

### 时间分布

| 年龄段 | 数量 |
|--------|------|
| >24h（过期） | 27 |
| <24h（近期） | 212 |

---

## 执行结果

| 操作 | 数量 | 理由 |
|------|------|------|
| **重放执行** | 1 | `memory-archiver` handler可执行，成功写入 architecture-changelog.md |
| **归档（ISC幂等）** | 207 | isc.rule.* 事件是幂等的，ISC规则已经直接apply，这些记录无需重放 |
| **归档（过期>24h）** | 27 | 超过24小时，业务上已无意义 |
| **归档（无效/测试）** | 2 | unknown.event / test-success 测试产物 |
| **归档（已完成）** | 2 | 原已completed状态 |
| **总计** | **239** | |

**归档目录:** `infrastructure/dispatcher/dispatched-archive/2026-03-05/`

---

## 验证

```
清理后 dispatched/ 文件数: 0
归档文件数: 239
```

✅ pending_execution 数量: **0**

---

## 防堆积机制

### 新增文件

**`infrastructure/dispatcher/archive-stale-pending.js`**

独立模块，扫描 `dispatched/` 目录，将超过 `maxAgeHours`（默认24h）的 pending 记录自动归档。

```js
const { archiveStalePending } = require('./archive-stale-pending');
archiveStalePending({ maxAgeHours: 24, dryRun: false });
// → { archived: N, skipped: M, errors: [] }
```

### 集成到 dispatcher.js

dispatcher每次 `main()` 运行时，**自动调用** `archiveStalePending()`，在处理新事件之前先清理stale记录：

```
[Dispatcher] Auto-archived N stale pending record(s) (>24h)
```

非fatal：如果清理失败，dispatcher继续正常运行（warn日志）。

---

## 后续建议

1. **监控指标**: 可在 observability/metrics 中添加 `dispatched_pending_count` 指标，监控是否再次堆积
2. **handler可执行化**: 当前 `dto-sync`、`seef-optimize`、`cras-ingest`、`isc-feedback` 等handler只有routes别名，没有实际执行逻辑。后续如需真正执行，需要在 `handlers/` 目录补充对应JS文件
3. **debt-p0-quickfix验证**: routes.json别名已修复，下次dispatcher运行应能正确路由 `isc.rule.*` 到 `skill-isc-handler`

---

## 文件变更清单

| 文件 | 操作 |
|------|------|
| `infrastructure/dispatcher/dispatched/*.json` (239个) | 全部移入 dispatched-archive/2026-03-05/ |
| `infrastructure/dispatcher/archive-stale-pending.js` | **新增** 防堆积模块 |
| `infrastructure/dispatcher/dispatcher.js` | **修改** 集成auto-archive调用 |
| `memory/architecture-changelog.md` | 追加一条归档记录（memory-archiver重放） |
