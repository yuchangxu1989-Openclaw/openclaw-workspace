# D2-07: Cron 轮询 → 事件驱动迁移报告

> **日期**: 2026-03-05  
> **状态**: ✅ 实现完成，测试通过  
> **验收**: 15/15 测试全部通过  

---

## TL;DR

将4个核心cron任务从定时轮询迁移到"事件触发 + cron兜底"双模式。实现了4个fs.watch监听器 + 4个cron check-and-skip适配器 + 统一守护进程。事件到达→立即处理，cron定时扫描→检查是否已处理→跳过或兜底执行。全局自主决策流水线报告格式完全重构为语义化分类。

---

## 架构变更

### 迁移前（纯轮询）

```
┌─────────────────────────────────────────┐
│                 Cron Scheduler           │
│                                          │
│  */5  → event-dispatcher（全量扫描）      │
│  */15 → ISC变更检测（hash比对）           │
│  */30 → 全局决策流水线（git status扫描）   │
│  0 *  → DTO-AEO（无条件执行）             │
└─────────────────────────────────────────┘
```

**问题**：最坏延迟=cron周期。ISC规则变了要等15分钟才检测到。

### 迁移后（事件驱动 + cron兜底）

```
                    ┌──────────────────────┐
                    │  Event Watcher Daemon │
                    │  (单进程，4个watcher)  │
                    └──────────┬───────────┘
                               │
        ┌──────────┬───────────┼───────────┬──────────┐
        │          │           │           │          │
        ▼          ▼           ▼           ▼          │
  ┌─────────┐┌─────────┐┌──────────┐┌──────────┐     │
  │ISC Rules ││DTO Sigs ││EventBus  ││Git Change│     │
  │fs.watch  ││fs.watch  ││fs.watch  ││fs.watch  │     │
  └────┬─────┘└────┬─────┘└────┬─────┘└────┬─────┘     │
       │           │           │           │          │
       ▼           ▼           ▼           ▼          │
  ┌─────────────────────────────────────────────┐     │
  │              EventBus (bus.js)               │     │
  │  isc.rule.changed | dto.signal.created |    │     │
  │  file.changed.* events                      │     │
  └──────────────────────┬──────────────────────┘     │
                         │                            │
              ┌──────────┼──────────┐                 │
              ▼          ▼          ▼                 │
         Dispatcher   Handlers   Routes               │
                                                      │
  ┌───────────────────────────────────────────────┐   │
  │           Cron Adapters (兜底)                  │   │
  │  check-and-skip: 事件已处理? → 跳过 : 执行     │◄──┘
  └───────────────────────────────────────────────┘
```

---

## 实现清单

### 新增文件 (12个)

| 文件 | 用途 |
|------|------|
| `infrastructure/event-driven/cron-check-skip.js` | 共享check-and-skip逻辑，状态持久化 |
| `infrastructure/event-driven/event-watcher-daemon.js` | 统一守护进程，管理所有watcher |
| `infrastructure/event-driven/watchers/isc-rules-watcher.js` | ISC rules/目录 fs.watch |
| `infrastructure/event-driven/watchers/dto-signals-watcher.js` | .dto-signals/目录 fs.watch |
| `infrastructure/event-driven/watchers/eventbus-file-watcher.js` | events.jsonl文件变更 → 触发dispatcher |
| `infrastructure/event-driven/watchers/git-change-watcher.js` | 工作区多目录监听 + 变更分类 |
| `infrastructure/event-driven/cron-adapters/event-dispatcher-adapter.js` | event-dispatcher cron适配器 |
| `infrastructure/event-driven/cron-adapters/isc-detect-adapter.js` | ISC变更检测 cron适配器 |
| `infrastructure/event-driven/cron-adapters/global-pipeline-adapter.js` | 全局决策流水线 cron适配器 |
| `infrastructure/event-driven/cron-adapters/dto-aeo-adapter.js` | DTO-AEO cron适配器 |
| `infrastructure/event-driven/tests/verify-migration.js` | 验收测试 (15 cases) |
| `infrastructure/event-driven/state/` | 运行时状态目录 |

### 修改文件 (1个)

| 文件 | 变更 |
|------|------|
| `infrastructure/dispatcher/routes.json` | 新增 dto.signal.created / file.changed / file.changed.* 路由 |

---

## 4个核心任务迁移详情

### 1. Event Dispatcher (*/5min)

| 维度 | 迁移前 | 迁移后 |
|------|--------|--------|
| **触发方式** | 每5分钟cron执行fast-check + dispatcher | events.jsonl变更→fs.watch→立即触发L3 Pipeline |
| **延迟** | 0~5分钟 | ~3秒（debounce） |
| **cron角色** | 唯一执行路径 | 兜底：检查事件驱动是否遗漏 |
| **跳过条件** | fast-check检查cursor | check-and-skip: 10分钟内有事件触发则跳过 |

**实现**：`eventbus-file-watcher.js` 监听 `event-bus/` 目录，检测到 events.jsonl 大小增长后验证是否有未消费事件，3秒debounce后直接调用 `l3-pipeline.runOnce()`。

### 2. ISC变更检测 (*/15min)

| 维度 | 迁移前 | 迁移后 |
|------|--------|--------|
| **触发方式** | 每15分钟cron执行event-bridge.js | rules/目录变更→fs.watch→立即emit isc.rule.changed |
| **延迟** | 0~15分钟 | ~2秒（debounce） |
| **cron角色** | 唯一执行路径 | 兜底：30分钟内有事件触发则跳过 |
| **跳过条件** | 无（每次都全量hash） | check-and-skip + hash比对 |

**实现**：`isc-rules-watcher.js` 用 `fs.watch(RULES_DIR)` 监听JSON文件变更。检测到变更后：
1. 立即 emit `isc.rule.changed` 快速通知
2. 调用 `event-bridge.publishChangesWithSummary()` 完成 hash 比对和细粒度事件
3. 标记事件触发，cron下次扫描自动跳过

### 3. 全局自主决策流水线 (*/30min) — 完全重构

| 维度 | 迁移前 | 迁移后 |
|------|--------|--------|
| **触发方式** | 每30分钟全量git status | 多目录fs.watch→变更分类→按类型emit |
| **延迟** | 0~30分钟 | ~5秒（debounce） |
| **报告格式** | "检测到变更N项+版本递增" | 语义化分类报告（见下方） |
| **cron角色** | 唯一执行路径 | 兜底：60分钟内有事件触发且无新变更则跳过 |

**报告格式重构**：

旧格式：
```
检测到3项变更，版本递增至v1.2.3
```

新格式：
```json
{
  "total_changes": 3,
  "summary": "检测到3项变更：代码变更1项，配置变更1项，文档变更1项",
  "categories": {
    "code": {
      "label": "代码变更",
      "count": 1,
      "files": [{"path": "skills/isc-core/event-bridge.js", "git_status": "M"}],
      "actions": ["version-bump", "lint-check"]
    },
    "config": {
      "label": "配置变更",
      "count": 1,
      "files": [{"path": "skills/isc-core/rules/N001.json", "git_status": "M"}],
      "actions": ["config-sync", "validation"]
    }
  },
  "semantic_insights": [
    {
      "type": "infrastructure-change",
      "message": "1个基础设施变更，建议运行集成测试",
      "severity": "high"
    }
  ],
  "recommended_actions": ["integration-test", "dto-sync"]
}
```

**变更分类规则**：

| 分类 | 匹配模式 | 动作 |
|------|---------|------|
| code (代码) | `.js/.ts/.py/.sh` in `skills/`, `infrastructure/`, `scripts/` | version-bump, lint-check |
| config (配置) | `.json/.yaml/.yml` in `rules/`, `config/`, `dispatcher/` | config-sync, validation |
| log (日志) | `.log/.jsonl` in `logs/`, `event-bus/data/` | log-rotate, alert-check |
| data (数据) | `.jsonl/.csv` in `memory/`, `reports/`, `.dto-signals/` | data-archive |
| doc (文档) | `.md` in `skills/`, `designs/` | doc-index |

**事件类型**：
- `file.changed` — 总体变更事件（含分类摘要）
- `file.changed.code` — 代码变更
- `file.changed.config` — 配置变更
- `file.changed.log` — 日志变更
- `file.changed.data` — 数据变更
- `file.changed.doc` — 文档变更

### 4. DTO-AEO流水线 (每小时)

| 维度 | 迁移前 | 迁移后 |
|------|--------|--------|
| **触发方式** | 每小时无条件执行event-bridge.js | .dto-signals/目录新文件→fs.watch→立即emit dto.signal.created |
| **延迟** | 0~60分钟 | ~1.5秒（debounce） |
| **cron角色** | 唯一执行路径 | 兜底：2小时内有事件触发且无新信号则跳过 |
| **信号文件** | 无生命周期管理 | 处理后移入 .processed/ 子目录 |

**实现**：`dto-signals-watcher.js` 监听 `.dto-signals/` 目录。检测到新文件后：
1. 读取信号文件内容
2. emit `dto.signal.created` 事件
3. 调用 `dto-core/event-bridge.processEvents()` 消费事件队列
4. 将已处理信号文件移入 `.dto-signals/.processed/`
5. 标记事件触发

---

## 验收测试结果

```
🧪 Event-Driven Migration Verification Tests

── Suite 1: Check-and-Skip 逻辑 ──
  ✅ T1.1: 无事件触发记录时不跳过
  ✅ T1.2: 事件触发后cron应跳过
  ✅ T1.3: cron执行后不再跳过
  ✅ T1.4: 有新变更时不跳过（即使事件已触发）

── Suite 2: ISC 事件发布 ──
  ✅ T2.1: emit isc.rule.changed 事件可被消费
  ✅ T2.2: ISC变更检测在事件触发后cron跳过

── Suite 3: DTO Signals 事件发布 ──
  ✅ T3.1: emit dto.signal.created 事件可被消费
  ✅ T3.2: DTO-AEO在事件触发后cron跳过

── Suite 4: File Change 分类 ──
  ✅ T4.1: classifyChange 正确分类代码文件
  ✅ T4.2: classifyChange 正确分类配置文件
  ✅ T4.3: classifyChange 正确分类日志文件
  ✅ T4.4: generateChangeReport 生成结构化报告

── Suite 5: Event Dispatcher Check-and-Skip ──
  ✅ T5.1: Event Dispatcher 在事件触发后cron跳过

── Suite 6: 路由表完整性 ──
  ✅ T6.1: routes.json 包含新事件路由

── Suite 7: 状态持久化 ──
  ✅ T7.1: getAllState 返回完整状态

通过: 15 | 失败: 0
```

---

## 部署步骤

### Phase 1: 启动守护进程

```bash
# 启动事件驱动守护进程（后台运行）
nohup node infrastructure/event-driven/event-watcher-daemon.js > /dev/null 2>&1 &

# 检查状态
node infrastructure/event-driven/event-watcher-daemon.js --status
```

### Phase 2: 切换 Cron 任务到适配器

将现有 cron message 中的命令替换为对应适配器：

| 原命令 | 新命令 |
|--------|--------|
| `node fast-check.js && ...` | `node infrastructure/event-driven/cron-adapters/event-dispatcher-adapter.js` |
| `node isc-core/event-bridge.js` | `node infrastructure/event-driven/cron-adapters/isc-detect-adapter.js` |
| 全局决策流水线脚本 | `node infrastructure/event-driven/cron-adapters/global-pipeline-adapter.js` |
| `node dto-core/event-bridge.js` | `node infrastructure/event-driven/cron-adapters/dto-aeo-adapter.js` |

### Phase 3: 验证

```bash
# 手动触发 ISC 变更 → 应立即响应
echo '{"id":"test","name":"test rule"}' > skills/isc-core/rules/test-verify.json
# 查看 watcher 日志确认立即处理

# 手动创建 DTO 信号 → 应立即响应
echo '{"task":"verify"}' > .dto-signals/test-verify.json
# 查看 watcher 日志确认立即处理

# 执行 cron → 应跳过（事件已处理）
node infrastructure/event-driven/cron-adapters/isc-detect-adapter.js
# 输出应包含 "SKIPPED"
```

---

## 回滚方案

| 级别 | 操作 | 时间 |
|------|------|------|
| **L1: 停止守护进程** | `node event-watcher-daemon.js --stop` | 1秒 |
| **L2: 恢复 cron 命令** | 将 cron message 改回原命令 | 2分钟 |
| **L3: 完全回滚** | `git checkout HEAD -- infrastructure/dispatcher/routes.json` | 5分钟 |

守护进程停止后，cron适配器自动退化为正常执行模式（因为没有 event trigger 记录，shouldSkip 返回 false）。

---

## 性能影响

| 指标 | 迁移前 | 迁移后 |
|------|--------|--------|
| ISC变更检测延迟 | 0~15分钟 | ~2秒 |
| DTO信号处理延迟 | 0~60分钟 | ~1.5秒 |
| Dispatcher响应延迟 | 0~5分钟 | ~3秒 |
| Git变更检测延迟 | 0~30分钟 | ~5秒 |
| Cron空转次数 | 100% | 预计降至30%（70% skip） |
| Agent token消耗 | 每次cron完整执行 | skip时 ~0 token |

---

## 未迁移任务说明

剩余12个cron任务（系统监控、备份、CRAS学习等）本次不迁移，原因：
- 它们是时间驱动的（每日9点学习）而非事件驱动
- 或者是定期维护操作（清理、备份）不适合事件模式
- 优先级低，ROI不足

后续可根据 cron-check-skip 状态数据分析哪些任务适合继续迁移。
