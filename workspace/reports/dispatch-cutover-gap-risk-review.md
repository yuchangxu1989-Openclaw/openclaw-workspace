# 新调度技能切换主工作流——深度风险复盘

> **日期**: 2026-03-06  
> **执行者**: 系统架构师 (researcher)  
> **分析范围**: `multi-agent-dispatch/dispatch-engine.js` (新) vs `infrastructure/dispatcher/dispatch-layer.js` + `dispatcher.js` (旧)  
> **方法**: 代码走读 + 运行时状态快照分析 + 架构耦合分析

---

## 0. 系统全景：三层调度的现状

当前存在 **三个调度组件**，形成链式调用关系：

```
cron (5min) → event-bus/cron-dispatch-runner.js
                ↓
         event-bus/dispatcher.js (规则匹配引擎)
                ↓
         infrastructure/dispatcher/dispatcher.js (路由 + handler 执行)
                ↓ 内部依赖
         infrastructure/dispatcher/dispatch-layer.js (旧调度层, 2-slot)
```

**新技能** `skills/public/multi-agent-dispatch/dispatch-engine.js` 是独立的 19-slot 引擎，目前 **完全没有接入** 上述链条中的任何一环。

---

## 1. 已知 Gap 确认

| # | Gap | 状态 | 代码证据 |
|---|-----|------|---------|
| 1 | 主流程接入点没切 | ✅ 确认 | `dispatcher.js:23` 仍 `require('./dispatch-layer')`，`dispatcher.js:364` 仍 `new DispatchLayer()` |
| 2 | 状态源没统一 | ✅ 确认 | 旧: `infrastructure/dispatcher/state/dispatch-layer-state.json`，新: `skills/public/multi-agent-dispatch/state/engine-state.json` (尚未创建) |
| 3 | 汇报技能未一起收口 | ✅ 确认 | `multi-agent-reporting/index.js` 未引用 DispatchEngine，无 `liveBoard()` 调用链 |
| 4 | 真实运行验收未做 | ✅ 确认 | 新引擎 state 目录不存在，0 次生产调用 |
| 5 | 自动通知链未完全接上 | ✅ 确认 | `feishu-report-sender` 和 `notify-alert` handler 均未引用新引擎 |

---

## 2. 新发现的隐性风险

### P0 — 阻断切换，必须先修

---

#### P0-01: 旧调度层存在僵尸任务，会永久霸占 slot

**现象**: 旧 `dispatch-layer-state.json` 显示 2 个 running 任务从 8+ 小时前启动，至今未完成：
- `demo-1` (slot-1, since 12:57)
- `evt_mmey401p_vzpmbw` (slot-2, since 13:45)

另有 14 个任务堆积在 queue 中，其中包含已完成的 `status: "done"` 任务仍留在 queue 数组里。

**根因**: 旧 DispatchLayer **没有超时回收机制**，也没有从 queue 清理已完成任务的逻辑。`markTask()` 只处理 `running` 和 `queue` 中精确匹配 taskId 的记录，但完成的任务没有被正确移出 queue。

**触发条件**: 任何使用旧调度层的任务如果其生命周期回调 (`markTask('done')`) 没有被正确调用（例如 handler 超时、进程崩溃），该 slot 就永久被占用。

**对切换的影响**: 如果切换过程中需要双轨运行，旧系统的僵尸 slot 会使旧系统看起来「满载」但实际空转，导致新系统以为不需要接管——**状态漂移的源头**。

**缓解动作**:
1. 切换前手动清理旧状态：`dispatch-layer-state.json` 重置或删除
2. 确认所有旧 running 任务的真实状态
3. 新引擎的 `reapStale()` 必须接入定时调用

**是否阻断切换**: ⛔ 是

---

#### P0-02: 无文件锁，19 路并发下状态文件竞争

**现象**: 新引擎的 `_save()` 是 `fs.writeFileSync()` 直写 JSON 文件，`_load()` 是 `fs.readFileSync()`。旧系统也一样。

**根因**: 两个系统都没有文件锁。旧系统只有 2 slot 且所有操作在同一进程内串行执行，问题不大。但新引擎设计为 19 路并发，**如果多个进程同时调用 `markDone()`**（比如多个 subagent 同时完成），可能导致：
- 写覆盖：进程 A 读状态 → 进程 B 读状态 → A 写 → B 写（B 覆盖 A 的修改）
- 丢失任务状态转换
- 队列漂移（某些任务消失或重复）

**触发条件**: 两个或以上 subagent 在同一秒内完成，主 agent 同时为它们调用 `markDone()`。19 路下概率显著。

**缓解动作**:
1. **短期**: 所有状态变更操作加 `flock` 或进程内互斥锁
2. **中期**: 状态存储迁移到 SQLite（单写者保证）
3. **评估**: 新引擎在单个 agent 进程内使用内存缓存(`_state`)，如果所有调用都在同一进程内串行执行，风险降低为「仅跨进程场景」——需确认

**是否阻断切换**: ⛔ 是（19 路下发生概率不可忽略）

---

#### P0-03: Cron 事件链仍绑定旧系统，切换后事件无人消费

**现象**: Crontab 中 `cron-dispatch-runner.js` 每 5 分钟运行，它使用 `event-bus/dispatcher.js`（规则匹配引擎），然后调用 `infrastructure/dispatcher/dispatcher.js`（路由 + 执行），后者内部使用 `DispatchLayer`。

**根因**: 切换到 DispatchEngine 后，如果不修改 `infrastructure/dispatcher/dispatcher.js` 的 `require('./dispatch-layer')` → `require('../../skills/public/multi-agent-dispatch/dispatch-engine')`，所有通过 cron → event-bus 触发的事件仍然走旧路径。

**触发条件**: 切换后的第一个 5 分钟 cron 周期。

**缓解动作**:
1. 修改 `infrastructure/dispatcher/dispatcher.js` 中的 DispatchLayer 引用为 DispatchEngine
2. 或者：在新旧引擎之间加适配层
3. 最小方案：双轨期间让旧系统继续处理 cron 事件，新系统只处理主 agent 的手动调度

**是否阻断切换**: ⛔ 是

---

#### P0-04: `onDispatch` 未接入 `sessions_spawn`——调度引擎是空转的

**现象**: DispatchEngine 的 `onDispatch` 回调在 SKILL.md 中描述为「agent 在这里调用 sessions_spawn」，但实际代码中 `onDispatch` 默认为 `null`。CLI 和 integration.js 示例都没有真正的 spawn 实现。

**根因**: DispatchEngine 是一个**纯状态机**，它管理 queued/spawning/running 状态，但不执行任何实际操作。spawn 动作完全依赖主 agent 的 LLM 在对话中「理解 SKILL.md 并手动调用 sessions_spawn」。

**触发条件**: 任何时刻。没有 `onDispatch` 实现 = 引擎不会自动 spawn 任何任务。

**缓解动作**:
1. 实现一个通用的 `onDispatch` 回调，调用 `sessions_spawn`
2. 或者：明确文档化「DispatchEngine 是协调层，spawn 由 agent 驱动」，确保 agent prompt 中有强制读取 SKILL.md 的逻辑
3. 验收标准：至少完成一次 enqueue → spawn → markRunning → markDone 全生命周期

**是否阻断切换**: ⛔ 是（否则切换 = 切到一个什么都不做的系统）

---

### P1 — 高风险，需要在灰度前补上

---

#### P1-01: 旧系统 queue 中残留已完成任务——脏队列

**现象**: `dispatch-layer-state.json` 的 `queue` 数组包含 `"status": "done"` 的任务（如 `evt_mmey5afg_8g9ylt`），但它们仍在 queue 里没有被移出。

**根因**: 旧 DispatchLayer 的 `markTask()` 函数只从 `running` 数组和 `queue` 数组中 find 任务并更新状态，但 done 的任务如果从未进入 `running` 就无法被正确清理。部分事件通过 `dispatchLayer.enqueue()` 进入 queue，handler 直接在同步调用中完成（`dispatcher.js:510-520`），然后只更新了 status 但没有从 queue 移除。

**触发条件**: 任何同步完成的 handler（执行 <1ms），其 task 会留在 queue 中。14 个 queue 项中有 9 个是 done 状态。

**缓解动作**:
1. 切换前清理：删除或重置旧 state 文件
2. 新引擎不受此影响（`_finish()` 正确地 `delete s.queued[taskId]`），但需确认迁移时不导入脏数据

**是否阻断切换**: ⚠️ 否，但需清理

---

#### P1-02: 任务 ID 格式不一致，下游可能依赖旧格式

**现象**: 
- 旧系统使用 event-bus 的 `evt_xxx` 格式 ID
- 新系统自动生成 `t_<timestamp>_<random>` 格式 ID

**根因**: 新引擎的 `uid()` 函数生成 `t_` 前缀 ID，而旧系统的 taskId 来自 event-bus 的 `event.id`。

**触发条件**: 任何依赖 `evt_` 前缀做日志 grep、决策日志关联、或 dispatched-archive 归档的组件。

**缓解动作**:
1. 新引擎的 `enqueue()` 支持传入 `taskId`，可以保持 `evt_` 格式
2. 审查所有下游 grep/filter 是否依赖 ID 前缀
3. 建议：切换时统一使用 `event.id` 作为 `taskId`

**是否阻断切换**: ⚠️ 否，但需注意

---

#### P1-03: 无回滚机制——切换失败无法自动回退

**现象**: 没有任何代码、配置或文档描述「如果新引擎出问题，如何回滚到旧系统」。

**根因**: 切换是通过修改代码 import 路径实现的（硬切），不是配置驱动或特性开关驱动。

**触发条件**: 新引擎在生产中出现任何 bug（状态文件损坏、spawn 失败风暴、死锁等）。

**缓解动作**:
1. **实现特性开关**: 环境变量 `DISPATCH_ENGINE=new|old|dual`
2. **保留旧代码**: 不删除 DispatchLayer，通过条件分支选择
3. **准备回滚脚本**: 一键恢复旧 require 路径 + 重置状态文件
4. **双轨验证期**: 两个系统同时运行，比较输出，确认一致后再单轨

**是否阻断切换**: ⚠️ 不阻断灰度，但阻断全量切换

---

#### P1-04: `reapStale()` 无自动触发——僵尸任务会饿死队列

**现象**: DispatchEngine 的 `reapStale()` 方法存在且测试通过，但没有任何定时器、cron、或心跳机制自动调用它。

**根因**: 引擎是被动的——所有操作需要外部触发。如果主 agent 不主动调用 `reapStale()`，一个 spawning 超时的任务会永远占用 slot。

**触发条件**: 任何 `sessions_spawn` 调用超时或返回后主 agent 忘记调用 `markRunning()`。19 路下，至少有 1 路超时的概率较高。

**缓解动作**:
1. 在主 agent 的 heartbeat 检查中加入 `reapStale()` 调用
2. 或创建独立 cron job：`node skills/public/multi-agent-dispatch/cli.js reap`
3. 建议 reap 频率：每 5 分钟

**是否阻断切换**: ⚠️ 否，但上线后 24h 内必须补上

---

#### P1-05: 假活跃计数——spawning 状态膨胀

**现象**: `enqueue()` 自动将任务移入 `spawning` 状态，但实际 spawn 由 agent 异步执行。如果 agent 在 `enqueue()` 后需要一段时间才调用 `sessions_spawn`，`liveBoard()` 会显示 19 个 `spawning` 任务，但实际上可能只有 3 个在真正启动中。

**根因**: DispatchEngine 的设计是 enqueue = dispatch，状态机立即转为 `spawning`。但真实的 ACP session spawn 是异步的，且由 agent 的 LLM 判断驱动，不是代码自动驱动。

**触发条件**: `enqueueBatch()` 一次性入队 19+ 任务，引擎立即报告 19 个 spawning，但 agent 需要逐个调用 `sessions_spawn`，期间利用率看板会膨胀。

**缓解动作**:
1. `spawning` 超时设为较短值（如 2 分钟，当前默认 `spawnTimeoutMs: 120_000`）
2. 在看板中区分「引擎标记 spawning」和「已调用 sessions_spawn」
3. 或者：保持 `queued` 状态直到 agent 真正开始 spawn

**是否阻断切换**: ⚠️ 否，但影响运维信任度

---

#### P1-06: Resilient Dispatcher 的断路器逻辑不适用于新引擎

**现象**: `infrastructure/resilience/resilient-dispatcher.js` 封装了旧 Dispatcher，提供 handler 级断路器（3 次连续失败 → 自动禁用 handler）。切换到新引擎后，这层保护消失。

**根因**: ResilientDispatcher 是旧 Dispatcher 的 wrapper，它的 `dispatch()` 调用 `_baseDispatcher.dispatch()`。新引擎完全绕过这条路径。

**触发条件**: 某个 agent/model 频繁 spawn 失败，新引擎会持续重试（通过 drain() 不断回填），形成**失败重试风暴**。

**缓解动作**:
1. 在新引擎中实现类似的断路器：对同一 model/agentId 的连续失败计数
2. 达到阈值后暂停该类任务的 spawn，等待冷却
3. 或者：在 `onDispatch` 回调中集成 ResilientDispatcher 的判断逻辑

**是否阻断切换**: ⚠️ 否，但失败风暴可能在高并发下快速耗尽 API 配额

---

#### P1-07: 双轨运行期的状态漂移——两个引擎各管各的

**现象**: 如果灰度期间同时运行旧 DispatchLayer（处理 cron 事件）和新 DispatchEngine（处理主 agent 手动调度），两个系统对 slot 使用有独立计数。

**根因**: 旧系统 2 slot，新系统 19 slot，总共 21 个「逻辑 slot」对应同一组物理 ACP 资源。旧系统可能在 slot-2 上运行一个任务，新系统也在 lane-17 上 spawn 一个任务，二者不知道彼此的存在。

**触发条件**: 灰度期间，只要 cron 继续触发旧系统的 `dispatchLayer.dispatchNext()`。

**缓解动作**:
1. 灰度期间暂停 cron job
2. 或者：让新引擎成为唯一的 slot 管理者，旧系统仅做路由不做 slot 管理
3. 或者：新引擎的 maxSlots 减去旧系统的 2 slot = 17

**是否阻断切换**: ⚠️ 需要在灰度方案中明确处理

---

### P2 — 低风险，可在切换后迭代

---

#### P2-01: 事件审计日志格式不兼容

**现象**: 旧系统的 `eventLog` 是数组嵌在 state JSON 中；新系统也是。但旧系统的 `history` 字段结构（`{ts, type, taskId, slotId}`）与新系统的 `eventLog`（`{ts, type, taskId, title}`）不同。

**根因**: 独立设计，未考虑日志迁移。

**触发条件**: 回溯审计时需要合并两个系统的日志。

**缓解动作**: 写一个 migration 脚本统一格式。

**是否阻断切换**: 否

---

#### P2-02: `parallel-subagent` 技能和新引擎的并发控制可能冲突

**现象**: workspace 中存在 `skills/parallel-subagent/` 技能，它有自己的 `runParallel()` 和 `concurrency` 控制。如果主 agent 同时使用两个系统 spawn 任务，总并发数会超出 19 路限制。

**根因**: 两个系统不共享 slot 计数。

**触发条件**: 主 agent 在同一 session 中混用 DispatchEngine 和 parallel-subagent。

**缓解动作**: 文档化约束：切换后所有并发调度走 DispatchEngine，禁用 parallel-subagent 或令其成为 DispatchEngine 的消费端。

**是否阻断切换**: 否

---

#### P2-03: `lto-core/adaptive-scheduler` 存在独立调度路径

**现象**: `skills/lto-core/lib/adaptive-scheduler.js` 实现了「响应式调度器」，有自己的 action whitelist 和 LLM 动态组合。它是另一个可以触发任务执行的组件。

**根因**: 多套调度器独立演化，无统一管控。

**触发条件**: 本地任务编排 任务通过 adaptive-scheduler 触发执行，绕过 DispatchEngine 的 slot 管理。

**缓解动作**: 长期收口到 DispatchEngine；短期通过 slot 总量预留避免冲突。

**是否阻断切换**: 否

---

#### P2-04: 新引擎 `historyMax: 500` + `eventLog cap: 2000` 可能丢失审计数据

**现象**: 新引擎在 `_save()` 中硬编码 `s.finished = s.finished.slice(0, 500)` 和 `s.eventLog = s.eventLog.slice(-1000)`。

**根因**: 避免 state 文件无限增长。但如果日产出任务量高（19 路 × 每路日均 20 个 = 380），不到两天就会开始丢弃历史。

**触发条件**: 连续运行 2-3 天后。

**缓解动作**: 加 archive 机制（类似旧系统的 `archive-stale-pending.js`），定期将完成任务转存到 `dispatched-archive/YYYY-MM-DD/`。

**是否阻断切换**: 否

---

#### P2-05: 观测缺口——无 metrics 集成

**现象**: 旧 `dispatcher.js` 有 `_metrics.inc('dispatch_total')` 等 metrics 埋点。新引擎只有 EventEmitter 事件和 JSON 状态文件，无 metrics。

**根因**: 新引擎设计时未接入 observability 模块。

**触发条件**: 切换后无法通过统一监控看到调度层的吞吐、延迟、错误率。

**缓解动作**: 在新引擎的 `drain()`/`_finish()` 中加 metrics 埋点，或在 `onDispatch` 和 `markDone` 回调中记录。

**是否阻断切换**: 否

---

#### P2-06: `liveBoard()` 每次 `_save()` 都写——高频写盘

**现象**: 新引擎的 `_save()` 每次都同时写 `engine-state.json` 和 `live-board.json`。在高并发场景下（19 路任务频繁 heartbeat），写盘频率很高。

**根因**: 设计选择——简单但不高效。

**触发条件**: 19 路任务每 30 秒 heartbeat = 每 30 秒 19 次写盘 = 每分钟 38 次 JSON 序列化 + 写盘。

**缓解动作**: board 文件延迟写入（debounce）或改为按需读取。

**是否阻断切换**: 否

---

## 3. 风险矩阵总览

| 编号 | 风险 | 等级 | 阻断切换? | 需要的修复工作量 |
|------|------|------|-----------|----------------|
| P0-01 | 旧系统僵尸任务 | 🔴 P0 | ⛔ 是 | 0.5h（清理 state 文件） |
| P0-02 | 无文件锁，并发竞争 | 🔴 P0 | ⛔ 是 | 2-4h（加 flock 或内存锁） |
| P0-03 | Cron 事件链绑定旧系统 | 🔴 P0 | ⛔ 是 | 1-2h（修改 import 或暂停 cron） |
| P0-04 | onDispatch 未接入 sessions_spawn | 🔴 P0 | ⛔ 是 | 2-4h（实现回调或明确 agent 协议） |
| P1-01 | 旧 queue 脏数据 | 🟡 P1 | ⚠️ 否 | 0.5h（清理） |
| P1-02 | 任务 ID 格式不一致 | 🟡 P1 | ⚠️ 否 | 0.5h（约定） |
| P1-03 | 无回滚机制 | 🟡 P1 | ⚠️ 否 | 2h（特性开关） |
| P1-04 | reapStale 无自动触发 | 🟡 P1 | ⚠️ 否 | 0.5h（加 cron） |
| P1-05 | spawning 状态膨胀（假活跃） | 🟡 P1 | ⚠️ 否 | 1h（文档 + 看板修正） |
| P1-06 | 断路器保护缺失 | 🟡 P1 | ⚠️ 否 | 2h（实现） |
| P1-07 | 双轨状态漂移 | 🟡 P1 | ⚠️ 需方案 | 1h（灰度方案明确） |
| P2-01 | 审计日志不兼容 | 🟢 P2 | 否 | 1h |
| P2-02 | parallel-subagent 冲突 | 🟢 P2 | 否 | 0.5h（文档） |
| P2-03 | lto adaptive-scheduler 冲突 | 🟢 P2 | 否 | 长期 |
| P2-04 | 历史数据上限过低 | 🟢 P2 | 否 | 1h |
| P2-05 | 无 metrics 集成 | 🟢 P2 | 否 | 1h |
| P2-06 | 高频写盘 | 🟢 P2 | 否 | 1h |

---

## 4. 结论与建议

### ❌ 现在不能灰度切换

**4 个 P0 级阻断项必须先修**。估算修复工作量：6-10 小时。

### 推荐的切换顺序

```
Phase 0: 前置清理 (1-2h)
├── 清理旧 dispatch-layer-state.json 的僵尸任务和脏 queue
├── 暂停或修改 cron-dispatch-runner.js
└── 确认 19 路 ACP 资源可用性

Phase 1: 补齐 P0 阻断项 (4-6h)
├── P0-02: 新引擎加文件锁 (flock on stateFile)
├── P0-03: dispatcher.js 中 DispatchLayer → DispatchEngine 适配
├── P0-04: 实现 onDispatch → sessions_spawn 桥接
└── 补一个 5 分钟 cron: cli.js reap + drain

Phase 2: 单路灰度验证 (2-4h)
├── maxSlots 设为 3（而非 19）
├── 手动 enqueue 3 个简单任务
├── 验证全生命周期：enqueue → spawn → running → done → backfill
├── 验证 reapStale 对超时任务的处理
└── 验证 liveBoard 数据准确性

Phase 3: 放量到 19 路 + 监控 (1-2 天观察)
├── maxSlots 设为 19
├── 接入 multi-agent-reporting 看板
├── 确认状态计数准确
├── 观察文件锁竞争
└── 确认回滚开关可用

Phase 4: 全量切换 + 清退旧代码
├── 删除 DispatchLayer 引用
├── 归档旧 state 文件
├── 收口 parallel-subagent 和 adaptive-scheduler
└── 补 metrics 埋点
```

### 最小可灰度条件 (Minimum Viable Cutover)

- [x] 新引擎代码存在且测试通过 (26/26)
- [ ] ~~P0-01: 旧状态清理~~
- [ ] ~~P0-02: 文件锁~~
- [ ] ~~P0-03: Cron 链路切换或暂停~~
- [ ] ~~P0-04: onDispatch 实现~~
- [ ] ~~P1-04: reapStale 自动化~~
- [ ] ~~P1-07: 双轨方案确定~~

**以上 6 项全部完成后，可以进入 Phase 2 单路灰度。**

---

*Report generated at 2026-03-06T22:27+08:00 by System Architect (researcher)*
