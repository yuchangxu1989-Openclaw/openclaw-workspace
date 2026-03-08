# L3 集成映射与迁移方案 v1.0

> **作者**: 系统架构师  
> **日期**: 2026-03-05  
> **状态**: 诊断完成，方案待审  
> **紧急度**: 🔴 高 — 质量分析师确认新建6模块与现有系统零集成

---

## TL;DR

系统中存在**两套事件总线**，API完全不兼容，且共享同一个events.jsonl文件（潜在数据竞争）：

| 总线 | 文件 | 消费模型 | 使用者 |
|------|------|----------|--------|
| **旧bus.js** | `infrastructure/event-bus/bus.js` | cursor + consumerId + ack | ISC、本地任务编排、CRAS、SEEF、AEO、Dispatcher、Observability |
| **新event-bus.js** | `infrastructure/event-bus/event-bus.js` | since时间窗 + type_filter通配 | L3Pipeline、L3 E2E测试 |

**6个新L3模块**（EventBus、RuleMatcher、IntentScanner、RegistryManager、Dispatcher v2、DecisionLogger）全部使用新event-bus.js，**与现有7个事件桥接模块零对接**。

**推荐方案**：方案A — 旧bus.js加适配层wrap成新EventBus接口，分三阶段渐进迁移。

---

## 第一部分：现有系统事件盘点

### 1.1 事件生产者（Producers）

| 模块 | 文件路径 | 使用总线 | 发射的事件类型 |
|------|----------|----------|----------------|
| **ISC Event Bridge** | `skills/isc-core/event-bridge.js` | 旧bus.js | `isc.rule.created`, `isc.rule.updated`, `isc.rule.deleted` |
| **AEO Event Bridge** | `skills/aeo/event-bridge.js` | 旧bus.js | `aeo.assessment.completed`, `aeo.assessment.failed`, `aeo.assessment.batch` |
| **CRAS Event Bridge** | `skills/cras/event-bridge.js` | 旧bus.js | `cras.insight.generated` |
| **CRAS Rule Suggester** | `skills/cras/rule-suggester.js` | 旧bus.js | （消费为主，可能emit反馈事件） |
| **SEEF Event Bridge** | `skills/seef/event-bridge.js` | 旧bus.js | `seef.skill.evaluated`, `seef.skill.discovered`, `seef.skill.created`, `seef.skill.optimized`, `seef.skill.validated`, `seef.skill.aligned`, `seef.skill.recorded`, `seef.skill.deprecated` |
| **本地任务编排 Event Bridge** | `skills/dto-core/event-bridge.js` | 旧bus.js | `dto.sync.completed`, `dto.sync.failed` |
| **Memory Archiver** | `infrastructure/event-bus/handlers/memory-archiver.js` | 旧bus.js | （纯消费者，不产生事件） |
| **Observability Dashboard** | `infrastructure/observability/dashboard.js` | 旧bus.js | （纯消费者） |
| **L3Pipeline** | `infrastructure/pipeline/l3-pipeline.js` | **新event-bus.js** | `user.intent.*.inferred`（闭环回写） |

### 1.2 事件消费者（Consumers）

| 消费者 | consumerId | 使用总线 | 订阅的事件模式 |
|--------|-----------|----------|----------------|
| **SEEF Event Bridge** | `seef` | 旧bus.js | `dto.sync.*`, `aeo.assessment.*`, `cras.insight.*`, `isc.rule.*`, `seef.skill.*` |
| **本地任务编排 Event Bridge** | `dto-core` | 旧bus.js | `isc.rule.*`, `dto.sync.*`, `seef.skill.*`, `aeo.assessment.*`, `cras.insight.*`, `system.*` |
| **CRAS Event Bridge** | `cras` | 旧bus.js | `aeo.assessment.*`, `dto.sync.completed`, `system.error` |
| **Dispatcher** | （通过routes.json路由） | 旧bus.js | 见routes.json 12种模式 |
| **L3Pipeline** | （无consumerId，时间窗消费） | **新event-bus.js** | 全量consume（since时间窗） |

### 1.3 Dispatcher路由表（routes.json）

```
isc.rule.*              → dto-sync handler
dto.sync.*              → dto-orchestrate handler
seef.skill.evaluated    → seef-optimize handler
seef.skill.optimized    → cras-ingest handler
aeo.assessment.completed → cras-ingest handler
aeo.assessment.failed   → aeo-retry handler
cras.insight.generated  → isc-feedback handler
system.error            → system-alert handler
system.health           → system-monitor handler
system.architecture.changed → memory-archiver handler
system.config.changed   → memory-archiver handler
system.critical.fix     → memory-archiver handler
```

---

## 第二部分：新旧总线API对比

### 2.1 旧bus.js API

```javascript
// 发射 — 返回完整event对象（含consumed_by数组）
bus.emit(type, payload, source) → event

// 消费 — 基于cursor+consumerId，每次调用返回未消费事件
bus.consume(consumerId, { types: [...], limit }) → events[]

// 确认 — 标记事件已被某consumer处理
bus.ack(consumerId, eventId)

// 历史查询
bus.history({ type, since, until, source, limit }) → events[]

// 统计
bus.stats() → { totalEvents, consumers, eventsByType, ... }
```

**关键特性**：
- 文件锁（PID lockfile，`O_CREAT|O_EXCL`）
- cursor持久化（cursor.json）
- 事件级ack追踪（consumed_by数组写回JSONL）
- 10MB自动轮转 + 归档
- 通配符匹配（`isc.rule.*`）

### 2.2 新event-bus.js API

```javascript
// 发射 — 返回 {id, suppressed} 对象
EventBus.emit(type, payload, source, metadata) → { id, suppressed }

// 消费 — 无状态，基于时间窗口+通配符过滤
EventBus.consume({ type_filter, since, layer, limit }) → events[]

// 健康检查
EventBus.healthCheck() → { ok, total, corrupted, ... }

// 统计
EventBus.stats() → { total_events, file_size, ... }
```

**关键特性**：
- 原子写入（tmp→rename策略）
- 风暴抑制（5秒去重窗口）
- 通配符消费（`skill.*`→正则）
- 损坏行自修复（healthCheck）
- 应急降级（主文件写失败→`/tmp/events-emergency.jsonl`）
- **无cursor、无ack、无consumerId**

### 2.3 核心不兼容点

| 维度 | 旧bus.js | 新event-bus.js | 冲突严重度 |
|------|----------|----------------|-----------|
| **消费模型** | cursor + ack（有状态，精确一次） | since时间窗（无状态，可能重复消费） | 🔴 致命 |
| **emit返回值** | 完整event对象 | `{id, suppressed}` | 🟡 中等 |
| **emit参数** | `(type, payload, source)` 3参数 | `(type, payload, source, metadata)` 4参数 | 🟢 低（兼容） |
| **consume签名** | `(consumerId, options)` | `(options)` 无consumerId | 🔴 致命 |
| **ack机制** | 有 `bus.ack()` | 无 | 🔴 致命 |
| **并发控制** | PID文件锁 | 原子rename（无锁） | 🟡 中等 |
| **数据文件** | 同一个 `events.jsonl` | 同一个 `events.jsonl` | 🔴 致命（数据竞争） |
| **事件结构** | 含 `consumed_by` 数组 | 含 `metadata` 对象 | 🟡 中等 |

**⚠️ 致命风险**：两套总线读写同一个 `events.jsonl`，旧bus用文件锁保护写入，新event-bus用rename覆盖写入——两者并发时**rename会丢失旧bus刚append的事件**。

---

## 第三部分：6个新L3模块集成现状

### 3.1 新模块清单

| # | 模块 | 路径 | 与现有系统集成 | 问题 |
|---|------|------|---------------|------|
| 1 | **EventBus** (新) | `infrastructure/event-bus/event-bus.js` | ❌ 零集成 | 与旧bus.js共存于同目录，API不兼容，数据文件冲突 |
| 2 | **ISCRuleMatcher** | `infrastructure/rule-engine/isc-rule-matcher.js` | ❌ 零集成 | 直接读ISC规则JSON，但不通过任何event-bridge触发 |
| 3 | **IntentScanner** | `infrastructure/intent-engine/intent-scanner.js` | ❌ 零集成 | 独立调用GLM-5，不连接CRAS，不消费旧bus事件 |
| 4 | **RegistryManager** | `infrastructure/intent-engine/registry-manager.js` | ❌ 零集成 | 管理intent-registry.json，但ISC event-bridge不知道它的存在 |
| 5 | **Dispatcher v2** (L3Pipeline内联) | `infrastructure/pipeline/l3-pipeline.js` | ⚠️ 部分 | 引用了旧Dispatcher模块，但旧Dispatcher内部用旧bus.js |
| 6 | **DecisionLogger** | `infrastructure/decision-log/decision-logger.js` | ❌ 零集成 | 独立JSONL日志，不与observability/dashboard对接 |

### 3.2 关键断裂点

```
现有闭环（旧bus.js驱动）：
  ISC规则变更 →[bus.emit]→ DTO同步 →[bus.emit]→ SEEF评估 →[bus.emit]→ AEO评测 →[bus.emit]→ CRAS学习 →[bus.emit]→ ISC反馈
  ↑                                                                                                              ↓
  └──────────────────────────────────── CRAS洞察 → ISC规则建议 ←──────────────────────────────────────────────────┘

新L3闭环（新event-bus.js驱动）：
  EventBus.consume → RuleMatcher.process → IntentScanner.scan → Dispatcher.dispatch
  ↑                                                                              ↓
  └──────────────── EventBus.emit(user.intent.*.inferred) ←──────────────────────┘

断裂：两个闭环之间 **零连接**
  - 旧bus产生的 isc.rule.* 事件，新EventBus能读到（同文件），但RuleMatcher不会被触发
  - 新EventBus emit的 user.intent.*.inferred 事件，旧bus的consumer看不到（没有consumed_by字段，ack逻辑错位）
  - L3Pipeline通过cron每5分钟消费新EventBus的since窗口事件，但旧bus的consumer也在消费同文件——重复处理
```

---

## 第四部分：迁移方案对比

### 方案A：旧bus.js加适配层（推荐 ✅）

**思路**：写一个 `bus-adapter.js`，在旧bus.js之上包装出新event-bus.js兼容的接口。新L3模块改为引用适配器，不直接操作events.jsonl。

**架构**：
```
┌─────────────────────────────────────────────────┐
│              bus-adapter.js (新建)                 │
│  ┌──────────┐              ┌──────────────────┐  │
│  │ emit()    │──wrap──→    │ bus.emit()        │  │
│  │ consume() │──wrap──→    │ bus.consume()     │  │  ← 旧bus.js（不改）
│  │ healthCheck│──新增──→   │ 文件完整性检查     │  │
│  │ stats()   │──wrap──→    │ bus.stats()       │  │
│  └──────────┘              └──────────────────┘  │
└─────────────────────────────────────────────────┘
     ↑                              ↑
  新L3模块                       旧event-bridge模块
  (改require路径)                (不改)
```

**优势**：
1. **零风险**：旧系统7个event-bridge完全不动，不会断裂现有闭环
2. **解决数据竞争**：所有写入走旧bus.js的文件锁，消除rename覆盖风险
3. **渐进迁移**：后续可逐步将旧consumer迁移到适配器的新API
4. **保留ack语义**：L3Pipeline通过适配层获得cursor+ack能力，避免重复消费

**劣势**：
1. 适配层增加一层间接调用（性能损耗可忽略，文件I/O为瓶颈）
2. 新event-bus.js的风暴抑制和原子写入特性需要在适配层中保留
3. 长期维护两套代码

**工作量**：~2-3小时

---

### 方案B：统一迁移到新EventBus，旧bus.js废弃

**思路**：将7个旧event-bridge全部改为使用新event-bus.js，旧bus.js废弃。

**架构**：
```
┌──────────────────────────────────────┐
│        event-bus.js (新，升级)         │
│  + 增加consumerId机制                 │
│  + 增加cursor持久化                   │
│  + 增加ack()方法                      │
│  + 增加文件锁                         │
└──────────────────────────────────────┘
     ↑                    ↑
  新L3模块             旧event-bridge模块
  (不改)               (改require路径 + 改调用签名)
```

**优势**：
1. 最终态更干净，只有一套总线
2. 新EventBus的风暴抑制、原子写入、healthCheck等能力对全系统生效

**劣势**：
1. 🔴 **高风险**：需改动7个event-bridge + Dispatcher + Observability + Memory Archiver = **10个文件**
2. 🔴 **API断裂**：`bus.consume(consumerId, opts)` → `EventBus.consume(opts)` 签名不兼容，所有调用点需逐一改写
3. 🔴 **ack缺失**：新event-bus.js没有ack机制，需先给它加cursor+ack功能（等于重写一半旧bus.js的功能）
4. 🔴 **并行施工风险**：迁移期间任何一个bridge没改完就会断裂闭环
5. **工作量大**：~6-8小时，且需全量回归测试

---

### 决策：选择方案A

**论证**：

1. **反熵增原则**：方案A的有序度单调递增（旧系统不动→加适配层→逐步迁移），方案B在迁移中间态有序度骤降
2. **10倍规模验证**：适配层模式天然支持多总线并存（未来如果有分布式总线，适配层模式直接套用）
3. **可逆性**：方案A的适配层如果有问题，删掉就回到原状；方案B一旦开始，回退成本极高
4. **时效约束**：质量分析师已发现问题，需要快速修复。2-3小时 vs 6-8小时

---

## 第五部分：具体改动清单

### Phase 1：适配层建设（消除数据竞争 + 接通新旧总线）

#### 改动1.1：新建 `infrastructure/event-bus/bus-adapter.js`

**描述**：适配层，对外暴露新event-bus.js兼容API，内部委托旧bus.js执行

```javascript
// 核心映射关系：
// 新API emit(type, payload, source, metadata)  → 旧bus.emit(type, {...payload, ...metadata}, source)
// 新API consume({type_filter, since, limit})    → 旧bus.history({type: type_filter, since, limit})
// 新API healthCheck()                           → 读events.jsonl做完整性校验
// 新API stats()                                 → 旧bus.stats() + 扩展字段
```

**接口签名**：
```javascript
module.exports = {
  emit(type, payload, source, metadata) → { id, suppressed: false },
  consume(options) → events[],  // options: { type_filter, since, layer, limit }
  healthCheck() → { ok, total, corrupted, ... },
  stats() → { total_events, file_size, ... },
  // 保留旧API透传（渐进迁移用）
  legacy: require('./bus.js')
};
```

#### 改动1.2：修改 `infrastructure/pipeline/l3-pipeline.js` 第24行

**从**：
```javascript
const EventBus = require('../event-bus/event-bus');
```
**改为**：
```javascript
const EventBus = require('../event-bus/bus-adapter');
```

#### 改动1.3：修改 `infrastructure/tests/l3-e2e-test.js` 第23行

**从**：
```javascript
const EventBus = require('../event-bus/event-bus.js');
```
**改为**：
```javascript
const EventBus = require('../event-bus/bus-adapter.js');
```

#### 改动1.4：修改 `scripts/l3-pipeline-cron.js`

确认cron入口通过l3-pipeline.js间接使用适配器（无需直接改动，但需验证）。

---

### Phase 2：L3模块接入现有事件流

#### 改动2.1：L3Pipeline注册为旧bus的consumer

**文件**：`infrastructure/pipeline/l3-pipeline.js`

**改动**：在 `run()` 方法中，consume改为通过适配层获取事件后，对已处理事件调用 `bus.ack('l3-pipeline', eventId)`，避免与DTO/CRAS/SEEF重复消费。

**具体**：适配层的consume方法内部使用 `bus.consume('l3-pipeline', {types, limit})` 而非时间窗读取。

#### 改动2.2：IntentScanner结果回流到旧bus

**文件**：`infrastructure/pipeline/l3-pipeline.js` 的闭环emit段

**现状**：`EventBus.emit('user.intent.*.inferred', ...)` 写入新event-bus

**改动**：通过适配层emit，实际写入旧bus.js管理的events.jsonl。这样Dispatcher的routes.json可以新增 `user.intent.*` 路由，本地任务编排/CRAS等consumer可以消费。

#### 改动2.3：Dispatcher routes.json新增L3意图路由

**文件**：`infrastructure/dispatcher/routes.json`

**新增**：
```json
{
  "user.intent.*": {
    "handler": "intent-dispatch",
    "agent": "coder",
    "priority": "normal",
    "description": "L3 detected user intents dispatched for execution"
  }
}
```

#### 改动2.4：DecisionLogger接入Observability

**文件**：`infrastructure/observability/dashboard.js`

**改动**：新增从 `infrastructure/decision-log/decisions.jsonl` 读取决策日志的能力，展示L3决策链路。

---

### Phase 3：交叉验证与闭环打通

#### 改动3.1：ISC Event Bridge → RuleMatcher联动

**现状**：ISC event-bridge检测规则变更后emit到旧bus，RuleMatcher直接读规则文件但不感知变更事件。

**改动**：在适配层新增事件监听钩子。当 `isc.rule.*` 事件被emit时，触发RuleMatcher的 `reload()` 方法刷新规则索引。

**实现方式**：适配层emit后，检查type是否匹配 `isc.rule.*`，如果匹配则调用：
```javascript
const { getDefaultMatcher } = require('../rule-engine/isc-rule-matcher');
getDefaultMatcher().reload();
```

#### 改动3.2：CRAS洞察 → IntentRegistry联动

**现状**：CRAS生成洞察后emit `cras.insight.generated`，但IntentScanner的RegistryManager不知道。

**改动**：在L3Pipeline的处理逻辑中，当consume到 `cras.insight.generated` 事件且payload中包含意图模式建议时，调用 `RegistryManager.addIntent()` 评估是否新增意图定义。

#### 改动3.3：AEO评测结果 → DecisionLogger

**现状**：AEO评测结果通过旧bus传递，DecisionLogger完全不知道。

**改动**：在适配层的consume处理中，对 `aeo.assessment.*` 事件额外写一条decision log记录，关联评测结果与ISC规则决策链。

---

## 第六部分：改动文件汇总

| # | 文件 | 操作 | Phase | 风险 |
|---|------|------|-------|------|
| 1 | `infrastructure/event-bus/bus-adapter.js` | **新建** | P1 | 低 |
| 2 | `infrastructure/pipeline/l3-pipeline.js` L24 | 改require路径 | P1 | 低 |
| 3 | `infrastructure/tests/l3-e2e-test.js` L23 | 改require路径 | P1 | 低 |
| 4 | `infrastructure/pipeline/l3-pipeline.js` run() | 改consume为cursor模式 | P2 | 中 |
| 5 | `infrastructure/dispatcher/routes.json` | 新增user.intent.*路由 | P2 | 低 |
| 6 | `infrastructure/dispatcher/handlers/intent-dispatch.js` | **新建** handler | P2 | 低 |
| 7 | `infrastructure/observability/dashboard.js` | 新增decision-log数据源 | P2 | 低 |
| 8 | `infrastructure/event-bus/bus-adapter.js` | 新增isc.rule.*钩子 | P3 | 中 |
| 9 | `infrastructure/pipeline/l3-pipeline.js` | 新增CRAS→Registry联动 | P3 | 中 |
| 10 | `infrastructure/event-bus/bus-adapter.js` | 新增AEO→DecisionLog联动 | P3 | 低 |

**不需要改动的文件**（这是方案A的核心优势）：
- ✅ `skills/isc-core/event-bridge.js` — 不动
- ✅ `skills/aeo/event-bridge.js` — 不动
- ✅ `skills/cras/event-bridge.js` — 不动
- ✅ `skills/cras/rule-suggester.js` — 不动
- ✅ `skills/seef/event-bridge.js` — 不动
- ✅ `skills/dto-core/event-bridge.js` — 不动
- ✅ `infrastructure/event-bus/bus.js` — 不动
- ✅ `infrastructure/event-bus/handlers/memory-archiver.js` — 不动

---

## 第七部分：数据竞争修复

### 当前风险

```
旧bus.js emit:
  1. acquireLock()
  2. fs.appendFileSync(events.jsonl, newLine)
  3. releaseLock()

新event-bus.js emit (并发):
  1. fs.readFileSync(events.jsonl)    ← 可能读到旧bus append前的版本
  2. fs.writeFileSync(tmpFile, existing + newLine)
  3. fs.renameSync(tmpFile, events.jsonl)  ← 覆盖旧bus刚append的事件！
```

**修复**：Phase 1完成后，新event-bus.js不再被直接使用。所有路径都走bus-adapter.js→旧bus.js→文件锁保护。数据竞争自然消除。

**额外建议**：在 `event-bus.js` 文件头部添加废弃标记：
```javascript
// @deprecated Use bus-adapter.js instead. Direct usage causes data race with bus.js.
// This file will be removed after full migration to bus-adapter.js.
```

---

## 第八部分：验证计划

### P1验证（适配层就绪后）
```bash
# 1. 旧bus emit + 新适配层consume 能否读到
node -e "const bus=require('./bus.js'); bus.emit('test.verify','test-adapter'); const adapter=require('./bus-adapter.js'); console.log(adapter.consume({type_filter:'test.*'}))"

# 2. 适配层emit + 旧bus consume 能否读到
node -e "const adapter=require('./bus-adapter.js'); adapter.emit('test.adapter','{}','test'); const bus=require('./bus.js'); console.log(bus.history({type:'test.adapter'}))"

# 3. L3 E2E测试通过
node infrastructure/tests/l3-e2e-test.js
```

### P2验证（闭环打通后）
```bash
# 1. 模拟ISC规则变更 → 验证L3Pipeline能感知并处理
node -e "const bus=require('./infrastructure/event-bus/bus.js'); bus.emit('isc.rule.updated',{rule_id:'R001',change:'test'},'verify')"
# 等5分钟cron触发，检查 pipeline/run-log.jsonl

# 2. 验证intent事件能被Dispatcher路由
# 检查 dispatcher/decision.log 中是否有 user.intent.* 的dispatch记录
```

### P3验证（交叉联动后）
```bash
# 完整闭环验证：
# ISC规则变更 → DTO同步 → SEEF评估 → AEO评测 → CRAS学习 → L3意图识别 → Dispatcher执行
# 每一步检查events.jsonl中的事件链和decision-log中的决策记录
```

---

## 附录：事件流全景图（目标态）

```
                          ┌──────────────────────────────────┐
                          │        bus-adapter.js             │
                          │   (统一入口，内部走旧bus.js)       │
                          └──────────┬───────────────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │                          │                          │
          ▼                          ▼                          ▼
  ┌───────────────┐      ┌──────────────────┐      ┌───────────────────┐
  │ 旧event-bridge │      │   L3Pipeline     │      │   Dispatcher      │
  │ (ISC/本地任务编排/CRAS │      │ (RuleMatcher +   │      │ (routes.json +    │
  │  SEEF/AEO)    │      │  IntentScanner)  │      │  handlers/)       │
  └───────┬───────┘      └────────┬─────────┘      └─────────┬─────────┘
          │                       │                           │
          │  bus.emit()           │  adapter.emit()           │  handler执行
          │  bus.consume()        │  adapter.consume()        │
          │  bus.ack()            │                           │
          ▼                       ▼                           ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │                    events.jsonl (单一数据文件)                    │
  │                    cursor.json (消费者游标)                      │
  │                    全部通过旧bus.js的文件锁保护                   │
  └──────────────────────────────────────────────────────────────────┘
```

## 目标

> TODO: 请补充目标内容

## 风险

> TODO: 请补充风险内容

## 验收

> TODO: 请补充验收内容

---

## 📋 架构评审清单 (自动生成)

**文档**: l3-integration-map-v1
**生成时间**: 2026-03-06T13:01:12.507Z
**状态**: 待评审

### ⚠️ 缺失章节
- [ ] 补充「目标」章节
- [ ] 补充「风险」章节
- [ ] 补充「验收」章节

### 评审检查项
- [ ] 方案可行性评估
- [ ] 技术风险已识别
- [ ] 依赖关系已明确
- [ ] 回滚方案已准备
- [ ] 性能影响已评估

### 审核门
审核门: 待通过

> 评审完成后，将上方「待通过」改为「通过」即可放行。
