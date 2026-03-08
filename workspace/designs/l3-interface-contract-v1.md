# L3 意图识别层接口契约 v1.0

> **版本**: v1.0.0
> **作者**: 系统架构师（裁决殿裁决 Day 1）
> **日期**: 2026-03-05
> **状态**: 契约定义（签名+数据格式+错误码+依赖方向）
> **上游依赖**: isc-event-dto-binding-design-v4.3
> **本文性质**: 接口契约文档，不是代码实现。所有签名为规范定义，实现必须严格遵守。

---

## TL;DR

本文档定义L3意图识别层与L1（对象生命周期）/L2（量化阈值）的全部接口边界。核心契约三件套：**EventBus**（事件总线的读写协议）、**IntentEngine**（意图识别引擎的输入输出格式）、**Intent Registry**（意图注册表的数据模型与生命周期）。附带强制性的依赖方向约束和决策日志格式。

**一句话原则**：L3可以消费L1/L2的事件，但L1/L2永远不知道L3的存在。

---

## 第一部分：EventBus 接口签名

### 1.1 事件结构定义（Event Schema）

所有通过EventBus传输的事件必须符合以下结构。这是L1/L2/L3共用的唯一事件信封格式。

```typescript
interface Event {
  // ─── 必填字段 ───
  id:        string;      // 全局唯一事件ID，格式: evt_{timestamp_base36}_{random_6}
  type:      string;      // 事件类型，遵循 noun.verb 语法（见v4.3 §2.2）
  payload:   object;      // 事件负载，结构由type决定（见§1.4）
  timestamp: number;      // 事件产生时间，Unix毫秒时间戳
  source:    string;      // 事件产生者标识（探针ID / handler ID / 子系统名）
  layer:     "L1" | "L2" | "L3" | "L4" | "L5" | "META";  // 事件所属认知层

  // ─── 可选字段（由EventBus自动注入） ───
  metadata?: {
    trace_id?:       string;   // 端到端追踪ID，格式: trc_{base36}_{random_6}
    span_id?:        string;   // 当前span ID，格式: spn_{random_8}
    parent_span_id?: string;   // 父span ID（因果链追踪）
    caused_by?:      string;   // 触发本事件的上游事件ID
    triggers?:       string[]; // 本事件触发的下游事件ID列表（异步回填）
  };
}
```

**字段约束**：

| 字段 | 类型 | 必填 | 最大长度 | 校验规则 |
|------|------|------|---------|---------|
| `id` | string | ✅ | 32 | `/^evt_[a-z0-9_]{6,26}$/` |
| `type` | string | ✅ | 128 | `/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*\.[a-z_]+$/`（noun.verb格式） |
| `payload` | object | ✅ | 64KB（序列化后） | 必须可 JSON.stringify |
| `timestamp` | number | ✅ | — | Unix毫秒，必须 > 1700000000000（2023-11-14之后） |
| `source` | string | ✅ | 64 | `/^[a-z][a-z0-9_-]*$/` |
| `layer` | enum | ✅ | — | 只允许 L1/L2/L3/L4/L5/META 六个值 |

### 1.2 bus.emit() 签名

```typescript
/**
 * 向事件总线写入一条事件。
 * 
 * 底层行为：将事件序列化为JSON追加到 events.jsonl（O(1) append）。
 * trace_id / span_id 由总线自动注入，调用方无需关心。
 * 
 * @param type    - 事件类型（noun.verb 格式）
 * @param payload - 事件负载对象
 * @param source  - 事件来源标识
 * @param options - 可选参数
 * @returns       - EmitResult
 * @throws        - EventBusError
 */
function emit(
  type:    string,
  payload: object,
  source:  string,
  options?: EmitOptions
): EmitResult;

interface EmitOptions {
  layer?:         "L1" | "L2" | "L3" | "L4" | "L5" | "META";  // 默认由type前缀推断
  parentTraceId?: string;   // 显式指定父trace（用于因果链关联）
  dedup?:         boolean;  // 启用500ms去重窗口（事件风暴抑制），默认false
  batch?:         string;   // 批量合并key（相同key在窗口内合并为一条），默认null
}

interface EmitResult {
  eventId:  string;   // 生成的事件ID
  traceId:  string;   // 自动生成或继承的trace ID
  spanId:   string;   // 当前事件的span ID
}
```

**emit行为契约**：

1. **原子性**：单次emit要么完整写入events.jsonl，要么不写入。不存在部分写入。
2. **顺序性**：同一进程内的emit保证写入顺序与调用顺序一致。
3. **名词校验**：emit前检查type中的名词是否在noun-registry.jsonl中注册。未注册名词触发 `system.naming.unregistered_noun.detected` 警告事件，但**不阻塞**写入（宽松模式）。
4. **layer推断规则**（当options.layer未指定时）：
   - type以 `user.intent.` / `user.sentiment.` / `conversation.` / `intent.` 开头 → L3
   - type以 `isc.` / `skill.` / `infra.` / `config.` 开头 → L1
   - type以 `quality.` / `capability.` / `security.` 开头且含 `threshold_crossed` / `detected` / `gap_found` → L2
   - type以 `knowledge.` 开头 → L4
   - type以 `system.failure_pattern.` / `system.patch_cycle.` 开头 → L5
   - type以 `evolution.` 开头 → META
   - **无法推断时必须显式指定，否则抛出 E_LAYER_REQUIRED**
5. **去重窗口**：当 `dedup=true` 时，500ms内相同 `(type, source)` 的事件只写入第一条，后续丢弃并返回第一条的eventId。

### 1.3 bus.consume() 签名

```typescript
/**
 * 从事件总线消费事件。
 * 
 * 基于cursor的消费模型：每个consumerId维护独立读取位置。
 * 未ack的事件在下次consume时仍会返回（at-least-once语义）。
 * 
 * @param consumerId - 消费者唯一标识（每个消费方必须使用固定的consumerId）
 * @param filter     - 过滤条件
 * @returns          - 匹配的事件数组（按timestamp升序）
 * @throws           - EventBusError
 */
function consume(
  consumerId: string,
  filter:     ConsumeFilter
): Event[];

interface ConsumeFilter {
  // ─── 类型过滤（type_filter） ───
  // 通配规则：
  //   精确匹配:  'user.intent.file_request.inferred'
  //   前缀通配:  'user.intent.*'     → 匹配 user.intent 下任意子路径
  //   后缀通配:  '*.failed'          → 匹配任何以 .failed 结尾的事件
  //   中间通配:  'user.*.inferred'   → 匹配 user 下任意中间段以 .inferred 结尾
  //   全部匹配:  '*'                 → 匹配所有事件类型
  //   多类型:    不支持（需要多次consume或使用前缀通配）
  //
  // 通配符转正则规则：
  //   * → .+（至少匹配一个字符，不匹配空串）
  //   . → 精确匹配点号（转义为 \.）
  type_filter?: string;     // 默认: '*'（匹配所有）

  // ─── 时间过滤 ───
  since?: number;           // Unix毫秒时间戳，只返回该时间之后的事件

  // ─── 层级过滤 ───
  layer?: "L1" | "L2" | "L3" | "L4" | "L5" | "META";  // 只返回指定层的事件

  // ─── 数量限制 ───
  limit?: number;           // 最多返回N条事件，默认: 1000，最大: 10000
}
```

**consume行为契约**：

1. **cursor语义**：每个consumerId维护独立的文件offset cursor。consume从cursor位置开始读取，不修改cursor。cursor仅在ack时前移。
2. **过滤顺序**：先type_filter → 再since → 再layer → 最后limit截断。
3. **返回顺序**：始终按timestamp升序返回。
4. **空结果**：无匹配事件时返回空数组 `[]`，不抛错。
5. **at-least-once**：未ack的事件可能在后续consume中重复返回。消费方必须具备幂等性。
6. **性能约束**：单次consume扫描上限为events.jsonl中最近100MB数据。超出范围的历史事件不可消费（需归档查询）。

### 1.4 bus.ack() 签名

```typescript
/**
 * 确认事件已被消费（推进cursor）。
 * 
 * @param consumerId - 消费者标识（与consume时一致）
 * @param eventId    - 要确认的事件ID
 */
function ack(consumerId: string, eventId: string): void;
```

**ack行为契约**：O(1) 追加写入 acks.jsonl，不重写文件。

### 1.5 L3 特定的事件payload格式

L3层事件的payload除遵守通用约束外，必须包含以下L3专属字段：

```typescript
// L3事件payload的公共基类
interface L3EventPayload {
  intent_id?:        string;   // 命中的意图ID（来自intent-registry）
  intent_type?:      string;   // 意图大类（file_request / vision_task / frustration 等）
  category:          "IC1" | "IC2" | "IC3" | "IC4" | "IC5";  // 意图分类
  confidence:        number;   // 置信度 [0.0, 1.0]
  reasoning?:        string;   // LLM推理说明（一句话）
  message_id?:       string;   // 触发消息ID
  message_excerpt:   string;   // 消息摘要（≤200字符）
  source_engine:     "llm" | "regex_fallback";  // 识别引擎来源
}

// IC2 规则触发意图的扩展payload
interface IC2Payload extends L3EventPayload {
  category:      "IC2";
  mapped_event:  string;    // 映射的事件类型（来自intent-registry.mapped_event）
  mapped_rules:  string[];  // 对应的ISC规则ID列表
}

// IC1 情绪意图的扩展payload
interface IC1Payload extends L3EventPayload {
  category:          "IC1";
  sentiment_type:    "frustration" | "satisfaction" | "confusion" | "urgency";
  sentiment_score:   number;   // 情绪强度 [-1.0, 1.0]（负=负面，正=正面）
  prior_sentiment?:  string;   // 此前情绪状态（用于shift检测）
}

// IC3 复杂意图的扩展payload（标记但不在快通道处理）
interface IC3Payload extends L3EventPayload {
  category:               "IC3";
  requires_context_rounds: string;   // 预计需要的上下文轮数，如"5+"
  deferred_to:             "slow_channel";  // 延迟到慢通道处理
}

// 未知意图发现的payload
interface UnknownIntentPayload {
  suggested_id:     string;   // "unknown_" 前缀 + 简短描述
  category:         string;   // 推测的分类
  confidence:       number;
  reasoning:        string;
  message_excerpt:  string;
  discovered_at:    number;   // Unix毫秒时间戳
}
```

### 1.6 错误码定义

所有EventBus操作的错误通过 `EventBusError` 抛出，包含统一的错误码。

```typescript
class EventBusError extends Error {
  code:    string;   // 错误码
  detail:  string;   // 人类可读描述
  context: object;   // 上下文信息（type、consumerId等）
}
```

| 错误码 | 触发条件 | 严重度 | 是否阻塞 |
|--------|---------|--------|---------|
| `E_INVALID_TYPE` | type不符合 noun.verb 语法 | ERROR | ✅ 阻塞emit |
| `E_PAYLOAD_TOO_LARGE` | payload序列化后超过64KB | ERROR | ✅ 阻塞emit |
| `E_LAYER_REQUIRED` | 无法推断layer且未显式指定 | ERROR | ✅ 阻塞emit |
| `E_INVALID_LAYER` | layer值不在允许的枚举中 | ERROR | ✅ 阻塞emit |
| `E_SOURCE_EMPTY` | source为空字符串或undefined | ERROR | ✅ 阻塞emit |
| `E_TIMESTAMP_INVALID` | timestamp不是有效的Unix毫秒 | ERROR | ✅ 阻塞emit |
| `E_EVENTS_FILE_CORRUPT` | events.jsonl损坏无法追加 | FATAL | ✅ 阻塞emit，触发selfCheck修复 |
| `E_CONSUMER_NOT_FOUND` | consumerId无对应cursor | WARN | ❌ 不阻塞，从文件头开始消费 |
| `E_TYPE_FILTER_INVALID` | type_filter含非法字符 | ERROR | ✅ 阻塞consume |
| `E_LIMIT_EXCEEDED` | limit超过10000 | WARN | ❌ 不阻塞，截断为10000 |
| `W_NOUN_UNREGISTERED` | type中的名词未在noun-registry注册 | WARN | ❌ 不阻塞emit，emit警告事件 |
| `W_DEDUP_DROPPED` | 事件被去重窗口丢弃 | INFO | ❌ 不阻塞，返回原事件的eventId |

---

## 第二部分：IntentEngine 接口签名

### 2.1 scan() 签名

```typescript
/**
 * 意图识别主入口。
 * 
 * 由CRAS快通道（5min cron）调用，或由l3-pipeline编排层调用。
 * 主路径：LLM推理（GLM-5）。
 * 降级路径：正则fallback（无API Key或LLM失败时自动切换）。
 * 
 * @param conversationSlice - 对话片段数组
 * @returns                 - 识别结果（含intents数组、decision_logs、skipped标志）
 * @throws                  - IntentEngineError
 */
async function scan(conversationSlice: MessageSlice[]): Promise<ScanResult>;
```

### 2.2 输入格式（conversationSlice / MessageSlice）

```typescript
/**
 * scan() 接受对话片段数组作为输入。
 * l3-pipeline 通过 _extractConversationSlice(event) 将事件转为此格式。
 */
type ConversationSlice = MessageSlice[];

interface MessageSlice {
  role:       "user" | "assistant" | "system";  // 消息角色
  content:    string;    // 消息全文
  timestamp?: string;    // ISO-8601 时间戳（可选）
}
```

**注意**：早期设计曾定义 `RecognizeContext` 包装对象（含 window/history/config），
当前实现直接接受 `MessageSlice[]` 数组。窗口配置、历史上下文等由 l3-pipeline
编排层在调用 `scan()` 前自行处理，IntentScanner 本身不感知这些参数。
```

### 2.3 输出格式（RecognizeResult）

```typescript
interface RecognizeResult {
  // ─── 核心识别结果 ───
  message_index:  number;       // 对应messages数组的索引
  message_id:     string;       // 消息ID（冗余，便于下游使用）
  intent_type:    string;       // 意图类型标识
                                //   已注册: intent-registry中的intent_id（如"file_request"）
                                //   未知:   "unknown_" + 简短描述（如"unknown_code_review"）
                                //   复杂:   "complex_pending"（IC3标记）
  confidence:     number;       // 置信度 [0.0, 1.0]
  category:       "IC1" | "IC2" | "IC3" | "IC4" | "IC5";  // 意图分类

  // ─── 元数据 ───
  metadata: {
    engine:          "llm" | "regex_fallback";    // 实际使用的识别引擎
    model?:          string;                       // LLM模型标识（如"{{MODEL_DEEP_THINKING}}"）
    latency_ms:      number;                       // 识别耗时（毫秒）
    registry_version: string;                      // 使用的intent-registry版本（ISO时间戳）
    matched_examples?: string[];                   // 命中的注册表示例（调试用）
  };

  // ─── 决策日志（每条识别结果必须附带） ───
  decision_log: DecisionLogEntry;
}
```

### 2.4 降级行为定义

IntentEngine在LLM不可用时必须执行确定性降级，不允许静默失败。

```
降级决策树：

┌─────────────────────────────────────┐
│  scan(conversationSlice) 被调用       │
└──────────────┬──────────────────────┘
               │
        ┌──────▼──────┐
        │ config.model │
        └──────┬──────┘
               │
    ┌──────────┼──────────────┐
    │ "auto"   │ "opus"/"glm" │
    │          │              │
    ▼          ▼              ▼
  先GLM-5   指定模型       指定模型
    │          │              │
    ├── 成功 ──► 返回结果     │
    │                        │
    ├── 失败/超时             │
    │   └── escalate到Opus ──┤
    │       ├── 成功 → 返回   │
    │       ├── 失败 ────────┤
    │                        │
    └────────────────────────┤
                             ▼
                    ┌────────────────┐
                    │ 正则 Fallback   │
                    │ (regex_fallback)│
                    └────────┬───────┘
                             │
                    ┌────────▼───────┐
                    │ 使用INTENT_    │
                    │ PATTERNS静态   │
                    │ 正则库匹配     │
                    └────────┬───────┘
                             │
                    ┌────────▼─────────────────┐
                    │ 命中 → confidence=0.95   │
                    │        engine=regex_fallback│
                    │ 未命中 → 返回空数组       │
                    └──────────────────────────┘
```

**降级契约表**：

| 条件 | 降级行为 | metadata.engine | confidence范围 | 覆盖范围 |
|------|---------|----------------|---------------|---------|
| GLM-5可用 | 正常LLM推理 | `"llm"` | [0.0, 1.0] | 全部IC1-IC5 |
| GLM-5不可用，Opus可用 | Opus推理 | `"llm"` | [0.0, 1.0] | 全部IC1-IC5 |
| 所有LLM不可用 | 正则fallback | `"regex_fallback"` | 0.95（固定） | 仅IC2中已配正则的意图 |
| 正则也无匹配 | 返回空数组 | — | — | — |
| events.jsonl不可读 | 抛出 `E_EVENTS_UNAVAILABLE` | — | — | — |

**降级限制声明**：
- 正则fallback**只能识别IC2类意图**（已在INTENT_PATTERNS中硬编码的规则触发意图）
- IC1（情绪）、IC3（复杂）、IC4（隐含）、IC5（多意图拆分）在降级模式下**完全不可用**
- 降级时必须emit `system.intent_engine.degraded` 事件，payload包含降级原因和影响范围

### 2.5 IntentEngine 错误码

| 错误码 | 触发条件 | 是否降级 |
|--------|---------|---------|
| `E_CONTEXT_EMPTY` | messages为空数组 | 不降级，直接返回空 |
| `E_CONTEXT_TOO_LARGE` | messages超过max_messages | 截断到max_messages |
| `E_LLM_TIMEOUT` | LLM调用超过30秒 | 降级到正则fallback |
| `E_LLM_RATE_LIMITED` | LLM API返回429 | 降级到正则fallback |
| `E_LLM_PARSE_FAILED` | LLM返回的JSON无法解析 | 重试1次，再失败降级到正则 |
| `E_REGISTRY_UNAVAILABLE` | intent-registry.json不可读 | 仅使用正则fallback |
| `E_EVENTS_UNAVAILABLE` | events.jsonl不可读 | 抛出错误，不降级 |

---

## 第三部分：Intent Registry 格式

### 3.1 intent-registry.json Schema

**文件位置**：`infrastructure/event-bus/intent-registry.json`
**所有权**：AEO负责写入和治理，CRAS/IntentEngine只读消费。

```json
{
  "$schema": "intent-registry-v1",
  "$version_rule": "ISO-8601时间戳，每次AEO修改时更新",

  "version": "2026-03-05T00:00:00Z",

  "intents": [
    {
      "id":                    "string  — 唯一标识，点分格式，如 user.emotion.positive",
      "category":              "IC1|IC2|IC3|IC4|IC5",
      "name":                  "string  — 人类可读名称",
      "description":           "string  — 详细描述，用于注入LLM prompt",

      "examples":              ["string — 正例，注入LLM做few-shot"],
      "anti_examples":         ["string — 反例，防止误分类"],

      "isc_rule_ref":          "string  — 对应的ISC规则ID（IC2类可选）",

      "regex_patterns":        ["string — 正则表达式（降级用，可选）"],

      "confidence_threshold":  "number  — 最低置信度门控 [0.0, 1.0]，默认0.6",

      "status":                "draft|active|deprecated|archived",

      "created_at":            "string  — ISO-8601时间戳",
    }
  ],

  "categories": {
    "IC1": { "name": "string", "description": "string" },
    "IC2": { "name": "string", "description": "string" },
    "IC3": { "name": "string", "description": "string" },
    "IC4": { "name": "string", "description": "string" },
    "IC5": { "name": "string", "description": "string" }
  },

  "governance": {
    "dormancy_days":          "number — 低频降级天数阈值，默认30",
    "dormancy_min_triggers":  "number — 降级最低触发数，默认3",
    "deprecation_days":       "number — 废弃天数阈值，默认90",
    "mece_check_required":    "boolean — 新增意图是否强制MECE校验",
    "aeo_approval_required":  "boolean — 新增意图是否需AEO审批"
  }
}
```

### 3.2 字段校验规则

| 字段 | 必填 | 校验 |
|------|------|------|
| `id` | ✅ | 点分格式，全局唯一，如 `user.emotion.positive` |
| `category` | ✅ | 枚举 IC1-IC5 |
| `name` | ✅ | 非空，≤64字符 |
| `description` | ✅ | 非空，≤512字符 |
| `examples` | ✅ | 数组，≥2条，每条≤200字符 |
| `anti_examples` | 推荐 | 数组，建议≥1条 |
| `isc_rule_ref` | 可选 | ISC规则ID（IC2类推荐填写） |
| `regex_patterns` | 可选 | 合法正则表达式 |
| `confidence_threshold` | ✅ | [0.0, 1.0] |
| `status` | ✅ | 枚举 draft/active/deprecated/archived |

### 3.3 意图生命周期状态机

```
                    AEO创建
                       │
                       ▼
                 ┌───────────┐
                 │   draft    │  ← 草稿态：已定义但未激活
                 └─────┬─────┘
                       │ AEO审批 + MECE校验通过
                       ▼
                 ┌───────────┐
            ┌───→│  active    │  ← 激活态：IntentEngine可识别
            │    └─────┬─────┘
            │          │
            │          ├── 30天内触发<3次
            │          ▼
            │    ┌───────────┐
            │    │  dormant   │  ← 休眠态：仍可识别，但标记为低频
            │    └─────┬─────┘
            │          │
            │          ├── 重新活跃（触发数回升）→ 回到 active
            │          │
            │          ├── 90天未触发
            │          ▼
            │    ┌───────────┐
            │    │ deprecated │  ← 废弃态：IntentEngine跳过识别
            │    └─────┬─────┘
            │          │
            │          ├── AEO人工恢复 → 回到 active
            │          │
            │          ├── 确认不再需要
            │          ▼
            │    ┌───────────┐
            └────│  archived  │  ← 归档态：从注册表移除，保留在历史记录
                 └───────────┘
```

**状态转换规则**：

| 转换 | 触发条件 | 执行者 | 是否需人工确认 |
|------|---------|--------|--------------|
| draft → active | MECE校验通过 + AEO审批 | AEO自动流程 | ✅ 用户确认 |
| active → dormant | 30天内 trigger_count < dormancy_min_triggers | AEO定期扫描 | ❌ 自动 |
| dormant → active | trigger_count回升 ≥ dormancy_min_triggers | AEO定期扫描 | ❌ 自动 |
| dormant → deprecated | 90天未触发（trigger_count_30d = 0 连续3期） | AEO定期扫描 | ❌ 自动 |
| deprecated → active | AEO人工恢复 | AEO人工操作 | ✅ 用户确认 |
| deprecated → archived | 确认不再需要 | AEO人工操作 | ✅ 用户确认 |
| archived → active | 重新启用（罕见） | AEO人工操作 | ✅ 用户确认 |

**IntentEngine对各状态的行为**：

| 状态 | IntentEngine行为 |
|------|-----------------|
| `draft` | **跳过**——不注入prompt，不识别 |
| `active` | **识别**——正常注入prompt，正常匹配 |
| `dormant` | **识别**——仍注入prompt，但在结果metadata中标记 `dormant: true` |
| `deprecated` | **跳过**——不注入prompt，不识别 |
| `archived` | **不可见**——已从注册表移除 |

### 3.4 版本控制规则

1. **版本标识**：`version` 字段使用ISO-8601时间戳，每次修改自动更新。
2. **变更追踪**：每条intent的 `version_history` 数组记录所有变更。每条记录包含版本号、日期、变更摘要、变更人。
3. **向后兼容**：
   - `$schema` 版本变更（如 `intent-registry-v1` → `intent-registry-v2`）为**Breaking Change**，需协调所有消费方。
   - 新增字段（添加optional字段）为**非Breaking Change**，消费方应容忍未知字段。
   - 删除/重命名字段为**Breaking Change**。
4. **并发写入防护**：AEO写入registry前必须校验文件mtime，若mtime已变更（被其他进程修改）则重新加载后合并。
5. **IntentEngine热重载**：IntentEngine通过文件mtime检测registry变更，变更后自动热重载，无需重启。

---

## 第四部分：依赖方向图

### 4.1 层间依赖方向（强制单向）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         层间依赖方向（铁律）                                  │
│                                                                             │
│                                                                             │
│    ┌──────────┐         ┌──────────┐         ┌──────────┐                  │
│    │    L1    │         │    L2    │         │    L3    │                  │
│    │ 对象生命 │         │ 量化阈值 │         │ 语义意图 │                  │
│    │   周期   │         │          │         │   识别   │                  │
│    └────┬─────┘         └────┬─────┘         └────┬─────┘                  │
│         │                    │                    │                         │
│         │    事件总线消费     │    事件总线消费     │                         │
│         │ ──────────────→   │ ──────────────→   │                         │
│         │                    │                    │                         │
│         │    ╔═══════════╗   │    ╔═══════════╗   │                         │
│         │    ║ 🚫 禁止    ║   │    ║ 🚫 禁止    ║   │                         │
│         │    ║ L1不得import║   │    ║ L2不得import║   │                         │
│         │    ║ L2/L3模块  ║   │    ║ L3模块     ║   │                         │
│         │    ╚═══════════╝   │    ╚═══════════╝   │                         │
│         │                    │                    │                         │
│         │  ← ← ← ← ← ← ← ←│← ← ← ← ← ← ← ← │                         │
│         │    ╔═══════════════════════════════╗    │                         │
│         │    ║ 🚫🚫🚫 绝对禁止反向依赖 🚫🚫🚫 ║    │                         │
│         │    ║ L3不得直接调用L1/L2的函数     ║    │                         │
│         │    ║ L2不得直接调用L1的函数         ║    │                         │
│         │    ║ 所有跨层通信必须经由EventBus   ║    │                         │
│         │    ╚═══════════════════════════════╝    │                         │
│         │                    │                    │                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 事件流方向（数据流向）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         事件流方向图                                         │
│                                                                             │
│                                                                             │
│  ┌───────────┐    emit    ┌────────────────┐   consume    ┌──────────────┐ │
│  │  L1 探针   │ ────────→ │                │ ──────────→ │  L2 扫描器   │ │
│  │ git-hook   │           │                │              │  scanners    │ │
│  │ event-     │           │                │              │              │ │
│  │ bridge     │           │   EventBus     │              └──────┬───────┘ │
│  │ watchers   │           │  (events.jsonl)│                     │ emit    │
│  └───────────┘            │                │ ←───────────────────┘         │
│                           │                │                               │
│                           │                │   consume    ┌──────────────┐ │
│                           │                │ ──────────→ │  L3 CRAS     │ │
│                           │                │              │  IntentEngine│ │
│                           │                │              │  意图识别    │ │
│                           │                │              └──────┬───────┘ │
│                           │                │ ←───────────────────┘ emit    │
│                           │                │   (L3意图事件)                │
│                           │                │                               │
│                           │                │   consume    ┌──────────────┐ │
│                           │                │ ──────────→ │  Dispatcher  │ │
│                           │                │              │  路由到      │ │
│                           │                │              │  handler执行 │ │
│                           └────────────────┘              └──────┬───────┘ │
│                                    ▲                             │ emit    │
│                                    └─────────────────────────────┘         │
│                                      (执行结果事件，闭环)                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 模块依赖矩阵（禁止线明示）

```
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

✅ = 允许依赖     ❌ = 无需依赖     🚫 = 禁止依赖
```

**禁止线清单**：

| 禁止的依赖 | 原因 | 替代方案 |
|------------|------|---------|
| L1 → L2 | L1是纯粹的生命周期探针，不应知道阈值逻辑 | L2通过EventBus消费L1事件 |
| L1 → L3 | L1不应知道意图识别的存在 | L3通过EventBus消费L1事件 |
| L2 → L3 | L2是量化扫描器，不应知道语义识别 | L3通过EventBus消费L2事件 |
| L3 → L1 | L3不得直接调用L1的钩子/探针函数 | L3通过EventBus消费L1事件 |
| L3 → L2 | L3不得直接调用L2的扫描器函数 | L3通过EventBus消费L2事件 |
| 任何层 → EventBus内部 | 各层只通过emit/consume/ack公开接口与EventBus交互，不得访问events.jsonl文件 | 使用公开API |

### 4.4 依赖方向检查规则（CI门禁）

以下规则在代码提交时自动检查：

```
规则1: L1目录下的文件不得 require/import L2或L3目录的模块
规则2: L2目录下的文件不得 require/import L3目录的模块  
规则3: L3目录下的文件不得 require/import L1或L2目录的模块（只能通过bus.consume获取数据）
规则4: 所有层的文件只能 require EventBus的公开接口（bus.js导出的 emit/consume/ack）
规则5: 任何文件不得直接 fs.read/fs.write events.jsonl（只能通过bus接口操作）
```

---

## 第五部分：Decision Log 格式

### 5.1 DecisionLogEntry 结构

每条意图识别结果必须附带决策日志。这是可审计性的基础。

```typescript
interface DecisionLogEntry {
  // ─── 必填字段 ───
  what:       string;    // 做了什么决策（一句话）
                         // 示例: "将消息归类为 file_request 意图（IC2）"
                         // 示例: "标记为未知意图 unknown_code_review"
                         // 示例: "降级到正则fallback，命中 frustration 模式"

  why:        string;    // 为什么做这个决策（推理链）
                         // 示例: "消息包含'发MD源文件'，精确匹配intent-registry中file_request的example"
                         // 示例: "LLM超时，正则匹配到/又.*错了/模式"

  confidence: number;    // 决策置信度 [0.0, 1.0]

  alternatives_considered: Alternative[];  // 考虑过的其他选项

  timestamp:  number;    // 决策产生时间（Unix毫秒）

  // ─── 可选字段 ───
  engine:     "llm" | "regex_fallback";   // 决策引擎
  model?:     string;                      // 使用的模型
  latency_ms: number;                      // 决策耗时
}

interface Alternative {
  intent_type: string;    // 被考虑的替代意图
  confidence:  number;    // 该替代的置信度
  reason_rejected: string;  // 被否决的原因
                            // 示例: "置信度0.3低于阈值0.6"
                            // 示例: "与file_request语义重叠，优先选择已注册意图"
}
```

### 5.2 Decision Log 存储

```
存储位置: infrastructure/event-bus/decision-logs/YYYY-MM-DD.jsonl
保留策略: 保留最近30天，超过30天的归档到 .archive/ 目录
单条格式: 一行一条JSON（JSONL格式，与events.jsonl一致）

每行内容:
{
  "log_id":        "dl_{timestamp_base36}_{random_6}",
  "event_id":      "对应的事件ID（如果emit了事件）",
  "scan_input_hash": "输入对话片段的哈希（用于去重和回溯）",
  "entry":         { ... DecisionLogEntry ... },
  "created_at":    1709596800000
}
```

### 5.3 Decision Log 示例

**正常LLM识别**：
```json
{
  "log_id": "dl_m1abc_x7k9p2",
  "event_id": "evt_m1abc_file01",
  "entry": {
    "what": "将消息归类为 file_request 意图（IC2）",
    "why": "GLM-5推理：消息'发MD源文件给我'与intent-registry中file_request的example'发MD源文件'语义匹配度0.92，超过confidence_threshold 0.7",
    "confidence": 0.92,
    "alternatives_considered": [
      {
        "intent_type": "vision_task",
        "confidence": 0.15,
        "reason_rejected": "消息不涉及图片分析，置信度0.15远低于阈值0.7"
      },
      {
        "intent_type": "unknown_document_query",
        "confidence": 0.35,
        "reason_rejected": "file_request已覆盖此场景，优先使用已注册意图"
      }
    ],
    "timestamp": 1709596800000,
    "engine": "llm",
    "model": "{{MODEL_DEEP_THINKING}}",
    "latency_ms": 1200
  }
}
```

**降级到正则fallback**：
```json
{
  "log_id": "dl_m1def_p3q8r1",
  "event_id": "evt_m1def_frust01",
  "entry": {
    "what": "降级到正则fallback，命中 frustration 模式",
    "why": "GLM-5调用超时（30s），Opus调用返回429限流。降级到正则匹配，消息'又搞错了'命中/又.*错了/模式",
    "confidence": 0.95,
    "alternatives_considered": [
      {
        "intent_type": "correction",
        "confidence": 0.80,
        "reason_rejected": "正则fallback模式下frustration先匹配，correction未命中（正则顺序优先）"
      }
    ],
    "timestamp": 1709596860000,
    "engine": "regex_fallback",
    "latency_ms": 2
  }
}
```

**未知意图发现**：
```json
{
  "log_id": "dl_m1ghi_s5t2u8",
  "event_id": null,
  "entry": {
    "what": "发现未知意图 unknown_code_review，emit intent.unknown.discovered",
    "why": "消息'帮我review一下这段代码'不匹配任何已注册意图。LLM推理认为这是代码审查请求，但intent-registry中无对应条目。",
    "confidence": 0.78,
    "alternatives_considered": [
      {
        "intent_type": "file_request",
        "confidence": 0.25,
        "reason_rejected": "用户请求的是代码审查而非文件发送"
      }
    ],
    "timestamp": 1709596920000,
    "engine": "llm",
    "model": "{{MODEL_DEEP_THINKING}}",
    "latency_ms": 980
  }
}
```

---

## 附录A：类型汇总速查

### A.1 L3层事件类型清单

| 事件类型 | 层 | 来源 | 说明 |
|---------|-----|------|------|
| `user.intent.{intent_id}.inferred` | L3 | IntentEngine | 已注册意图被识别 |
| `user.sentiment.{type}.shifted` | L3 | IntentEngine | 情绪状态转变 |
| `conversation.correction.inferred` | L3 | IntentEngine | 用户纠正信号 |
| `conversation.teaching.inferred` | L3 | IntentEngine | 用户教学信号 |
| `conversation.topic.recurring` | L3 | SlowChannel | 话题反复出现 |
| `intent.unknown.discovered` | L3 | IntentEngine | 未知意图发现 |
| `intent.complex.flagged` | L3 | IntentEngine | 复杂意图标记 |
| `aeo.intent.registered` | L3 | AEO | 新意图正式注册 |
| `aeo.intent.dormant` | L3 | AEO | 意图降级为休眠 |
| `aeo.intent.deprecated` | L3 | AEO | 意图废弃 |
| `aeo.intent.mece_validated` | L3 | AEO | MECE校验通过 |
| `aeo.intent.mece_rejected` | L3 | AEO | MECE校验不通过 |
| `system.intent_engine.degraded` | L3 | IntentEngine | 引擎降级通知 |

### A.2 消费者ID命名规范

| consumerId | 使用方 | 用途 |
|-----------|--------|------|
| `cras-fast-channel` | CRAS快通道 | 消费 interaction.message.received |
| `cras-slow-channel` | CRAS慢通道 | 消费全量L3事件做日聚合 |
| `aeo-intent-discovery` | AEO意图治理 | 消费 intent.unknown.discovered |
| `dispatcher-l3` | Dispatcher | 消费L3事件路由到handler |
| `intent-engine-input` | IntentEngine | 消费消息事件做意图识别 |

---

## 附录B：契约变更控制

### B.1 变更分级

| 变更类型 | 示例 | 影响范围 | 审批级别 |
|---------|------|---------|---------|
| **Breaking** | Event Schema增删必填字段、错误码语义变更 | 所有消费方 | 裁决殿审议 |
| **Additive** | Event Schema增加可选字段、新增错误码 | 无影响 | AEO审批 |
| **Fix** | 修正文档描述错误、补充示例 | 无影响 | 直接提交 |

### B.2 版本号规则

本契约文档采用 `v{major}.{minor}.{patch}` 版本号：
- **major**：Breaking Change → v2.0.0
- **minor**：新增接口/字段 → v1.1.0
- **patch**：修正/补充 → v1.0.1

---

> **签署确认**：本契约经裁决殿Day 1审议通过后生效。所有L1/L2/L3的实现必须严格遵守本契约定义的接口签名、数据格式和依赖方向。违反依赖方向的代码变更将被CI门禁自动拒绝。

## 目标

> TODO: 请补充目标内容

## 方案

> TODO: 请补充方案内容

## 风险

> TODO: 请补充风险内容

## 验收

> TODO: 请补充验收内容

---

## 📋 架构评审清单 (自动生成)

**文档**: l3-interface-contract-v1
**生成时间**: 2026-03-06T13:01:12.507Z
**状态**: 待评审

### ⚠️ 缺失章节
- [ ] 补充「目标」章节
- [ ] 补充「方案」章节
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
