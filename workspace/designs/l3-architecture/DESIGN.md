# L3 意图识别层架构设计

> **版本**: v1.0.0  
> **日期**: 2026-03-05  
> **状态**: ISC N022 合规输出物  
> **来源**: 整合自 l3-integration-map-v1.md + l3-interface-contract-v1.md

---

## 第一部分：架构设计

### 1.1 设计背景与问题定义

系统中存在**两套事件总线**（旧bus.js与新event-bus.js），API完全不兼容，且共享同一个events.jsonl文件，存在致命数据竞争风险。6个新L3模块全部使用新event-bus.js，与现有7个事件桥接模块零对接。

| 总线 | 文件 | 消费模型 | 使用者 |
|------|------|----------|--------|
| **旧bus.js** | `infrastructure/event-bus/bus.js` | cursor + consumerId + ack | ISC、本地任务编排、CRAS、SEEF、AEO、Dispatcher、Observability |
| **新event-bus.js** | `infrastructure/event-bus/event-bus.js` | since时间窗 + type_filter通配 | L3Pipeline、L3 E2E测试 |

### 1.2 架构决策：适配层方案（方案A）

**决策**：在旧bus.js之上构建bus-adapter.js适配层，对外暴露新event-bus.js兼容API，内部委托旧bus.js执行。

**论证**：
1. **反熵增原则**：有序度单调递增（旧系统不动→加适配层→逐步迁移），中间态无序度骤降风险为零
2. **10倍规模验证**：适配层模式天然支持多总线并存，未来分布式总线可直接套用
3. **可逆性**：适配层有问题，删掉即回原状；方案B（统一迁移）一旦开始回退成本极高
4. **时效**：2-3小时 vs 方案B的6-8小时

### 1.3 目标态架构

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
          ▼                       ▼                           ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │                    events.jsonl (单一数据文件)                    │
  │                    cursor.json (消费者游标)                      │
  │                    全部通过旧bus.js的文件锁保护                   │
  └──────────────────────────────────────────────────────────────────┘
```

### 1.4 层间依赖方向（铁律）

**核心原则**：L3可以消费L1/L2的事件，但L1/L2永远不知道L3的存在。所有跨层通信必须经由EventBus。

```
依赖方向矩阵：
                       被依赖方 →
依赖方 ↓        EventBus   L1模块    L2模块    L3模块    Dispatcher
─────────────────────────────────────────────────────────────────────
EventBus          —         ❌        ❌        ❌         ❌
L1模块           ✅(emit)    —        🚫禁止    🚫禁止     ❌
L2模块           ✅(emit     ❌        —        🚫禁止     ❌
                 +consume)
L3模块           ✅(emit     ❌        ❌        —         ❌
                 +consume)
Dispatcher       ✅(consume) ❌        ❌        ❌         —
```

### 1.5 数据竞争修复

旧bus.js使用PID文件锁保护append写入，新event-bus.js使用tmp→rename原子写入。两者并发时rename会覆盖旧bus刚append的事件。

**修复方案**：Phase 1完成后，新event-bus.js不再被直接使用。所有路径走bus-adapter.js→旧bus.js→文件锁保护。数据竞争自然消除。

---

## 第二部分：核心模块

### 2.1 模块清单

| # | 模块 | 路径 | 职责 | 集成状态 |
|---|------|------|------|---------|
| 1 | **bus-adapter.js** | `infrastructure/event-bus/bus-adapter.js` | 统一事件总线适配层 | 🆕 待建 |
| 2 | **EventBus (旧)** | `infrastructure/event-bus/bus.js` | 底层事件存储与消费 | ✅ 不动 |
| 3 | **ISCRuleMatcher** | `infrastructure/rule-engine/isc-rule-matcher.js` | ISC规则匹配引擎 | ❌→✅ Phase 3 |
| 4 | **IntentScanner** | `infrastructure/intent-engine/intent-scanner.js` | 意图识别引擎（LLM+正则fallback） | ❌→✅ Phase 2 |
| 5 | **RegistryManager** | `infrastructure/intent-engine/registry-manager.js` | 意图注册表管理 | ❌→✅ Phase 3 |
| 6 | **L3Pipeline** | `infrastructure/pipeline/l3-pipeline.js` | L3编排层（cron驱动） | ⚠️→✅ Phase 1-2 |
| 7 | **DecisionLogger** | `infrastructure/decision-log/decision-logger.js` | 决策审计日志 | ❌→✅ Phase 2 |
| 8 | **Dispatcher** | `infrastructure/dispatcher/` | 事件路由与handler执行 | ⚠️→✅ Phase 2 |

### 2.2 bus-adapter.js 接口设计

```javascript
module.exports = {
  emit(type, payload, source, metadata) → { id, suppressed: false },
  consume(options) → events[],  // options: { type_filter, since, layer, limit }
  healthCheck() → { ok, total, corrupted, ... },
  stats() → { total_events, file_size, ... },
  legacy: require('./bus.js')  // 旧API透传（渐进迁移用）
};
```

**核心映射关系**：
- `emit(type, payload, source, metadata)` → `bus.emit(type, {...payload, ...metadata}, source)`
- `consume({type_filter, since, limit})` → `bus.history({type: type_filter, since, limit})`
- `healthCheck()` → 读events.jsonl做完整性校验
- `stats()` → `bus.stats()` + 扩展字段

### 2.3 IntentEngine（IntentScanner）

**入口签名**：
```typescript
async function scan(conversationSlice: MessageSlice[]): Promise<ScanResult>;

interface MessageSlice {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}
```

**降级策略**：
1. 主路径：LLM推理（{{MODEL_DEEP_THINKING}}）
2. Escalate：备用LLM
3. 最终降级：正则fallback（仅覆盖IC2类意图，confidence固定0.95）
4. 全部失败：返回空数组

**意图分类体系（IC1-IC5）**：
- **IC1**: 情绪意图（frustration, satisfaction, confusion, urgency）
- **IC2**: 规则触发意图（映射到ISC规则的显式操作请求）
- **IC3**: 复杂意图（需5+轮上下文，延迟到慢通道）
- **IC4**: 隐含意图（未明确表述但可推断）
- **IC5**: 多意图拆分（单条消息含多个独立意图）

### 2.4 Intent Registry

**文件位置**：`infrastructure/event-bus/intent-registry.json`
**所有权**：AEO负责写入和治理，CRAS/IntentEngine只读消费。

**意图生命周期状态机**：
```
draft → active → dormant → deprecated → archived
         ↑          │
         └──────────┘ (重新活跃)
```

**状态转换规则**：
| 转换 | 触发条件 | 是否需人工确认 |
|------|---------|--------------|
| draft → active | MECE校验通过 + AEO审批 | ✅ |
| active → dormant | 30天内触发<3次 | ❌ 自动 |
| dormant → active | 触发数回升 | ❌ 自动 |
| dormant → deprecated | 90天未触发 | ❌ 自动 |
| deprecated → archived | 确认不再需要 | ✅ |

### 2.5 Decision Logger

每条意图识别结果必须附带决策日志，包含：
- **what**: 做了什么决策
- **why**: 推理链
- **confidence**: 置信度
- **alternatives_considered**: 考虑过的替代方案
- **engine**: 决策引擎（llm / regex_fallback）

存储位置：`infrastructure/event-bus/decision-logs/YYYY-MM-DD.jsonl`，保留30天。

### 2.6 事件生产者与消费者盘点

**事件生产者**（7个旧 + 1个新）：
| 模块 | 使用总线 | 事件类型 |
|------|----------|---------|
| ISC Event Bridge | 旧bus.js | `isc.rule.created/updated/deleted` |
| AEO Event Bridge | 旧bus.js | `aeo.assessment.completed/failed/batch` |
| CRAS Event Bridge | 旧bus.js | `cras.insight.generated` |
| SEEF Event Bridge | 旧bus.js | `seef.skill.*` (8种) |
| 本地任务编排 Event Bridge | 旧bus.js | `dto.sync.completed/failed` |
| L3Pipeline | 适配层(→旧bus) | `user.intent.*.inferred` |

**事件消费者**（5个旧 + 1个新）：
| 消费者 | consumerId | 订阅模式 |
|--------|-----------|---------|
| SEEF | `seef` | `dto.sync.*`, `aeo.assessment.*`, `cras.insight.*`, `isc.rule.*` |
| 本地任务编排 | `dto-core` | `isc.rule.*`, `dto.sync.*`, `seef.skill.*`, `aeo.assessment.*` |
| CRAS | `cras` | `aeo.assessment.*`, `dto.sync.completed`, `system.error` |
| Dispatcher | routes.json | 12种路由模式 |
| L3Pipeline | `l3-pipeline` | 全量消费（通过适配层cursor模式） |

---

## 第三部分：接口契约

### 3.1 EventBus 事件结构（Event Schema）

所有事件必须符合以下信封格式（L1/L2/L3共用）：

```typescript
interface Event {
  id:        string;      // 格式: evt_{timestamp_base36}_{random_6}
  type:      string;      // noun.verb 语法
  payload:   object;      // ≤64KB序列化
  timestamp: number;      // Unix毫秒
  source:    string;      // 产生者标识
  layer:     "L1" | "L2" | "L3" | "L4" | "L5" | "META";
  metadata?: {
    trace_id?:       string;
    span_id?:        string;
    parent_span_id?: string;
    caused_by?:      string;
    triggers?:       string[];
  };
}
```

**字段约束**：
| 字段 | 类型 | 必填 | 校验规则 |
|------|------|------|---------|
| `id` | string | ✅ | `/^evt_[a-z0-9_]{6,26}$/` |
| `type` | string | ✅ | `/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*\.[a-z_]+$/` |
| `payload` | object | ✅ | 可JSON.stringify，≤64KB |
| `timestamp` | number | ✅ | > 1700000000000 |
| `source` | string | ✅ | `/^[a-z][a-z0-9_-]*$/` |
| `layer` | enum | ✅ | L1/L2/L3/L4/L5/META |

### 3.2 bus.emit() 契约

```typescript
function emit(type: string, payload: object, source: string, options?: EmitOptions): EmitResult;

interface EmitOptions {
  layer?:         "L1" | "L2" | "L3" | "L4" | "L5" | "META";
  parentTraceId?: string;
  dedup?:         boolean;   // 500ms去重窗口
  batch?:         string;
}

interface EmitResult {
  eventId: string;
  traceId: string;
  spanId:  string;
}
```

**行为契约**：原子性写入、同进程顺序保证、noun-registry校验（宽松模式不阻塞）、layer自动推断。

### 3.3 bus.consume() 契约

```typescript
function consume(consumerId: string, filter: ConsumeFilter): Event[];

interface ConsumeFilter {
  type_filter?: string;  // 通配符支持: '*', 'user.intent.*', '*.failed'
  since?:       number;
  layer?:       string;
  limit?:       number;  // 默认1000，最大10000
}
```

**行为契约**：cursor语义（at-least-once）、过滤顺序（type→since→layer→limit）、timestamp升序返回。

### 3.4 bus.ack() 契约

```typescript
function ack(consumerId: string, eventId: string): void;
```

O(1) 追加写入acks.jsonl。

### 3.5 L3特定事件payload

```typescript
interface L3EventPayload {
  intent_id?:      string;
  intent_type?:    string;
  category:        "IC1" | "IC2" | "IC3" | "IC4" | "IC5";
  confidence:      number;   // [0.0, 1.0]
  reasoning?:      string;
  message_excerpt: string;   // ≤200字符
  source_engine:   "llm" | "regex_fallback";
}
```

IC2扩展：`mapped_event`, `mapped_rules`
IC1扩展：`sentiment_type`, `sentiment_score`
IC3扩展：`requires_context_rounds`, `deferred_to`

### 3.6 L3层事件类型清单

| 事件类型 | 来源 | 说明 |
|---------|------|------|
| `user.intent.{intent_id}.inferred` | IntentEngine | 已注册意图被识别 |
| `user.sentiment.{type}.shifted` | IntentEngine | 情绪状态转变 |
| `conversation.correction.inferred` | IntentEngine | 用户纠正信号 |
| `conversation.teaching.inferred` | IntentEngine | 用户教学信号 |
| `intent.unknown.discovered` | IntentEngine | 未知意图发现 |
| `intent.complex.flagged` | IntentEngine | 复杂意图标记 |
| `aeo.intent.registered` | AEO | 新意图注册 |
| `aeo.intent.dormant` | AEO | 意图休眠 |
| `aeo.intent.deprecated` | AEO | 意图废弃 |
| `system.intent_engine.degraded` | IntentEngine | 引擎降级通知 |

### 3.7 错误码定义

| 错误码 | 触发条件 | 是否阻塞 |
|--------|---------|---------|
| `E_INVALID_TYPE` | type不符合noun.verb语法 | ✅ |
| `E_PAYLOAD_TOO_LARGE` | payload > 64KB | ✅ |
| `E_LAYER_REQUIRED` | 无法推断layer | ✅ |
| `E_LLM_TIMEOUT` | LLM调用超30秒 | 降级到正则 |
| `E_LLM_RATE_LIMITED` | API返回429 | 降级到正则 |
| `E_REGISTRY_UNAVAILABLE` | intent-registry不可读 | 仅正则fallback |
| `W_NOUN_UNREGISTERED` | 名词未注册 | ❌ 警告 |

### 3.8 改动文件汇总

| # | 文件 | 操作 | Phase | 风险 |
|---|------|------|-------|------|
| 1 | `infrastructure/event-bus/bus-adapter.js` | **新建** | P1 | 低 |
| 2 | `infrastructure/pipeline/l3-pipeline.js` L24 | 改require路径 | P1 | 低 |
| 3 | `infrastructure/tests/l3-e2e-test.js` L23 | 改require路径 | P1 | 低 |
| 4 | `infrastructure/pipeline/l3-pipeline.js` run() | 改consume为cursor模式 | P2 | 中 |
| 5 | `infrastructure/dispatcher/routes.json` | 新增user.intent.*路由 | P2 | 低 |
| 6 | `infrastructure/dispatcher/handlers/intent-dispatch.js` | **新建** | P2 | 低 |
| 7 | `infrastructure/observability/dashboard.js` | 新增decision-log数据源 | P2 | 低 |
| 8 | `infrastructure/event-bus/bus-adapter.js` | isc.rule.*钩子 | P3 | 中 |
| 9 | `infrastructure/pipeline/l3-pipeline.js` | CRAS→Registry联动 | P3 | 中 |
| 10 | `infrastructure/event-bus/bus-adapter.js` | AEO→DecisionLog联动 | P3 | 低 |

**不需要改动的文件**（方案A核心优势）：
- ✅ 全部7个旧event-bridge — 不动
- ✅ `infrastructure/event-bus/bus.js` — 不动
- ✅ `infrastructure/event-bus/handlers/memory-archiver.js` — 不动
