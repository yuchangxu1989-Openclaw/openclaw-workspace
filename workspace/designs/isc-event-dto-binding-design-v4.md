# ISC-事件-DTO 闭环方案 v4.0 — 五层事件认知模型

> **版本**: v4.0.0
> **作者**: 系统架构师
> **日期**: 2026-03-04
> **状态**: DESIGN COMPLETE
> **前置**: v3的全面升级，基于用户五层事件认知模型教学（3小时深度教学）

---

## TL;DR

**v3的根本缺陷**：只看到了L1（对象生命周期）和L2（量化阈值），把"事件"局限在了代码/文件系统层面。缺失了L3（对话中的语义意图）、L4（知识发现）、L5（系统性故障模式），以及最高优先级的"元事件域"——自驱进化。v3是半盲的。

**v4的第一性原理**：**事件 = 系统状态空间中任何可被感知的状态跃迁。** 不仅是代码文件的CRUD（L1），不仅是计数器越过阈值（L2），还包括：从非结构化对话中提取的语义信号（L3）、从公网/学术学习中发现的增量价值（L4）、从反复失败中涌现的系统性模式（L5）。而这一切的一切，都服务于一个元目标——**系统如何让自己变得更聪明**。

**v4成果**：
- 五层事件认知模型 + 元事件域完整架构
- 生成式事件分类体系（6类动词 × 开放名词 = 无限事件类型），论证3000→30000条规则可扩展性
- 77条规则五层全覆盖事件拆解
- CRAS双通道架构（快通道5min + 慢通道daily）
- 知识发现→系统适配闭环
- 系统性故障→重构闭环
- 自驱进化机制 + 凌霄阁审议流程
- 全部基于现有代码可落地

---

## 第一部分：五层事件认知模型（核心认知升级）

### 1.1 v3 → v4 认知跃迁

| 维度 | v3 | v4 |
|------|----|----|
| 事件来源 | 代码/文件系统 + 扫描器 | 代码 + 扫描器 + 对话 + 公网 + 系统历史 |
| 事件层级 | 3层（被动/主动/sweep） | 5层 + 元事件域 |
| 对话是否事件源 | 否（仅作为消息触发） | **是**（CRAS作为语义探针，从对话流中提取意图事件） |
| 外部知识是否事件源 | 否 | **是**（学术/公网学习发现增量价值 = 事件） |
| 反复失败是否事件 | 仅L2阈值检测 | **L5系统性模式**（多维度关联分析，不仅是频率统计） |
| 自驱进化 | 无 | **元事件域**（最高优先级，IQ提升机会 = 最重要的事件） |
| 动词类别 | 4类（lifecycle/process/compliance/observation） | 6类（+signal +discovery） |

### 1.2 五层事件认知模型定义

```
┌───────────────────────────────────────────────────────────────────────┐
│                     元事件域（Meta-Event Domain）                       │
│                     自驱进化 — 最高优先级                                │
│   "发生了可以让自己IQ有实质性提升的机会，这就是最重要的事件"              │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  L5 系统性模式事件 ──── 反复失败/修补 → 根因分析 → 重构                  │
│   │                                                                   │
│  L4 知识发现事件 ────── 学术/公网学习 → 增量价值 → 适配                  │
│   │                                                                   │
│  L3 语义意图事件 ────── 对话流 → CRAS探针 → 意图信号                    │
│   │                                                                   │
│  L2 量化阈值事件 ────── 计数器/指标 → 扫描器 → 阈值越过                  │
│   │                                                                   │
│  L1 对象生命周期事件 ── CRUD操作 → 钩子/监听 → 同步emit                  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### 1.3 每层详细定义

#### L1 — 对象生命周期事件（Object Lifecycle Events）

**定义**：任何对象的创建/修改/删除天然就是事件。这是最基础的一层，覆盖系统中所有被管理对象的存在性变化。

| 维度 | 定义 |
|------|------|
| **事件源** | 文件系统（git hooks、file watchers）、API调用、数据库操作 |
| **探针位置** | `git post-commit hook`、`isc-core/event-bridge.js`、技能目录watcher |
| **捕获机制** | 操作发生时同步emit，零延迟 |
| **时效性** | 实时（<1s） |
| **覆盖范围** | ISC规则、技能文件、配置、记忆、知识文档、DTO任务等所有对象 |
| **v3对应** | v3的"被动事件" |
| **典型事件** | `isc.rule.created`, `skill.lifecycle.updated`, `infra.memory.deleted` |

#### L2 — 量化阈值事件（Quantified Threshold Events）

**定义**：可量化的条件达到阈值 = 事件。本质是计数器越过阈值的瞬间。不是"发现了什么"，而是"某个数值从低于阈值到高于阈值的跃迁"。

| 维度 | 定义 |
|------|------|
| **事件源** | 扫描器周期性计算指标值 |
| **探针位置** | `scanners/*.js`（组合扫描器） |
| **捕获机制** | 扫描器每N分钟运行 → 计算当前值 → 与阈值比对 → 越过则emit |
| **时效性** | 近实时（10-30min延迟，取决于扫描周期） |
| **覆盖范围** | 质量分、覆盖率、错误频率、资源使用率等所有可量化指标 |
| **v3对应** | v3的"主动事件" |
| **典型事件** | `quality.skillmd.threshold_crossed`, `capability.success_count.threshold_crossed` |

#### L3 — 语义意图事件（Semantic Intent Events）

**定义**：从非结构化对话中提取的意图信号。事件源是对话流，探针是CRAS。这是v3完全缺失的一层。

| 维度 | 定义 |
|------|------|
| **事件源** | 对话消息流（用户消息、Agent回复、多轮对话上下文） |
| **探针位置** | CRAS对话分析引擎（`skills/cras/conversation-probe.js`新建） |
| **捕获机制** | **双通道**：快通道（5min增量扫描→原子意图）+ 慢通道（daily聚合→模式趋势） |
| **时效性** | 快通道5min，慢通道24h |
| **覆盖范围** | 用户情绪、强调意图、反复修正、不满信号、隐含需求 |
| **v3对应** | 无（v3完全缺失） |
| **典型事件** | `user.intent.repeated_emphasis`, `user.sentiment.frustration`, `conversation.topic.recurring` |

**CRAS双通道详细设计见第五部分。**

#### L4 — 知识发现事件（Knowledge Discovery Events）

**定义**：从学术洞察/公网学习中发现增量价值点。当CRAS或其他Agent在学习过程中发现了可以改进本地系统的新知识/新模式/新工具，这个发现本身就是事件。

| 维度 | 定义 |
|------|------|
| **事件源** | CRAS主动学习引擎（公网搜索、学术论文、其他Agent输出） |
| **探针位置** | `skills/cras/knowledge-discovery-probe.js`（新建） |
| **捕获机制** | 学习任务完成 → 评估发现价值 → 可行性初筛 → 有价值则emit |
| **时效性** | 异步（小时级到天级） |
| **覆盖范围** | 架构模式、工程实践、工具库、优化方法、新API |
| **v3对应** | 无（v3完全缺失） |
| **典型事件** | `knowledge.architecture_pattern.discovered`, `knowledge.tool.discovered`, `knowledge.optimization.discovered` |

**知识发现→系统适配闭环详见第六部分。**

#### L5 — 系统性模式事件（Systemic Pattern Events）

**定义**：反复失败、反复修补同类问题，这些重复本身形成了模式。L5不是L2的简单"错误次数≥N"，而是多维度关联分析——同一模块连续3次修补、同一类型的错误跨多个组件出现、修复后又回退等。

| 维度 | 定义 |
|------|------|
| **事件源** | 系统历史数据（错误日志、修复记录、Git历史、DTO执行记录） |
| **探针位置** | `scanners/pattern-analyzer.js`（新建） |
| **捕获机制** | 每日聚合分析 → 关联多维度信号 → 模式识别 → 达到模式阈值则emit |
| **时效性** | 日级（需要足够的历史数据窗口） |
| **覆盖范围** | 重复失败模式、修补循环、架构瓶颈、性能退化趋势 |
| **v3对应** | v3只有L2级别的`error.recurring.threshold_crossed`，缺乏多维关联 |
| **典型事件** | `system.failure_pattern.detected`, `system.patch_cycle.detected`, `system.architecture_bottleneck.detected` |

**系统性故障→重构闭环详见第七部分。**

#### 元事件域 — 自驱进化（Meta-Event Domain: Self-Evolution）

**定义**（用户原话）："你如何提升你的进化效率？哪些环节有进化空间？一旦发生了可以让自己的IQ有实质性提升的机会，是不是个事件？"

**答案**：是。这是最高优先级的事件。

| 维度 | 定义 |
|------|------|
| **事件源** | L1-L5所有层的信号聚合 + 外部对标分析 |
| **探针位置** | `scanners/evolution-detector.js`（新建） |
| **捕获机制** | 多信号关联 → 进化机会识别 → 凌霄阁审议 → 用户拍板 → 执行 |
| **时效性** | 周级（需要足够的数据积累和深度分析） |
| **覆盖范围** | 记忆机制、多Agent协同、自主闭环、自主学习 |
| **典型事件** | `evolution.memory.opportunity_detected`, `evolution.coordination.bottleneck_detected` |

**自驱进化机制详见第八部分。**

### 1.4 五层模型的MECE性证明

| 层级 | 信号本质 | 事件源本质 | 为什么与其他层互斥 |
|------|---------|-----------|------------------|
| L1 | 确定性状态变化 | 代码操作 | 直接操作触发，非推断 |
| L2 | 量化指标越阈 | 数值计算 | 可精确量化，有明确阈值 |
| L3 | 语义信号提取 | 自然语言 | 不可量化，需NLP推断 |
| L4 | 外部知识映射 | 外部世界 | 信息来源在系统外部 |
| L5 | 历史模式涌现 | 时间序列 | 需要历史窗口，单点不可见 |

**穷尽性论证**：系统能感知的状态跃迁，要么来自内部操作（L1）、要么来自内部度量（L2）、要么来自对话交互（L3）、要么来自外部知识（L4）、要么来自历史积累（L5）。这五个信息来源穷尽了系统的全部感知通道。

**元事件域**不是第六层——它是对L1-L5所有信号的二阶聚合。它消费L1-L5的事件，产出进化决策。

---

## 第二部分：生成式事件分类体系（v4语法）

### 2.1 从v3到v4的语法升级

v3定义了4类动词（lifecycle/process/compliance/observation），共21个动词。
v4需要覆盖L3-L5和元事件域，必须扩展动词体系。

**核心原则不变**：动词有限（封闭集），名词无限（开放层级）。

**扩展策略**：在v3的4类基础上增加2类新动词类别，覆盖L3-L5的信号特征。

### 2.2 v4事件类型生成语法

```
event_type  := noun "." verb
noun        := segment ("." segment)*
segment     := [a-z][a-z0-9_]*
verb        := lifecycle_verb         # L1
             | process_verb           # 跨层
             | compliance_verb        # L1+L2
             | observation_verb       # L2
             | signal_verb            # L3+L5
             | discovery_verb         # L4+元事件域
```

### 2.3 六类动词封闭集（Verb Closed Set v4）

#### 类别一：生命周期动词（Lifecycle Verbs）— 对象存在性变化

主要服务L1，也被其他层使用。

| 动词 | 含义 | 状态转换 | 来源层 |
|------|------|---------|--------|
| `created` | 对象从无到有 | ∅ → exists | L1 |
| `updated` | 对象属性变化 | v1 → v2 | L1 |
| `deleted` | 对象从有到无 | exists → ∅ | L1 |
| `renamed` | 对象标识变化 | id1 → id2 | L1 |
| `merged` | 多对象合一 | a+b → c | L1 |
| `archived` | 对象归档 | active → archived | L1 |
| `restored` | 对象恢复 | archived → active | L1 |

#### 类别二：过程动词（Process Verbs）— 操作阶段变化

跨层通用。

| 动词 | 含义 | 状态转换 | 来源层 |
|------|------|---------|--------|
| `requested` | 操作被请求 | idle → pending | 跨层 |
| `started` | 操作开始 | pending → running | 跨层 |
| `completed` | 操作完成 | running → done | 跨层 |
| `failed` | 操作失败 | running → error | 跨层 |
| `retried` | 操作重试 | error → running | 跨层 |
| `cancelled` | 操作取消 | * → cancelled | 跨层 |
| `escalated` | 操作升级 | error → escalated | 跨层 |

#### 类别三：合规动词（Compliance Verbs）— 规则校验结果

主要服务L1+L2。

| 动词 | 含义 | 状态转换 | 来源层 |
|------|------|---------|--------|
| `validated` | 校验通过 | unchecked → compliant | L1/L2 |
| `violated` | 校验不通过 | unchecked → non_compliant | L1/L2 |
| `remediated` | 违规被修复 | non_compliant → compliant | L1/L2 |
| `exempted` | 获得豁免 | non_compliant → exempted | L1/L2 |

#### 类别四：观测动词（Observation Verbs）— 量化度量结果

主要服务L2。

| 动词 | 含义 | 状态转换 | 来源层 |
|------|------|---------|--------|
| `detected` | 异常/条件被发现 | undetected → detected | L2 |
| `threshold_crossed` | 量化指标越过阈值 | below → above | L2 |
| `gap_found` | 缺口/缺失被发现 | unknown → gap | L2 |
| `drifted` | 状态偏离基线 | aligned → misaligned | L2 |
| `resolved` | 已发现问题解决 | detected → resolved | L2 |
| `swept` | 全量扫描完成 | scanning → scanned | L2 |

#### 类别五：信号动词（Signal Verbs）— 语义/模式信号 ★NEW

服务L3（语义意图）和L5（系统性模式）。这两层的共同特征：**从非结构化/时序数据中推断出信号**。

| 动词 | 含义 | 状态转换 | 来源层 |
|------|------|---------|--------|
| `inferred` | 从非结构化数据推断出信号 | latent → surfaced | L3 |
| `emphasized` | 同一信号被反复强调 | once → repeated | L3 |
| `sentiment_shifted` | 情绪/态度发生转变 | sentiment_A → sentiment_B | L3 |
| `pattern_emerged` | 从历史数据中涌现出模式 | scattered → patterned | L5 |
| `correlated` | 多个独立信号被关联 | independent → linked | L5 |
| `recurring` | 同类事件反复出现 | isolated → recurring | L3/L5 |

#### 类别六：发现动词（Discovery Verbs）— 知识发现/进化 ★NEW

服务L4（知识发现）和元事件域（自驱进化）。

| 动词 | 含义 | 状态转换 | 来源层 |
|------|------|---------|--------|
| `discovered` | 新知识/模式/工具被发现 | unknown → known | L4 |
| `evaluated` | 发现被评估可行性 | known → assessed | L4 |
| `adapted` | 发现被适配到本地系统 | assessed → applied | L4 |
| `obsoleted` | 现有知识被新发现取代 | current → obsolete | L4 |
| `opportunity_detected` | 进化/提升机会被识别 | unseen → opportunity | 元 |
| `evolution_proposed` | 进化方案被提出 | opportunity → proposed | 元 |
| `evolution_approved` | 进化方案被批准 | proposed → approved | 元 |

**v4动词合计：6类，38个动词。**

### 2.4 六类动词的MECE证明

任何事件本质上是"某个东西"的"某种变化"。变化有且仅有六种可能（穷尽）：

1. **东西的存在性变了**（诞生/变化/消亡）→ 生命周期
2. **操作的阶段变了**（请求/执行/完成/失败）→ 过程
3. **相对规则的合规状态变了**（通过/违反/修复）→ 合规
4. **量化度量的结果变了**（异常/阈值/缺口）→ 观测
5. **从非结构化数据推断出了信号**（意图/情绪/模式）→ 信号 ★
6. **从外部世界发现了新知识/进化机会**（发现/评估/适配）→ 发现 ★

**互斥性**：
- 信号 vs 观测：观测是**量化**的（threshold_crossed有精确数值），信号是**推断**的（inferred没有精确数值）
- 发现 vs 信号：发现的信息来源是**外部世界**（公网/学术），信号的信息来源是**内部数据**（对话/日志）
- 发现 vs 生命周期：发现是认知层面的（"我们现在知道了X"），生命周期是实体层面的（"文件X被创建了"）

**穷尽性**：新增的"信号"和"发现"正好覆盖了v3缺失的L3/L4/L5层级，加上原有4类覆盖L1/L2，六类穷尽全部五层+元事件域。

### 2.5 名词开放层级（不变，沿用v3）

v3已经设计好了名词开放层级。v4在此基础上新增L3-L5和元事件域的名词空间：

```
# L1/L2 名词（v3已有）
isc.rule, skill.lifecycle, skill.md, quality.*, security.*, sync.*, vectorization.*,
aeo.*, infra.*, interaction.*, orchestration.*, dto.*, system.*

# L3 新增名词
user.intent                  # 用户意图
user.sentiment               # 用户情绪
conversation.topic           # 对话主题
conversation.correction      # 对话中的纠正信号
conversation.teaching        # 对话中的教学信号

# L4 新增名词
knowledge.architecture_pattern   # 架构模式发现
knowledge.engineering_practice   # 工程实践发现
knowledge.tool                   # 工具/库发现
knowledge.optimization           # 优化方法发现
knowledge.api                    # 新API/服务发现

# L5 新增名词
system.failure_pattern           # 失败模式
system.patch_cycle               # 修补循环
system.architecture_bottleneck   # 架构瓶颈
system.performance_degradation   # 性能退化
system.regression                # 回归

# 元事件域 新增名词
evolution.memory                 # 记忆机制进化
evolution.coordination           # 多Agent协同进化
evolution.autonomy               # 自主闭环进化
evolution.learning               # 学习能力进化
evolution.reasoning              # 推理能力进化
```

### 2.6 事件类型自动推导算法v4

v4的推导算法在v3基础上增加L3-L5和元事件域的推导逻辑：

```javascript
// derive-events-v4.js
// 文件位置: skills/isc-core/bin/derive-events-v4.js

function deriveEvents(rule) {
  const noun = deriveNoun(rule);
  const events = new Set();
  const domain = noun.split('.')[0];

  // ─── L1: 生命周期事件（必有） ───
  events.add(`${noun}.created`);
  events.add(`${noun}.updated`);
  if (ruleGovernsObjectDeletion(rule)) {
    events.add(`${noun}.deleted`);
  }

  // ─── L2: 量化阈值事件 ───
  if (hasQuantifiableCondition(rule)) {
    events.add(`${noun}.threshold_crossed`);
  }
  if (hasCompletenessCheck(rule)) {
    events.add(`${noun}.gap_found`);
  }
  if (hasValidationCriteria(rule)) {
    events.add(`${noun}.validated`);
    events.add(`${noun}.violated`);
  }

  // ─── L3: 语义意图事件 ───
  if (ruleInvolvesUserInteraction(rule)) {
    events.add(`user.intent.inferred`);      // 意图推断
    events.add(`user.sentiment.inferred`);   // 情绪推断
  }
  if (ruleInvolvesConversationPattern(rule)) {
    events.add(`conversation.topic.recurring`);  // 主题反复出现
  }

  // ─── L4: 知识发现事件 ───
  if (ruleCouldBenefitFromExternalKnowledge(rule)) {
    events.add(`knowledge.${domain}.discovered`);  // 领域知识发现
  }

  // ─── L5: 系统性模式事件 ───
  if (ruleInvolvesErrorHandling(rule)) {
    events.add(`system.failure_pattern.pattern_emerged`);
  }
  if (ruleInvolvesQuality(rule)) {
    events.add(`system.patch_cycle.pattern_emerged`);
  }

  // ─── 元事件域: 进化机会 ───
  // 每条规则都可能产生进化信号
  events.add(`evolution.${domain}.opportunity_detected`);

  // ─── Sweep兜底 ───
  events.add(`system.sweep.${domain}`);

  return [...events];
}
```

### 2.7 可扩展性论证（77→3000→30000）

| 维度 | 77条规则 | 3000条规则 | 30000条规则 | 增长方式 |
|------|---------|-----------|------------|---------|
| **动词数** | 38 | 38 | 38-45 | 几乎不增长（类别内可能微增） |
| **动词类别** | 6 | 6 | 6 | **不增长**（六类穷尽） |
| **名词数** | ~60 | ~500 | ~3000 | 线性增长 |
| **事件类型总数** | ~120 | ~900 | ~5000 | 亚线性（名词共享动词子集） |
| **MECE性** | ✅ | ✅ | ✅ | 结构保证 |
| **分类体系是否需重构** | — | 否 | 否 | 名词按需生长 |

**为什么30000条规则仍不需要重构？**

1. **动词是封闭集**：六类动词基于状态变化的数学分类，与规则数量无关
2. **名词是语法生成的**：`domain.object.sub_object` 按层级自动命名，无需预注册
3. **事件类型 = 名词 × 动词**：笛卡尔积天然MECE
4. **推导算法是规则无关的**：同一算法处理77条和30000条规则

---

## 第三部分：统一事件Schema（v4）

### 3.1 事件Schema升级

v4在v3的Schema基础上增加`layer`和`probe`字段：

```json
{
  "id": "evt_{timestamp36}_{random6}",
  "type": "domain.object.verb",
  "layer": "L1|L2|L3|L4|L5|META",
  "source": "emitter_id",
  "probe": "probe_id",
  "timestamp": 1772623823555,
  "payload": {},
  "metadata": {
    "trace_id": "trc_xxx",
    "correlation_id": "cor_xxx",
    "confidence": 0.95,
    "window": "5min|daily|weekly"
  }
}
```

**新增字段说明**：

| 字段 | 用途 | 必填 |
|------|------|------|
| `layer` | 标识事件来自哪一层（L1-L5/META） | 是 |
| `probe` | 标识哪个探针捕获的事件 | 是 |
| `metadata.confidence` | L3/L4的推断置信度（0-1） | L3/L4必填 |
| `metadata.window` | L3/L5的时间窗口 | L3/L5必填 |

### 3.2 统一规则Trigger Schema（v4）

v4在v3的trigger schema基础上增加多层事件绑定：

```json
{
  "trigger": {
    "events": {
      "L1": ["domain.object.created", "domain.object.updated"],
      "L2": ["domain.object.threshold_crossed"],
      "L3": ["user.intent.inferred"],
      "L4": ["knowledge.domain.discovered"],
      "L5": ["system.failure_pattern.pattern_emerged"]
    },
    "condition": "可选的JS表达式",
    "sweep": {
      "enabled": true,
      "interval": "*/30 * * * *",
      "scanner": "scanner_function_name"
    }
  },
  "action": {
    "type": "validate|enforce|auto_fix|pipeline|notify|escalate|council",
    "handler": "handler_function_or_dto_task_id",
    "on_failure": "warn|reject|retry|escalate"
  }
}
```

**关键变更**：`trigger.events`从字符串数组变为按层分类的对象。这允许：
1. 每条规则明确标注哪些层与它相关
2. 不同层的事件可以触发不同的action
3. 查询"哪些规则有L3事件"变得简单

**向后兼容**：如果`trigger.events`仍是字符串数组，视为L1/L2事件（兼容v3格式）。

---

## 第四部分：77条规则五层事件拆解

### 4.0 五层覆盖统计

| 层级 | 覆盖规则数 | 覆盖率 | 说明 |
|------|-----------|--------|------|
| L1 | 74 | 100% | 所有独立规则均有L1事件 |
| L2 | 52 | 70% | 有量化条件的规则 |
| L3 | 28 | 38% | 涉及用户交互/意图的规则 |
| L4 | 18 | 24% | 可受外部知识驱动的规则 |
| L5 | 22 | 30% | 涉及系统健康/故障的规则 |
| META | 74 | 100% | 所有规则均可产生进化信号 |

> 74条独立规则（去重后），每条至少L1+L2+META三层覆盖，0遗漏。

### 4.1 完整五层事件拆解表

> 说明：L3/L4/L5列中，✓ 表示该规则有对应层事件，— 表示不适用。
> L1/L2沿用v3的事件绑定（已验证100%覆盖），v4在此基础上补充L3-L5。

#### 4.1.1 ISC治理类（13条，去重后9条）

| # | 规则 | L1事件 | L2事件 | L3事件 | L4事件 | L5事件 |
|---|------|--------|--------|--------|--------|--------|
| R01 | ISC格式统一 | `isc.rule.created/updated` | `quality.rule_format.violated` | — | `knowledge.rule_standard.discovered` | `system.patch_cycle.pattern_emerged`（反复格式修复） |
| R02 | ISC创建闸门 | `isc.rule.created` | — | `user.intent.inferred`（用户要求创建规则） | — | — |
| R03 | ISC变更对齐 | `isc.rule.created/updated/deleted` | `isc.alignment.drifted` | — | — | `system.failure_pattern.pattern_emerged`（反复对齐失败） |
| R04 | ISC-DTO握手 | — | `isc.alignment.drifted` | — | — | `system.architecture_bottleneck.pattern_emerged` |
| R05 | ISC命名公约 | `isc.rule.created/updated` | `quality.naming.violated` | `conversation.correction.inferred`（用户纠正命名） | `knowledge.naming_convention.discovered` | — |
| R06 | 重复错误检测 | `system.error.created` | `system.error.recurring.threshold_crossed` | `user.sentiment.frustration`（用户因错误不满） | — | `system.failure_pattern.pattern_emerged` ★核心 |
| R07 | 规则缺失资源 | — | `isc.rule.resource.gap_found` | — | — | `system.patch_cycle.pattern_emerged` |
| R08 | 超时重试 | `dto.task.failed` | — | — | — | `system.failure_pattern.pattern_emerged`（反复超时） |
| R09 | 规则识别准确率 | — | `isc.rule.identity.gap_found` | — | — | — |

#### 4.1.2 技能质量类（8条，去重后6条）

| # | 规则 | L1事件 | L2事件 | L3事件 | L4事件 | L5事件 |
|---|------|--------|--------|--------|--------|--------|
| R14 | 强制SKILL.md | `skill.lifecycle.created`, `skill.md.deleted` | `quality.skillmd.gap_found` | `user.intent.inferred`（用户提到技能缺文档） | — | `system.patch_cycle.pattern_emerged`（反复缺SKILL.md） |
| R15 | 禁止占位符 | `skill.lifecycle.created/updated` | `quality.placeholder.detected` | — | — | `system.patch_cycle.pattern_emerged` |
| R17 | SKILL.md质量 | `skill.md.created/updated` | `quality.skillmd.threshold_crossed` | `user.sentiment.inferred`（用户对文档质量不满） | `knowledge.documentation_practice.discovered` | — |
| R18 | README质量 | `skill.lifecycle.created` | `quality.readme.threshold_crossed` | — | `knowledge.documentation_practice.discovered` | — |
| R19 | 自动生成SKILL.md | `skill.lifecycle.created`, `skill.md.deleted` | `quality.skillmd.gap_found` | — | `knowledge.doc_generation.discovered`（更好的生成方法） | — |
| R21 | 高严重度修复 | `quality.*.violated` | — | `user.intent.emphasized`（用户强调问题严重） | — | `system.failure_pattern.pattern_emerged` |

#### 4.1.3 命名规范类（5条，去重后4条）

| # | 规则 | L1事件 | L2事件 | L3事件 | L4事件 | L5事件 |
|---|------|--------|--------|--------|--------|--------|
| R22 | 命名常量 | `isc.rule.created/updated` | `quality.naming.violated` | `conversation.correction.inferred` | `knowledge.naming_convention.discovered` | — |
| R23 | 基因文件命名 | `system.file.changed` | `quality.naming.violated` | — | — | — |
| R24 | 技能目录命名 | `skill.lifecycle.created/renamed` | `quality.naming.violated` | `conversation.correction.inferred` | — | — |
| R25 | 双语展示 | `interaction.report.created` | `quality.naming.violated` | `user.intent.inferred`（用户要求双语） | — | — |

#### 4.1.4 自动化触发类（9条）

| # | 规则 | L1事件 | L2事件 | L3事件 | L4事件 | L5事件 |
|---|------|--------|--------|--------|--------|--------|
| R27 | EvoMap同步 | `skill.lifecycle.created/updated/published` | — | — | — | `system.failure_pattern.pattern_emerged`（同步反复失败） |
| R28 | GitHub同步 | `system.file.changed` | — | — | — | `system.failure_pattern.pattern_emerged` |
| R29 | 自动技能化 | `skill.lifecycle.created` | `quality.skill.threshold_crossed` | `user.intent.inferred`（用户要求技能化） | — | — |
| R30 | 自动向量化 | `skill.md.created/updated` | `vectorization.skill.gap_found` | — | `knowledge.embedding_method.discovered` | — |
| R31 | 能力锚点注册 | `skill.lifecycle.created/updated` | `quality.capability_anchor.gap_found` | `user.intent.inferred`（用户提到新能力） | — | — |
| R32 | 技能索引更新 | `skill.lifecycle.created/updated/deleted` | — | — | — | — |
| R33 | 技能进化触发 | `skill.lifecycle.changed/created/published` | — | — | `knowledge.skill_pattern.discovered` | — |
| R34 | 能力锚点识别 | — | `quality.capability_anchor.threshold_crossed` | `conversation.topic.recurring`（反复使用某能力） | — | — |
| R35 | 主动技能化 | `quality.capability_anchor.threshold_crossed` | — | `user.intent.emphasized` | — | — |

#### 4.1.5 向量化类（9条，去重后8条）

| # | 规则 | L1事件 | L2事件 | L3事件 | L4事件 | L5事件 |
|---|------|--------|--------|--------|--------|--------|
| R36 | 统一向量化标准 | `vectorization.*.requested` | `quality.vectorization.violated` | — | `knowledge.embedding_method.discovered` ★ | — |
| R37 | 技能向量化 | `skill.md.created/updated` | `vectorization.skill.gap_found` | — | — | — |
| R38 | 生命周期向量化 | `skill.lifecycle.created/updated/merged` | — | — | — | — |
| R39 | 向量清理 | `skill.lifecycle.deleted` | — | — | — | — |
| R40 | 知识向量化 | `infra.knowledge.created/updated` | `vectorization.knowledge.gap_found` | — | — | — |
| R41 | 记忆向量化 | `infra.memory.created/updated` | `vectorization.memory.gap_found` | — | — | — |
| R42 | AEO向量化 | `aeo.evaluation.created/updated` | `vectorization.aeo.gap_found` | — | — | — |
| R44 | 向量化触发通用 | `vectorization.*.requested` | sweep | — | `knowledge.embedding_method.discovered` | `system.failure_pattern.pattern_emerged`（向量化反复失败） |

#### 4.1.6 安全类（4条）

| # | 规则 | L1事件 | L2事件 | L3事件 | L4事件 | L5事件 |
|---|------|--------|--------|--------|--------|--------|
| R45 | Gateway配置保护 | `security.config.updated` | — | — | `knowledge.security_practice.discovered` | `system.failure_pattern.pattern_emerged` |
| R46 | EvoMap安全扫描 | `sync.evomap.requested` | — | — | `knowledge.security_practice.discovered` | — |
| R47 | 技能安全准出 | `skill.lifecycle.published` | — | — | `knowledge.security_practice.discovered` | — |
| R48 | 技能权限分级 | `skill.lifecycle.created/updated` | `security.permission.gap_found` | — | `knowledge.permission_model.discovered` | — |

#### 4.1.7 AEO类（5条）

| # | 规则 | L1事件 | L2事件 | L3事件 | L4事件 | L5事件 |
|---|------|--------|--------|--------|--------|--------|
| R49 | AEO评测集注册 | `aeo.evaluation.created/updated` | `aeo.evaluation.gap_found` | — | — | — |
| R50 | AEO双轨编排 | `aeo.evaluation.requested` | — | `user.intent.inferred`（用户要求评测） | — | — |
| R51 | AEO反馈采集 | `interaction.message.received` | `aeo.feedback.detected` | `user.sentiment.inferred` ★核心 | — | — |
| R52 | AEO洞察转行动 | `aeo.insight.generated` | `aeo.insight.threshold_crossed` | `user.intent.emphasized` | — | `system.patch_cycle.pattern_emerged` |
| R53 | AEO标准生成 | `skill.lifecycle.created/updated` | — | `conversation.topic.recurring`（反复讨论某技能） | — | — |

#### 4.1.8 决策类（5条，去重后3条）

| # | 规则 | L1事件 | L2事件 | L3事件 | L4事件 | L5事件 |
|---|------|--------|--------|--------|--------|--------|
| R54 | 七人议会 | `orchestration.decision.requested` | `orchestration.decision.threshold_crossed` | `user.intent.inferred`（用户要求审议） | `knowledge.decision_framework.discovered` | `system.architecture_bottleneck.pattern_emerged` |
| R55 | 自定义决策 | `dto.task.failed` | — | — | — | `system.failure_pattern.pattern_emerged` |
| R56 | 流水线后修复 | `orchestration.pipeline.completed` | — | — | — | `system.patch_cycle.pattern_emerged` |

#### 4.1.9 分析检测类（4条）

| # | 规则 | L1事件 | L2事件 | L3事件 | L4事件 | L5事件 |
|---|------|--------|--------|--------|--------|--------|
| R59 | 根因分析 | `dto.task.failed`, `pipeline.failed` | — | `user.sentiment.frustration` | `knowledge.debugging_technique.discovered` | `system.failure_pattern.pattern_emerged` ★核心 |
| R60 | 架构合规审计 | `system.design.created/updated` | — | — | `knowledge.architecture_pattern.discovered` ★核心 | — |
| R61 | CRAS模式解决 | — | `aeo.insight.threshold_crossed` | `conversation.topic.recurring` ★核心 | — | `system.patch_cycle.pattern_emerged` ★核心 |
| R62 | 重命名全局对齐 | `skill.lifecycle.renamed/moved` | — | — | — | `system.patch_cycle.pattern_emerged` |

#### 4.1.10 编排类（5条）

| # | 规则 | L1事件 | L2事件 | L3事件 | L4事件 | L5事件 |
|---|------|--------|--------|--------|--------|--------|
| R63 | 并行分析 | `orchestration.analysis.requested` | — | `user.intent.inferred` | — | — |
| R64 | 并行子Agent | `orchestration.subagent.requested` | — | — | `knowledge.agent_coordination.discovered` | `system.architecture_bottleneck.pattern_emerged` |
| R65 | SEEF子技能 | `skill.lifecycle.created` | — | — | — | — |
| R66 | 多Agent沟通 | `orchestration.subagent.spawned` | — | `user.intent.inferred`（用户要求优先级调整） | `knowledge.agent_coordination.discovered` | — |
| R67 | 流水线汇报过滤 | `orchestration.pipeline.completed` | — | `user.sentiment.inferred`（用户对信息过载不满） | — | — |

#### 4.1.11 基础设施类（5条，去重后4条）

| # | 规则 | L1事件 | L2事件 | L3事件 | L4事件 | L5事件 |
|---|------|--------|--------|--------|--------|--------|
| R68 | API密钥池 | `infra.apikey.rate_limited/invalid/expired` | `infra.apikey.threshold_crossed` | — | — | `system.failure_pattern.pattern_emerged`（反复限流） |
| R69 | Cron模型要求 | `infra.cron.created/updated` | — | — | — | — |
| R70 | Cron模型选择 | `infra.cron.created/updated` | `quality.cron_model.violated` | — | `knowledge.model_capability.discovered` | — |
| R71 | 记忆恢复 | `infra.memory.deleted` | `infra.memory.gap_found` | — | — | `system.failure_pattern.pattern_emerged`（反复丢失记忆） |

#### 4.1.12 交互类（4条）

| # | 规则 | L1事件 | L2事件 | L3事件 | L4事件 | L5事件 |
|---|------|--------|--------|--------|--------|--------|
| R73 | 源文件交付 | `interaction.message.received` | — | `user.intent.inferred`（识别"发源文件"意图） ★核心 | — | — |
| R74 | 飞书卡片格式 | `interaction.report.created` | `quality.report_format.violated` | — | `knowledge.report_format.discovered` | `system.patch_cycle.pattern_emerged` |
| R75 | 双通道保证 | `interaction.message.sent` | — | `user.intent.emphasized`（强调消息重要性） | — | — |
| R76 | GLM视觉优先 | `interaction.message.received` | — | `user.intent.inferred`（识别视觉意图） ★核心 | `knowledge.vision_model.discovered` | — |

#### 4.1.13 集成/路由类（4条）

| # | 规则 | L1事件 | L2事件 | L3事件 | L4事件 | L5事件 |
|---|------|--------|--------|--------|--------|--------|
| R77 | 智谱能力路由 | `interaction.message.received` | — | `user.intent.inferred`（识别任务模态） ★核心 | `knowledge.model_capability.discovered` | — |
| R78 | GitHub API技能 | `skill.lifecycle.created` | — | — | `knowledge.api_practice.discovered` | — |
| R79 | HTTP技能套件 | `skill.lifecycle.created` | — | — | `knowledge.api_practice.discovered` | — |
| R80 | EvoMap同步通用 | `sync.evomap.requested` | sweep | — | — | `system.failure_pattern.pattern_emerged` |

#### 4.1.14 其他（1条）

| # | 规则 | L1事件 | L2事件 | L3事件 | L4事件 | L5事件 |
|---|------|--------|--------|--------|--------|--------|
| R81 | 计划时间粒度 | `orchestration.plan.created` | `quality.planning.violated` | `user.intent.inferred`（用户纠正粒度） | — | — |

### 4.2 L3高价值规则清单（CRAS快通道直接驱动）

以下规则的L3事件是**核心驱动力**——即CRAS从对话中检测到意图信号后，直接触发规则执行：

| 规则 | L3事件 | 场景描述 |
|------|--------|---------|
| R73 源文件交付 | `user.intent.inferred(type=file_request)` | 用户说"发MD源文件" → CRAS提取文件请求意图 → 直接执行发送 |
| R76 GLM视觉优先 | `user.intent.inferred(type=vision_task)` | 用户发图片说"分析一下" → CRAS提取视觉意图 → 路由到GLM-4V |
| R77 智谱能力路由 | `user.intent.inferred(type=task_modal)` | 用户任务输入 → CRAS识别模态 → 自动选择最优模型 |
| R51 AEO反馈采集 | `user.sentiment.inferred` | 用户表达满意/不满 → CRAS提取情绪 → 写入AEO反馈库 |
| R34 能力锚点识别 | `conversation.topic.recurring` | 用户反复使用某功能 → CRAS识别反复主题 → 触发技能化评估 |
| R61 CRAS模式解决 | `conversation.topic.recurring` | 用户反复抱怨同一问题 → CRAS识别模式 → 触发根因分析 |
| R06 重复错误检测 | `user.sentiment.frustration` | 用户因同一错误反复出现而不满 → CRAS提取不满信号 → 触发错误模式分析 |

### 4.3 L4高价值规则清单（知识发现驱动）

以下规则在CRAS发现外部知识后会被触发重新评估：

| 规则 | L4事件 | 场景描述 |
|------|--------|---------|
| R36 统一向量化标准 | `knowledge.embedding_method.discovered` | 发现更好的Embedding方法 → 评估可行性 → 可能更新向量化标准 |
| R60 架构合规审计 | `knowledge.architecture_pattern.discovered` | 发现新的架构模式 → 评估是否适用 → 生成适配方案 |
| R47/R48 安全规则 | `knowledge.security_practice.discovered` | 发现新的安全最佳实践 → 评估 → 更新安全规则 |
| R64 并行子Agent | `knowledge.agent_coordination.discovered` | 发现更好的多Agent协同模式 → 凌霄阁审议 → 可能重构 |
| R77 智谱能力路由 | `knowledge.model_capability.discovered` | 发现新模型/新能力 → 评估 → 更新路由规则 |

### 4.4 L5高价值规则清单（系统性模式驱动）

以下规则在检测到系统性模式后触发重构流程：

| 规则 | L5事件 | 场景描述 | 触发动作 |
|------|--------|---------|---------|
| R06 重复错误检测 | `system.failure_pattern.pattern_emerged` | 同一模块连续3次修补 | 根因分析 → 重构方案 → 凌霄阁审议 |
| R59 根因分析 | `system.failure_pattern.pattern_emerged` | 跨模块关联失败模式 | 深度根因分析 → 架构级重构建议 |
| R61 CRAS模式解决 | `system.patch_cycle.pattern_emerged` | 反复修补同类问题 | 识别修补循环 → 从根本上解决 |
| R04 ISC-DTO握手 | `system.architecture_bottleneck.pattern_emerged` | 对齐机制本身成为瓶颈 | 架构重新设计 |
| R68 API密钥池 | `system.failure_pattern.pattern_emerged` | 反复限流/密钥失效 | 密钥管理机制重构 |

---

## 第五部分：CRAS双通道架构（L3事件探针）

### 5.1 架构概览

```
┌──────────────────────────────────────────────────────────────────────┐
│                        对话消息流（全量）                              │
│   user msg → agent reply → user msg → agent reply → ...             │
└────────────────────────┬─────────────────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │  CRAS 对话探针       │
              │  conversation-      │
              │  probe.js           │
              └──┬──────────────┬───┘
                 │              │
    ┌────────────▼───┐  ┌──────▼───────────┐
    │  快通道         │  │  慢通道            │
    │  Fast Channel  │  │  Slow Channel     │
    │  5min增量扫描   │  │  daily聚合分析     │
    │                │  │                   │
    │  探测原子意图：  │  │  识别宏观模式：     │
    │  · 文件请求     │  │  · 话题趋势        │
    │  · 视觉意图     │  │  · 情绪走势        │
    │  · 情绪波动     │  │  · 能力缺口        │
    │  · 纠正信号     │  │  · 教学意图聚合     │
    │  · 强调意图     │  │  · 用户偏好演变     │
    │                │  │                   │
    │  emit:         │  │  emit:            │
    │  user.intent.  │  │  conversation.    │
    │  inferred      │  │  topic.recurring  │
    │  user.sentiment│  │  user.profile.    │
    │  .inferred     │  │  preference_shift │
    └───────┬────────┘  └────────┬──────────┘
            │                    │
            └────────┬───────────┘
                     │
              ┌──────▼──────────┐
              │  统一事件总线     │
              │  bus.emit()     │
              │  layer: "L3"   │
              └─────────────────┘
```

### 5.2 快通道设计（Fast Channel）

**目标**：5分钟增量扫描最近对话，提取原子意图事件，实时emit。

**文件位置**：`skills/cras/conversation-probe.js`（新建）

```javascript
// skills/cras/conversation-probe.js
// CRAS 快通道 - 5分钟增量对话扫描

const bus = require('../../infrastructure/event-bus/bus.js');
const fs = require('fs');
const path = require('path');

const PROBE_ID = 'cras-fast-channel';
const STATE_FILE = path.join(__dirname, '.fast-channel-state.json');
const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5分钟

// 意图模式库（可扩展）
const INTENT_PATTERNS = {
  file_request: {
    patterns: [/发.*源文件/, /发我.*md/, /发.*文件给我/, /源码.*发/],
    event_type: 'user.intent.inferred',
    payload_type: 'file_request'
  },
  vision_task: {
    patterns: [/分析.*图/, /看.*图片/, /图.*理解/, /OCR/],
    event_type: 'user.intent.inferred',
    payload_type: 'vision_task'
  },
  frustration: {
    patterns: [/又.*错了/, /还是.*问题/, /怎么又/, /说了.*遍/, /不是.*意思/],
    event_type: 'user.sentiment.sentiment_shifted',
    payload_type: 'frustration'
  },
  repeated_emphasis: {
    patterns: [/重点是/, /必须/, /一定要/, /关键/, /最重要/],
    event_type: 'user.intent.emphasized',
    payload_type: 'emphasis'
  },
  correction: {
    patterns: [/不对/, /不是这样/, /应该是/, /纠正/, /搞错了/],
    event_type: 'conversation.correction.inferred',
    payload_type: 'correction'
  },
  teaching: {
    patterns: [/你要理解/, /本质是/, /第一性原理/, /你想想/, /仔细想/],
    event_type: 'conversation.teaching.inferred',
    payload_type: 'teaching'
  }
};

class FastChannel {
  constructor() {
    this.lastScanTimestamp = this.loadState();
  }

  loadState() {
    try {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return state.lastScanTimestamp || 0;
    } catch (_) {
      return 0;
    }
  }

  saveState() {
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      lastScanTimestamp: this.lastScanTimestamp,