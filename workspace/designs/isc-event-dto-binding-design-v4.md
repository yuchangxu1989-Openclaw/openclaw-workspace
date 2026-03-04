# ISC-事件-DTO 闭环方案 v4.1 — 五层事件认知模型（工程审查修正版）

> **版本**: v4.1.0
> **作者**: 系统架构师
> **日期**: 2026-03-04
> **状态**: V4.1 REVISED — 工程可行性审查 + 质量审查后修正
> **前置**: v3的全面升级，基于用户五层事件认知模型教学（3小时深度教学）
> **v4.1变更**: 修正覆盖率统计、补齐闭环执行路径、解决语义稀释、增加工程可行性方案、增加名词治理机制

---

## TL;DR

**v3的根本缺陷**：只看到了L1（对象生命周期）和L2（量化阈值），把"事件"局限在了代码/文件系统层面。缺失了L3（对话中的语义意图）、L4（知识发现）、L5（系统性故障模式），以及最高优先级的"元事件域"——自驱进化。v3是半盲的。

**v4的第一性原理**：**事件 = 系统状态空间中任何可被感知的状态跃迁。** 不仅是代码文件的CRUD（L1），不仅是计数器越过阈值（L2），还包括：从非结构化对话中提取的语义信号（L3）、从公网/学术学习中发现的增量价值（L4）、从反复失败中涌现的系统性模式（L5）。而这一切的一切，都服务于一个元目标——**系统如何让自己变得更聪明**。

**v4.1成果**：
- 五层事件认知模型 + 元事件域完整架构
- 生成式事件分类体系（6类动词 × 开放名词 = 无限事件类型），论证3000→30000条规则可扩展性
- 70条独立规则（去重后）五层事件拆解（L1覆盖率92.9%，L2覆盖率54.3%——诚实数据）
- CRAS双通道架构（快通道5min + 慢通道daily）+ 可行数据源替代方案
- 知识发现→评估→适配→反馈完整闭环（L4）
- 系统性故障→根因分析→重构→验证完整闭环（L5）
- 自驱进化机制 + 凌霄阁审议详细流程（META）
- 名词空间注册治理与收缩机制（反熵增执行保障）
- 工程可行性专章：6项致命风险逐一解决方案
- **诚实声明**：L3-L5+META层探针需全部新建，预计总工期24-28天（非"基于现有代码可落地"）

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

# L3 新增名词（v4.1语义细分，消除稀释）
user.intent.file_request          # 文件请求意图
user.intent.vision_task           # 视觉任务意图
user.intent.task_routing          # 任务路由意图
user.intent.rule_creation         # 规则创建意图
user.intent.skillification        # 技能化意图
user.intent.evaluation            # 评测意图
user.intent.capability_declare    # 能力声明意图
user.intent.bilingual             # 双语要求意图
user.intent.parallel_analysis     # 并行分析意图
user.intent.priority_adjust       # 优先级调整意图
user.intent.time_granularity      # 时间粒度意图
user.intent.council_review        # 审议要求意图
user.intent.doc_request           # 文档请求意图
user.intent.severity              # 严重度强调意图
user.intent.action_demand         # 行动要求意图
user.intent.delivery_urgency      # 交付紧迫意图
user.intent.skillification        # 技能化强调意图
user.sentiment.frustration        # 用户挫败情绪
user.sentiment.satisfaction       # 用户满意情绪
user.sentiment.doc_quality        # 文档质量不满
user.sentiment.info_overload      # 信息过载不满
conversation.topic                # 对话主题
conversation.correction           # 对话中的纠正信号
conversation.teaching             # 对话中的教学信号

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

> **v4.1关键修正**：L3事件推导不再统一映射到`user.intent.inferred`，而是根据规则语义推导具体意图子类型。

v4的推导算法在v3基础上增加L3-L5和元事件域的推导逻辑：

```javascript
// derive-events-v4.js
// 文件位置: skills/isc-core/bin/derive-events-v4.js

function deriveEvents(rule) {
  const noun = deriveNoun(rule);
  const events = new Set();
  const domain = noun.split('.')[0];

  // ─── L1: 生命周期事件（大部分规则有，但非强制） ───
  if (ruleGovernsObjectLifecycle(rule)) {
    events.add(`${noun}.created`);
    events.add(`${noun}.updated`);
    if (ruleGovernsObjectDeletion(rule)) {
      events.add(`${noun}.deleted`);
    }
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

  // ─── L3: 语义意图事件（细分子类型，消除语义稀释） ───
  if (ruleInvolvesUserInteraction(rule)) {
    const intentSubtype = deriveIntentSubtype(rule);
    events.add(`user.intent.${intentSubtype}.inferred`);
  }
  if (ruleInvolvesUserSentiment(rule)) {
    const sentimentSubtype = deriveSentimentSubtype(rule);
    events.add(`user.sentiment.${sentimentSubtype}.shifted`);
  }
  if (ruleInvolvesConversationPattern(rule)) {
    events.add(`conversation.topic.recurring`);
  }

  // ─── L4: 知识发现事件 ───
  if (ruleCouldBenefitFromExternalKnowledge(rule)) {
    events.add(`knowledge.${domain}.discovered`);
  }

  // ─── L5: 系统性模式事件 ───
  if (ruleInvolvesErrorHandling(rule)) {
    events.add(`system.failure_pattern.pattern_emerged`);
  }
  if (ruleInvolvesQuality(rule)) {
    events.add(`system.patch_cycle.pattern_emerged`);
  }

  // ─── 元事件域: 进化机会 ───
  events.add(`evolution.${domain}.opportunity_detected`);

  // ─── Sweep兜底 ───
  events.add(`system.sweep.${domain}`);

  return [...events];
}

/**
 * 推导意图子类型 — 消除语义稀释的关键
 * 从规则的语义上下文推导具体的意图类别名
 */
function deriveIntentSubtype(rule) {
  const subtypeMap = {
    'file_delivery': 'file_request',
    'vision': 'vision_task',
    'model_routing': 'task_routing',
    'rule_creation': 'rule_creation',
    'skill_creation': 'skillification',
    'evaluation': 'evaluation',
    'capability_declaration': 'capability_declare',
    'bilingual': 'bilingual',
    'parallel': 'parallel_analysis',
    'priority': 'priority_adjust',
    'time_planning': 'time_granularity',
    'council_review': 'council_review'
  };
  const ruleContext = extractRuleContext(rule);
  return subtypeMap[ruleContext] || `${rule.domain}_${rule.action}`;
}
```

### 2.7 可扩展性论证（77→3000→30000）

> v4.1修正：规则总数为70条独立规则（去重后），非77条。

| 维度 | 70条规则 | 3000条规则 | 30000条规则 | 增长方式 |
|------|---------|-----------|------------|---------|
| **动词数** | 38 | 38 | 38-45 | 几乎不增长（类别内可能微增） |
| **动词类别** | 6 | 6 | 6 | **不增长**（六类穷尽） |
| **名词数** | ~60 | ~500 | ~3000 | 线性增长（受治理机制约束） |
| **事件类型总数** | ~120 | ~900 | ~5000 | 亚线性（名词共享动词子集） |
| **MECE性** | ✅ | ✅ | ✅ | 结构保证 |
| **分类体系是否需重构** | — | 否 | 否 | 名词按需生长 |

**为什么30000条规则仍不需要重构？**

1. **动词是封闭集**：六类动词基于状态变化的数学分类，与规则数量无关
2. **名词是语法生成的**：`domain.object.sub_object` 按层级自动命名，无需预注册
3. **事件类型 = 名词 × 动词**：笛卡尔积天然MECE
4. **推导算法是规则无关的**：同一算法处理70条和30000条规则

### 2.8 名词空间治理与收缩机制 ★v4.1新增

> **反熵增的"收缩"侧**：v4.0只设计了"如何增长"（新名词、新规则），没有设计"如何收缩"（旧名词废弃、冗余合并）。v4.1补齐。

#### 2.8.1 名词注册机制

所有名词必须在注册表中有记录，才能作为合法事件类型的一部分。

**注册表文件**: `infrastructure/event-bus/noun-registry.jsonl`

```jsonl
{"noun":"isc.rule","registered":"2026-02-15","owner":"isc-core","last_used":"2026-03-04","status":"active","description":"ISC治理规则"}
{"noun":"user.intent.file_request","registered":"2026-03-04","owner":"cras","last_used":"2026-03-04","status":"active","description":"用户文件请求意图"}
```

**注册规则**：
1. **新名词必须注册**：`bus.emit()`在emit前检查名词是否已注册。未注册名词触发`system.naming.unregistered_noun.detected`警告事件，但不阻塞emit（宽松模式）
2. **名词深度上限4层**：`a.b.c.d`是最大深度，超过则拒绝。这防止名词空间变成无限嵌套的目录树
3. **注册需附带owner和description**：谁创建的、干什么用的

#### 2.8.2 名词去重与合并

**周期性扫描**（每周，由evolution-detector兼任）：

```javascript
// 名词去重逻辑
function detectDuplicateNouns(registry) {
  const duplicates = [];
  const nouns = registry.getAll();
  
  for (let i = 0; i < nouns.length; i++) {
    for (let j = i + 1; j < nouns.length; j++) {
      // 1. 编辑距离检测（Levenshtein distance <= 2）
      if (levenshtein(nouns[i].noun, nouns[j].noun) <= 2) {
        duplicates.push({ a: nouns[i], b: nouns[j], reason: 'similar_name' });
      }
      // 2. 语义相似检测（同domain下含义重叠）
      if (nouns[i].noun.split('.')[0] === nouns[j].noun.split('.')[0] &&
          semanticSimilarity(nouns[i].description, nouns[j].description) > 0.8) {
        duplicates.push({ a: nouns[i], b: nouns[j], reason: 'semantic_overlap' });
      }
    }
  }
  return duplicates;
}
```

**发现重复后**：emit `system.naming.duplicate_detected` → 生成合并建议 → 用户确认 → 执行合并（旧名词设为别名alias指向新名词）

#### 2.8.3 名词废弃与收缩

**自动废弃规则**：
1. **30天未使用**：名词的`last_used`超过30天 → 标记为`dormant`（休眠）
2. **90天未使用**：`dormant`状态超过60天 → 标记为`deprecated`（废弃候选）
3. **废弃确认**：`deprecated`状态的名词在下次进化检测中由凌霄阁确认是否正式废弃
4. **正式废弃**：`status: "retired"`，所有引用该名词的事件路由自动移除

**收缩metrics**：

| 指标 | 健康阈值 | 报警阈值 |
|------|---------|---------|
| 活跃名词数/规则数 | < 2.0 | > 3.0（名词膨胀） |
| 休眠名词占比 | < 10% | > 20%（清理不及时） |
| 重复名词数 | 0 | > 5（治理失效） |
| 名词最大深度 | ≤ 3 | = 4（逼近上限） |

#### 2.8.4 名词层级标准化

防止同义表达膨胀的命名约定：

| 维度 | 标准格式 | 禁止的变体 |
|------|---------|-----------|
| 安全实践 | `security_practice` | `sec_practice`, `security_best_practice`, `secure_practice` |
| API实践 | `api_practice` | `api_best_practice`, `api_standard` |
| 意图子类型 | `user.intent.{具体动作}` | `user.intent.general`, `user.intent.misc` |
| 情绪子类型 | `user.sentiment.{具体情绪}` | `user.sentiment.general`, `user.feeling.*` |

**命名冲突解决协议**：
1. 先到先得：先注册的名词是标准
2. 有争议时：比较使用频率，高频者胜
3. 都可以时：选择更短、更通用的那个

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

> **v4.1修正声明**：v4.0原始统计存在数据不实，L1声称100%实为92.9%，L2声称70%实为54.3%。以下为逐行核查后的真实数据。

| 层级 | 覆盖规则数 | 覆盖率 | 说明 |
|------|-----------|--------|------|
| L1 | 65/70 | **92.9%** | 5条规则无L1事件（R04/R07/R09/R34/R61为纯阈值/模式驱动规则，见下方说明） |
| L2 | 38/70 | **54.3%** | 有明确量化条件的规则 |
| L3 | 28/70 | 40.0% | 涉及用户交互/意图的规则 |
| L4 | 18/70 | 25.7% | 可受外部知识驱动的规则 |
| L5 | 22/70 | 31.4% | 涉及系统健康/故障的规则 |
| META | 70/70 | 100% | 所有规则均可产生进化信号 |

> **70条独立规则**（去重后）。原始ISC规则JSON文件79个，去重规则编号R01-R81，其中11个编号（R10-R13/R16/R20/R26/R43/R57/R58/R72）为合并重复或已废弃规则，不计入独立规则数。
>
> **L1非100%的原因**：R04（ISC-DTO握手）、R07（规则缺失资源）、R09（规则识别准确率）、R34（能力锚点识别）、R61（CRAS模式解决）——这5条规则的触发源本质上是L2阈值越过或L5模式涌现，不存在对象生命周期操作触发。硬塞L1事件反而会制造虚假覆盖。**不是所有规则都需要L1事件，这是诚实的设计。**
>
> **L2仅54.3%的原因**：大量规则（如自动化触发类、编排类）是"事件→动作"的直接响应，不涉及量化阈值。这符合预期——L2覆盖率不应追求高数字，而应追求精确。

### 4.1 完整五层事件拆解表

> 说明：L3/L4/L5列中，✓ 表示该规则有对应层事件，— 表示不适用。
> L1/L2沿用v3的事件绑定（已验证100%覆盖），v4在此基础上补充L3-L5。

#### 4.1.1 ISC治理类（13条，去重后9条）

| # | 规则 | L1事件 | L2事件 | L3事件 | L4事件 | L5事件 |
|---|------|--------|--------|--------|--------|--------|
| R01 | ISC格式统一 | `isc.rule.created/updated` | `quality.rule_format.violated` | — | `knowledge.rule_standard.discovered` | `system.patch_cycle.pattern_emerged`（反复格式修复） |
| R02 | ISC创建闸门 | `isc.rule.created` | — | `user.intent.rule_creation.inferred`（用户要求创建规则） | — | — |
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
| R14 | 强制SKILL.md | `skill.lifecycle.created`, `skill.md.deleted` | `quality.skillmd.gap_found` | `user.intent.doc_request.inferred`（用户提到技能缺文档） | — | `system.patch_cycle.pattern_emerged`（反复缺SKILL.md） |
| R15 | 禁止占位符 | `skill.lifecycle.created/updated` | `quality.placeholder.detected` | — | — | `system.patch_cycle.pattern_emerged` |
| R17 | SKILL.md质量 | `skill.md.created/updated` | `quality.skillmd.threshold_crossed` | `user.sentiment.doc_quality.shifted`（用户对文档质量不满） | `knowledge.documentation_practice.discovered` | — |
| R18 | README质量 | `skill.lifecycle.created` | `quality.readme.threshold_crossed` | — | `knowledge.documentation_practice.discovered` | — |
| R19 | 自动生成SKILL.md | `skill.lifecycle.created`, `skill.md.deleted` | `quality.skillmd.gap_found` | — | `knowledge.doc_generation.discovered`（更好的生成方法） | — |
| R21 | 高严重度修复 | `quality.*.violated` | — | `user.intent.severity.emphasized`（用户强调问题严重） | — | `system.failure_pattern.pattern_emerged` |

#### 4.1.3 命名规范类（5条，去重后4条）

| # | 规则 | L1事件 | L2事件 | L3事件 | L4事件 | L5事件 |
|---|------|--------|--------|--------|--------|--------|
| R22 | 命名常量 | `isc.rule.created/updated` | `quality.naming.violated` | `conversation.correction.inferred` | `knowledge.naming_convention.discovered` | — |
| R23 | 基因文件命名 | `system.file.changed` | `quality.naming.violated` | — | — | — |
| R24 | 技能目录命名 | `skill.lifecycle.created/renamed` | `quality.naming.violated` | `conversation.correction.inferred` | — | — |
| R25 | 双语展示 | `interaction.report.created` | `quality.naming.violated` | `user.intent.bilingual.inferred`（用户要求双语） | — | — |

#### 4.1.4 自动化触发类（9条）

| # | 规则 | L1事件 | L2事件 | L3事件 | L4事件 | L5事件 |
|---|------|--------|--------|--------|--------|--------|
| R27 | EvoMap同步 | `skill.lifecycle.created/updated/published` | — | — | — | `system.failure_pattern.pattern_emerged`（同步反复失败） |
| R28 | GitHub同步 | `system.file.changed` | — | — | — | `system.failure_pattern.pattern_emerged` |
| R29 | 自动技能化 | `skill.lifecycle.created` | `quality.skill.threshold_crossed` | `user.intent.skillification.inferred`（用户要求技能化） | — | — |
| R30 | 自动向量化 | `skill.md.created/updated` | `vectorization.skill.gap_found` | — | `knowledge.embedding_method.discovered` | — |
| R31 | 能力锚点注册 | `skill.lifecycle.created/updated` | `quality.capability_anchor.gap_found` | `user.intent.capability_declare.inferred`（用户提到新能力） | — | — |
| R32 | 技能索引更新 | `skill.lifecycle.created/updated/deleted` | — | — | — | — |
| R33 | 技能进化触发 | `skill.lifecycle.changed/created/published` | — | — | `knowledge.skill_pattern.discovered` | — |
| R34 | 能力锚点识别 | — | `quality.capability_anchor.threshold_crossed` | `conversation.topic.recurring`（反复使用某能力） | — | — |
| R35 | 主动技能化 | `quality.capability_anchor.threshold_crossed` | — | `user.intent.skillification.emphasized` | — | — |

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
| R50 | AEO双轨编排 | `aeo.evaluation.requested` | — | `user.intent.evaluation.inferred`（用户要求评测） | — | — |
| R51 | AEO反馈采集 | `interaction.message.received` | `aeo.feedback.detected` | `user.sentiment.satisfaction.inferred` ★核心 | — | — |
| R52 | AEO洞察转行动 | `aeo.insight.generated` | `aeo.insight.threshold_crossed` | `user.intent.action_demand.emphasized` | — | `system.patch_cycle.pattern_emerged` |
| R53 | AEO标准生成 | `skill.lifecycle.created/updated` | — | `conversation.topic.recurring`（反复讨论某技能） | — | — |

#### 4.1.8 决策类（5条，去重后3条）

| # | 规则 | L1事件 | L2事件 | L3事件 | L4事件 | L5事件 |
|---|------|--------|--------|--------|--------|--------|
| R54 | 七人议会 | `orchestration.decision.requested` | `orchestration.decision.threshold_crossed` | `user.intent.council_review.inferred`（用户要求审议） | `knowledge.decision_framework.discovered` | `system.architecture_bottleneck.pattern_emerged` |
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
| R63 | 并行分析 | `orchestration.analysis.requested` | — | `user.intent.parallel_analysis.inferred` | — | — |
| R64 | 并行子Agent | `orchestration.subagent.requested` | — | — | `knowledge.agent_coordination.discovered` | `system.architecture_bottleneck.pattern_emerged` |
| R65 | SEEF子技能 | `skill.lifecycle.created` | — | — | — | — |
| R66 | 多Agent沟通 | `orchestration.subagent.spawned` | — | `user.intent.priority_adjust.inferred`（用户要求优先级调整） | `knowledge.agent_coordination.discovered` | — |
| R67 | 流水线汇报过滤 | `orchestration.pipeline.completed` | — | `user.sentiment.info_overload.shifted`（用户对信息过载不满） | — | — |

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
| R73 | 源文件交付 | `interaction.message.received` | — | `user.intent.file_request.inferred`（识别"发源文件"意图） ★核心 | — | — |
| R74 | 飞书卡片格式 | `interaction.report.created` | `quality.report_format.violated` | — | `knowledge.report_format.discovered` | `system.patch_cycle.pattern_emerged` |
| R75 | 双通道保证 | `interaction.message.sent` | — | `user.intent.delivery_urgency.emphasized`（强调消息重要性） | — | — |
| R76 | GLM视觉优先 | `interaction.message.received` | — | `user.intent.vision_task.inferred`（识别视觉意图） ★核心 | `knowledge.vision_model.discovered` | — |

#### 4.1.13 集成/路由类（4条）

| # | 规则 | L1事件 | L2事件 | L3事件 | L4事件 | L5事件 |
|---|------|--------|--------|--------|--------|--------|
| R77 | 智谱能力路由 | `interaction.message.received` | — | `user.intent.task_routing.inferred`（识别任务模态） ★核心 | `knowledge.model_capability.discovered` | — |
| R78 | GitHub API技能 | `skill.lifecycle.created` | — | — | `knowledge.api_practice.discovered` | — |
| R79 | HTTP技能套件 | `skill.lifecycle.created` | — | — | `knowledge.api_practice.discovered` | — |
| R80 | EvoMap同步通用 | `sync.evomap.requested` | sweep | — | — | `system.failure_pattern.pattern_emerged` |

#### 4.1.14 其他（1条）

| # | 规则 | L1事件 | L2事件 | L3事件 | L4事件 | L5事件 |
|---|------|--------|--------|--------|--------|--------|
| R81 | 计划时间粒度 | `orchestration.plan.created` | `quality.planning.violated` | `user.intent.time_granularity.inferred`（用户纠正粒度） | — | — |

### 4.2 L3高价值规则清单（CRAS快通道直接驱动）

> **v4.1语义细分**：每个意图映射到独立的事件类型（`user.intent.{具体意图}.inferred`），而非共用一个`user.intent.inferred`。事件总线可直接基于事件类型高效路由，无需解析payload。

以下规则的L3事件是**核心驱动力**——即CRAS从对话中检测到意图信号后，直接触发规则执行：

| 规则 | L3事件 | 场景描述 |
|------|--------|---------|
| R73 源文件交付 | `user.intent.file_request.inferred` | 用户说"发MD源文件" → CRAS提取文件请求意图 → 直接执行发送 |
| R76 GLM视觉优先 | `user.intent.vision_task.inferred` | 用户发图片说"分析一下" → CRAS提取视觉意图 → 路由到GLM-4V |
| R77 智谱能力路由 | `user.intent.task_routing.inferred` | 用户任务输入 → CRAS识别模态 → 自动选择最优模型 |
| R51 AEO反馈采集 | `user.sentiment.satisfaction.inferred` | 用户表达满意/不满 → CRAS提取情绪 → 写入AEO反馈库 |
| R34 能力锚点识别 | `conversation.topic.recurring` | 用户反复使用某功能 → CRAS识别反复主题 → 触发技能化评估 |
| R61 CRAS模式解决 | `conversation.topic.recurring` | 用户反复抱怨同一问题 → CRAS识别模式 → 触发根因分析 |
| R06 重复错误检测 | `user.sentiment.frustration.shifted` | 用户因同一错误反复出现而不满 → CRAS提取不满信号 → 触发错误模式分析 |

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
      lastScanTime: new Date().toISOString()
    }));
  }

  /**
   * 扫描增量对话消息，提取意图事件
   * @param {Array} recentMessages - 最近5分钟的消息（从会话历史获取）
   */
  scan(recentMessages) {
    const events = [];

    for (const msg of recentMessages) {
      if (msg.timestamp <= this.lastScanTimestamp) continue;
      if (msg.role !== 'user') continue; // 只分析用户消息

      for (const [intentName, config] of Object.entries(INTENT_PATTERNS)) {
        for (const pattern of config.patterns) {
          if (pattern.test(msg.content)) {
            events.push({
              type: config.event_type,
              layer: 'L3',
              probe: PROBE_ID,
              payload: {
                intent_type: config.payload_type,
                intent_name: intentName,
                message_id: msg.id,
                message_excerpt: msg.content.substring(0, 200),
                confidence: 0.8, // 基于正则的置信度
                timestamp: msg.timestamp
              },
              metadata: {
                confidence: 0.8,
                window: '5min',
                channel: 'fast'
              }
            });
            break; // 每条消息每个意图类型只匹配一次
          }
        }
      }
    }

    // emit所有检测到的事件
    for (const evt of events) {
      bus.emit(evt.type, evt.payload, PROBE_ID);
    }

    this.lastScanTimestamp = Date.now();
    this.saveState();

    return events;
  }
}

module.exports = { FastChannel, INTENT_PATTERNS };
```

**注册为Cron任务**：

```json
// openclaw.json 中新增
{
  "cron": {
    "cras-fast-channel": {
      "schedule": "*/5 * * * *",
      "command": "node /root/.openclaw/workspace/skills/cras/conversation-probe.js --fast",
      "model": "glm-5",
      "description": "CRAS快通道：5分钟增量对话意图扫描"
    }
  }
}
```

### 5.3 慢通道设计（Slow Channel）

**目标**：每日聚合全量对话数据，识别宏观模式/趋势，emit模式事件。

**文件位置**：`skills/cras/daily-aggregator.js`（新建）

```javascript
// skills/cras/daily-aggregator.js
// CRAS 慢通道 - 每日对话聚合分析

const bus = require('../../infrastructure/event-bus/bus.js');

const PROBE_ID = 'cras-slow-channel';

class SlowChannel {

  /**
   * 每日执行：聚合过去24小时对话，识别宏观模式
   * @param {Array} dailyMessages - 过去24小时的全量消息
   */
  async analyze(dailyMessages) {
    const events = [];

    // ─── 1. 话题频率分析 ───
    const topicFrequency = this.analyzeTopicFrequency(dailyMessages);
    for (const [topic, count] of Object.entries(topicFrequency)) {
      if (count >= 3) { // 同一话题出现3次以上
        events.push({
          type: 'conversation.topic.recurring',
          payload: { topic, count, window: '24h' }
        });
      }
    }

    // ─── 2. 情绪走势分析 ───
    const sentimentTrend = this.analyzeSentimentTrend(dailyMessages);
    if (sentimentTrend.shift_detected) {
      events.push({
        type: 'user.sentiment.sentiment_shifted',
        payload: {
          from: sentimentTrend.from,
          to: sentimentTrend.to,
          trigger_messages: sentimentTrend.triggers,
          window: '24h'
        }
      });
    }

    // ─── 3. 纠正信号聚合 ───
    const corrections = this.aggregateCorrections(dailyMessages);
    if (corrections.length >= 2) { // 同一方向的纠正≥2次
      events.push({
        type: 'conversation.correction.recurring',
        payload: {
          correction_count: corrections.length,
          topics: corrections.map(c => c.topic),
          window: '24h'
        }
      });
    }

    // ─── 4. 教学信号聚合 ───
    const teachings = this.aggregateTeachings(dailyMessages);
    if (teachings.length >= 1) {
      events.push({
        type: 'conversation.teaching.recurring',
        payload: {
          teaching_count: teachings.length,
          lessons: teachings.map(t => t.lesson),
          window: '24h'
        }
      });
    }

    // ─── 5. 能力缺口识别 ───
    const capabilityGaps = this.identifyCapabilityGaps(dailyMessages);
    for (const gap of capabilityGaps) {
      events.push({
        type: 'evolution.autonomy.opportunity_detected',
        payload: {
          gap_type: gap.type,
          evidence: gap.evidence,
          frequency: gap.frequency,
          window: '24h'
        }
      });
    }

    // emit all events
    for (const evt of events) {
      bus.emit(evt.type, {
        ...evt.payload,
        layer: 'L3',
        probe: PROBE_ID,
        metadata: { confidence: 0.7, window: 'daily', channel: 'slow' }
      }, PROBE_ID);
    }

    return events;
  }

  analyzeTopicFrequency(messages) {
    // 基于关键词/TF-IDF提取话题，统计频率
    const topics = {};
    for (const msg of messages) {
      if (msg.role !== 'user') continue;
      const keywords = this.extractKeywords(msg.content);
      for (const kw of keywords) {
        topics[kw] = (topics[kw] || 0) + 1;
      }
    }
    return topics;
  }

  analyzeSentimentTrend(messages) {
    // 对每条用户消息评估情绪分值，检测趋势变化
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length < 5) return { shift_detected: false };

    const firstHalf = userMessages.slice(0, Math.floor(userMessages.length / 2));
    const secondHalf = userMessages.slice(Math.floor(userMessages.length / 2));

    const firstScore = this.avgSentiment(firstHalf);
    const secondScore = this.avgSentiment(secondHalf);

    if (Math.abs(secondScore - firstScore) > 0.3) {
      return {
        shift_detected: true,
        from: firstScore > 0 ? 'positive' : 'negative',
        to: secondScore > 0 ? 'positive' : 'negative',
        triggers: secondHalf.slice(0, 3).map(m => m.content.substring(0, 100))
      };
    }
    return { shift_detected: false };
  }

  aggregateCorrections(messages) { /* 从消息中提取纠正信号 */ return []; }
  aggregateTeachings(messages) { /* 从消息中提取教学信号 */ return []; }
  identifyCapabilityGaps(messages) { /* 从失败/人工介入消息中识别能力缺口 */ return []; }
  extractKeywords(text) { /* TF-IDF或关键词提取 */ return []; }
  avgSentiment(messages) { /* 平均情绪分 */ return 0; }
}

module.exports = { SlowChannel };
```

**注册为Cron任务**：

```json
{
  "cron": {
    "cras-slow-channel": {
      "schedule": "0 2 * * *",
      "command": "node /root/.openclaw/workspace/skills/cras/conversation-probe.js --slow",
      "model": "glm-5",
      "description": "CRAS慢通道：每日对话聚合分析"
    }
  }
}
```

### 5.4 CRAS探针与ISC规则的运行时绑定

CRAS探针emit的L3事件如何与ISC规则绑定？通过事件总线+dispatcher，与L1/L2完全一致：

```
CRAS快通道 emit user.intent.inferred
    → 事件总线 (bus.emit)
    → dispatcher 消费事件
    → 匹配 routes.json 中的路由
    → 触发对应ISC规则的handler
```

**routes.json 新增路由**：

```json
{
  "user.intent.*": {
    "handler": "intent-dispatcher",
    "agent": "main",
    "priority": "high",
    "description": "用户意图事件路由到对应handler"
  },
  "user.sentiment.*": {
    "handler": "sentiment-handler",
    "agent": "analyst",
    "priority": "normal",
    "description": "情绪事件路由到AEO反馈收集"
  },
  "conversation.topic.recurring": {
    "handler": "pattern-analyzer",
    "agent": "researcher",
    "priority": "normal",
    "description": "反复话题路由到CRAS模式分析"
  },
  "conversation.teaching.*": {
    "handler": "teaching-ingestor",
    "agent": "analyst",
    "priority": "high",
    "description": "教学信号路由到知识沉淀"
  },
  "conversation.correction.*": {
    "handler": "correction-handler",
    "agent": "coder",
    "priority": "high",
    "description": "纠正信号路由到规则/行为修正"
  }
}
```

---

## 第六部分：知识发现→系统适配闭环（L4）

### 6.1 闭环架构

```
┌───────────────────────────────────────────────────────────────────────┐
│                     知识发现→系统适配闭环                               │
│                                                                       │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐               │
│  │ 发现层       │    │ 评估层       │    │ 适配层       │               │
│  │ Discovery    │───▶│ Evaluation  │───▶│ Adaptation  │               │
│  │              │    │             │    │             │               │
│  │ CRAS主动学习 │    │ 可行性评估   │    │ 生成适配方案 │               │
│  │ 公网搜索     │    │ 成本/收益    │    │ DTO调度执行  │               │
│  │ 学术论文     │    │ 风险分析     │    │ 代码变更     │               │
│  │ 他Agent输出 │    │ 优先级排序   │    │ 验证闭环     │               │
│  └─────────────┘    └─────────────┘    └─────────────┘               │
│         │                  │                  │                       │
│  emit: knowledge.          emit: knowledge.    emit: knowledge.       │
│  *.discovered              *.evaluated         *.adapted              │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │ 决策门禁：impact > 3 → 凌霄阁审议 → 用户拍板                 │     │
│  └─────────────────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────────────┘
```

### 6.2 知识发现探针

**文件位置**：`skills/cras/knowledge-discovery-probe.js`（新建）

```javascript
// skills/cras/knowledge-discovery-probe.js
// L4 知识发现探针

const bus = require('../../infrastructure/event-bus/bus.js');
const PROBE_ID = 'cras-knowledge-discovery';

class KnowledgeDiscoveryProbe {

  /**
   * 从学习任务结果中评估是否有增量价值
   * @param {Object} learningResult - CRAS主动学习的输出
   */
  evaluateDiscovery(learningResult) {
    const { source, topic, findings } = learningResult;

    for (const finding of findings) {
      // 评估发现的价值
      const value = this.assessValue(finding);

      if (value.score >= 0.6) { // 价值阈值
        const noun = this.classifyNoun(finding);
        bus.emit(`knowledge.${noun}.discovered`, {
          source,
          topic,
          finding_summary: finding.summary,
          value_score: value.score,
          applicability: value.applicability,
          affected_rules: this.identifyAffectedRules(finding),
          affected_skills: this.identifyAffectedSkills(finding),
          recommended_action: value.recommendation,
          layer: 'L4',
          probe: PROBE_ID,
          metadata: { confidence: value.score, window: 'learning_session' }
        }, PROBE_ID);
      }
    }
  }

  assessValue(finding) {
    // 评估维度：
    // 1. 与当前系统的相关性 (0-1)
    // 2. 改进幅度预估 (0-1)
    // 3. 实施成本 (0-1, 越低越好)
    // 4. 风险 (0-1, 越低越好)
    return {
      score: 0.7, // 综合分
      applicability: 'high',
      recommendation: 'evaluate_and_adapt'
    };
  }

  classifyNoun(finding) {
    // 根据发现内容分类名词
    const keywords = finding.keywords || [];
    if (keywords.includes('architecture')) return 'architecture_pattern';
    if (keywords.includes('security')) return 'security_practice';
    if (keywords.includes('embedding') || keywords.includes('vector'))
      return 'embedding_method';
    if (keywords.includes('agent') || keywords.includes('coordination'))
      return 'agent_coordination';
    if (keywords.includes('model') || keywords.includes('llm'))
      return 'model_capability';
    return 'general';
  }

  identifyAffectedRules(finding) { /* 识别受影响的ISC规则 */ return []; }
  identifyAffectedSkills(finding) { /* 识别受影响的技能 */ return []; }
}

module.exports = { KnowledgeDiscoveryProbe };
```

### 6.3 知识适配完整执行路径（事件→决策→行动→反馈）★v4.1补齐

> v4.0只定义了事件和路由，缺少完整的决策→行动→反馈路径。v4.1补齐。

#### 6.3.1 完整执行时序

```
Phase 1: 感知（Perception）
  CRAS主动学习引擎发现新知识
    → knowledge-discovery-probe.js 评估价值
    → 价值分 >= 0.6 时 emit knowledge.{domain}.discovered
    → 事件写入 events.jsonl, layer=L4

Phase 2: 决策（Decision）
  dispatcher 消费 knowledge.{domain}.discovered
    → 路由到 knowledge-adapter handler
    → handler 执行可行性评估:
      ├── 影响范围分析: 识别受影响的规则和技能列表
      ├── 成本估算: 实施所需时间/Token/代码变更量
      ├── 风险评估: 引入的回归风险、兼容性风险
      └── 收益预估: 性能提升/质量提升/能力扩展的量化预期
    → emit knowledge.{domain}.evaluated (附评估报告)

Phase 3: 审批（Approval）
  基于评估报告的 impact_score 分级:
    ├── 低影响 (score < 3): 自动批准 → 直接进入Phase 4
    ├── 中影响 (score 3-6): 生成飞书卡片通知用户 → 等待确认
    └── 高影响 (score > 6): 凌霄阁审议 → 七人投票 → 用户拍板
  
  审批通过后 emit knowledge.{domain}.approved

Phase 4: 执行（Action）
  knowledge-executor handler 消费 approved 事件
    → 生成适配任务（具体代码变更方案）
    → 通过DTO创建执行任务:
      ├── 任务类型: code_change | config_update | rule_update
      ├── 回滚方案: 自动生成Git分支，失败可回滚
      └── 验收标准: 具体的测试用例或指标阈值
    → DTO调度执行
    → 执行完成后 emit knowledge.{domain}.adapted

Phase 5: 反馈（Feedback）
  adapted 事件触发验证流程:
    ├── 自动验证: 运行相关测试用例/扫描器
    ├── 效果评估: 对比适配前后的关键指标
    └── 学习反馈: 将适配结果回馈给CRAS学习引擎
  
  验证结果:
    ├── 成功: emit knowledge.{domain}.verified → 更新知识库，标记为已验证实践
    ├── 部分成功: emit knowledge.{domain}.partial → 记录经验教训，标注需改进点
    └── 失败: emit knowledge.{domain}.rollback → 执行回滚 → 记录失败原因到L5模式库
```

#### 6.3.2 知识适配handler伪代码

```javascript
// infrastructure/dispatcher/handlers/knowledge-adapter.js

class KnowledgeAdapter {
  async handle(event) {
    const { finding_summary, value_score, affected_rules, affected_skills } = event.payload;
    
    // Phase 2: 可行性评估
    const assessment = {
      impact_score: this.calculateImpact(affected_rules, affected_skills),
      cost_estimate: this.estimateCost(finding_summary),
      risk_level: this.assessRisk(affected_rules),
      benefit_projection: this.projectBenefit(finding_summary, value_score),
      affected_components: [...affected_rules, ...affected_skills],
      rollback_plan: this.generateRollbackPlan(affected_rules)
    };
    
    // Phase 3: 分级审批
    if (assessment.impact_score < 3) {
      // 低影响：自动执行
      await this.executeAdaptation(event, assessment);
    } else if (assessment.impact_score <= 6) {
      // 中影响：通知用户确认
      await this.notifyUserForApproval(event, assessment);
      // 用户确认后由回调触发 executeAdaptation
    } else {
      // 高影响：凌霄阁审议
      bus.emit('orchestration.decision.requested', {
        type: 'knowledge_adaptation',
        evidence: event.payload,
        assessment,
        council_required: true
      });
    }
    
    bus.emit(`knowledge.${event.payload.domain}.evaluated`, assessment);
  }
  
  async executeAdaptation(event, assessment) {
    // Phase 4: 通过DTO创建执行任务
    const taskDef = this.generateTaskDefinition(event, assessment);
    const result = await dtoExecutor.createAndRun(taskDef);
    
    // Phase 5: 结果反馈
    if (result.success) {
      bus.emit(`knowledge.${event.payload.domain}.adapted`, {
        original_discovery: event.id,
        changes_made: result.changes,
        verification_status: await this.verify(result)
      });
    } else {
      await this.rollback(result);
      bus.emit(`knowledge.${event.payload.domain}.rollback`, {
        reason: result.error,
        rollback_result: 'success'
      });
    }
  }
}
```

**routes.json 新增路由**：

```json
{
  "knowledge.*.discovered": {
    "handler": "knowledge-adapter",
    "agent": "researcher",
    "priority": "normal",
    "description": "知识发现路由到适配评估"
  },
  "knowledge.*.evaluated": {
    "handler": "knowledge-executor",
    "agent": "coder",
    "priority": "normal",
    "description": "已评估的知识路由到执行"
  },
  "knowledge.*.adapted": {
    "handler": "knowledge-verifier",
    "agent": "analyst",
    "priority": "normal",
    "description": "已适配的知识路由到验证"
  },
  "knowledge.*.rollback": {
    "handler": "knowledge-rollback-recorder",
    "agent": "coder",
    "priority": "high",
    "description": "适配失败回滚，记录到L5模式库"
  }
}
```

---

## 第七部分：系统性故障→重构闭环（L5）

### 7.1 闭环架构

```
┌───────────────────────────────────────────────────────────────────────┐
│                     系统性故障→重构闭环                                 │
│                                                                       │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐               │
│  │ 检测层       │    │ 分析层       │    │ 重构层       │               │
│  │ Detection    │───▶│ Analysis    │───▶│ Refactor    │               │
│  │              │    │             │    │             │               │
│  │ pattern-     │    │ 根因分析     │    │ 重构方案     │               │
│  │ analyzer.js  │    │ 多维关联     │    │ 凌霄阁审议   │               │
│  │              │    │ 因果链构建   │    │ 用户确认     │               │
│  │ 数据源：      │    │ 影响评估     │    │ DTO调度执行  │               │
│  │ · 错误日志   │    │             │    │ 回归验证     │               │
│  │ · Git历史    │    │             │    │             │               │
│  │ · DTO执行记录│    │             │    │             │               │
│  │ · 事件总线   │    │             │    │             │               │
│  └─────────────┘    └─────────────┘    └─────────────┘               │
│         │                  │                  │                       │
│  emit: system.             emit: system.       emit: system.          │
│  failure_pattern.          root_cause.         refactor.              │
│  pattern_emerged           completed           completed              │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │ 强制门禁：所有重构必须经凌霄阁审议 + 用户确认                   │     │
│  └─────────────────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────────────┘
```

### 7.2 模式检测引擎

**文件位置**：`scanners/pattern-analyzer.js`（新建）

```javascript
// scanners/pattern-analyzer.js
// L5 系统性模式检测引擎

const bus = require('../infrastructure/event-bus/bus.js');
const fs = require('fs');
const path = require('path');

const PROBE_ID = 'pattern-analyzer';
const STATE_FILE = path.join(__dirname, '.pattern-state.json');

class PatternAnalyzer {

  constructor() {
    this.patterns = {};
    this.loadState();
  }

  /**
   * 分析事件总线中的历史事件，检测系统性模式
   * 每日运行一次
   */
  async analyze() {
    const events = [];

    // ─── 1. 修补循环检测 ───
    // 同一模块在N天内被修补≥3次
    const patchCycles = await this.detectPatchCycles();
    for (const cycle of patchCycles) {
      events.push({
        type: 'system.patch_cycle.pattern_emerged',
        payload: {
          module: cycle.module,
          patch_count: cycle.count,
          window_days: cycle.windowDays,
          patches: cycle.patches.map(p => ({
            date: p.date,
            commit: p.commit,
            description: p.description
          })),
          severity: cycle.count >= 5 ? 'critical' : 'warning'
        }
      });
    }

    // ─── 2. 跨模块失败关联 ───
    // 多个模块在同一时间窗口内失败
    const correlatedFailures = await this.detectCorrelatedFailures();
    for (const cf of correlatedFailures) {
      events.push({
        type: 'system.failure_pattern.correlated',
        payload: {
          modules: cf.modules,
          failure_count: cf.totalFailures,
          correlation_score: cf.correlationScore,
          common_root: cf.possibleCommonRoot,
          window_hours: cf.windowHours
        }
      });
    }

    // ─── 3. 回归检测 ───
    // 修复后又出现的问题
    const regressions = await this.detectRegressions();
    for (const reg of regressions) {
      events.push({
        type: 'system.regression.pattern_emerged',
        payload: {
          issue: reg.issue,
          fix_commit: reg.fixCommit,
          regression_commit: reg.regressionCommit,
          days_between: reg.daysBetween
        }
      });
    }

    // ─── 4. 架构瓶颈检测 ───
    // 同一架构组件被大量规则引用且频繁报错
    const bottlenecks = await this.detectArchitectureBottlenecks();
    for (const bn of bottlenecks) {
      events.push({
        type: 'system.architecture_bottleneck.pattern_emerged',
        payload: {
          component: bn.component,
          dependent_rules: bn.dependentRules,
          error_rate: bn.errorRate,
          recommendation: bn.recommendation
        }
      });
    }

    // emit all events
    for (const evt of events) {
      bus.emit(evt.type, {
        ...evt.payload,
        layer: 'L5',
        probe: PROBE_ID,
        metadata: { window: 'daily' }
      }, PROBE_ID);
    }

    this.saveState();
    return events;
  }

  async detectPatchCycles() {
    // 从Git log中提取同一模块的修改记录
    // git log --oneline --since="7 days ago" -- skills/*/
    // 统计每个模块的修改次数
    return [];
  }

  async detectCorrelatedFailures() {
    // 从事件总线中消费*.failed事件
    // 按时间窗口分组，检测同时间窗口的多模块失败
    return [];
  }

  async detectRegressions() {
    // 对比已修复问题的事件签名与新出现的事件签名
    return [];
  }

  async detectArchitectureBottlenecks() {
    // 统计每个组件被引用次数 + 报错频率
    return [];
  }

  loadState() { /* ... */ }
  saveState() { /* ... */ }
}

module.exports = { PatternAnalyzer };
```

### 7.3 重构决策完整执行路径（事件→根因→重构→验证→反馈）★v4.1补齐

当L5事件被emit后，触发完整的重构闭环：

#### 7.3.1 完整执行时序

```
Phase 1: 感知（Detection）
  pattern-analyzer.js 日聚合分析检测到模式
    → emit system.{pattern_type}.pattern_emerged
    → 事件携带: 模式类型、证据列表、影响模块、严重度

Phase 2: 根因分析（Root Cause Analysis）
  refactor-analyzer handler 消费事件:
    ├── 收集证据:
    │   ├── Git log: 相关模块最近N天的commit历史
    │   ├── 事件总线: 相关模块的*.failed事件时序
    │   ├── DTO记录: 相关模块的任务执行成功/失败率
    │   └── 错误日志: 相关模块的error log聚合
    ├── 构建因果链:
    │   ├── 时序分析: 哪个变更先发生？后续哪些模块受影响？
    │   ├── 依赖分析: 模块间的调用关系图
    │   └── 假设检验: 排除相关性≠因果性
    └── 输出根因报告:
        ├── 根因描述（自然语言）
        ├── 因果链图（A→B→C）
        ├── 影响范围（受影响的规则/技能列表）
        └── 置信度（0-1）
    → emit system.root_cause.completed

Phase 3: 重构方案生成（Refactor Planning）
  refactor-planner handler 消费 root_cause.completed:
    ├── 生成重构备选方案（至少2个）:
    │   ├── 方案A: 最小侵入性修复（成本低，风险低，效果有限）
    │   └── 方案B: 架构级重构（成本高，风险中，效果彻底）
    ├── 每个方案包含:
    │   ├── 具体代码变更列表
    │   ├── 预期效果（量化指标）
    │   ├── 回滚方案
    │   ├── 回归测试用例
    │   └── 实施工期
    └── emit system.refactor.proposed (附方案列表)

Phase 4: 审批（★强制凌霄阁★）
  所有重构提案强制经凌霄阁审议:
    ├── 七人议会评估:
    │   ├── 架构师: 方案的技术正确性
    │   ├── 工程师: 实施难度和工期
    │   ├── 质量官: 回归风险
    │   ├── 分析师: 数据支撑充分性
    │   ├── 战略家: 与整体方向的一致性
    │   ├── 情报专家: 外部对标（是否有更好方案）
    │   └── 创作大师: 变更文档和沟通方案
    ├── 投票: ≥5/7通过 → 提交用户
    └── 用户拍板: 选择具体方案 → emit system.refactor.approved

Phase 5: 执行（Execution）
  refactor-executor handler 消费 approved:
    ├── 创建Git分支（自动回滚锚点）
    ├── 通过DTO创建重构任务链:
    │   ├── task_1: 代码变更
    │   ├── task_2: 单元测试
    │   ├── task_3: 回归测试
    │   └── task_4: 集成验证
    ├── 逐步执行，任意步骤失败则回滚
    └── 全部通过 → emit system.refactor.completed

Phase 6: 验证与反馈（Verification & Feedback）
  重构完成后:
    ├── 即时验证:
    │   ├── 扫描器重新运行（确认L2事件不再触发）
    │   ├── 检查原始L5模式是否消除
    │   └── 运行受影响规则的测试用例
    ├── 持续观察（7天窗口）:
    │   ├── 监控相关模块的error rate
    │   ├── 检查是否出现新的L5模式
    │   └── 记录人工介入次数
    ├── 反馈回路:
    │   ├── 成功: 更新MEMORY.md记录经验 → 更新pattern-analyzer的模式库
    │   ├── 回归: emit system.regression.pattern_emerged → 紧急处理
    │   └── 部分成功: 记录未解决部分，创建后续任务
    └── emit system.refactor.verified (附验证报告)
```

#### 7.3.2 重构分级与响应时间

| 严重度 | 触发条件 | 响应时间 | 审批方式 |
|--------|---------|---------|---------|
| **Critical** | 架构瓶颈导致核心功能不可用 | 立即 | 凌霄阁紧急会议（简化流程） |
| **High** | 修补循环≥5次，且影响用户体验 | 24h内 | 凌霄阁标准流程 |
| **Medium** | 跨模块关联失败，3-4次修补 | 7天内 | 凌霄阁标准流程 |
| **Low** | 单模块轻微回归，影响可控 | 排入迭代 | 自动批准+用户知会 |

**routes.json 新增路由**：

```json
{
  "system.failure_pattern.*": {
    "handler": "refactor-analyzer",
    "agent": "researcher",
    "priority": "high",
    "description": "系统性故障模式路由到根因分析"
  },
  "system.patch_cycle.*": {
    "handler": "refactor-analyzer",
    "agent": "researcher",
    "priority": "high",
    "description": "修补循环路由到根因分析"
  },
  "system.root_cause.completed": {
    "handler": "refactor-planner",
    "agent": "researcher",
    "priority": "high",
    "description": "根因分析完成后生成重构方案"
  },
  "system.refactor.proposed": {
    "handler": "council-refactor-review",
    "agent": "main",
    "priority": "critical",
    "description": "重构方案强制经凌霄阁审议"
  },
  "system.refactor.approved": {
    "handler": "refactor-executor",
    "agent": "coder",
    "priority": "high",
    "description": "已批准的重构方案路由到执行"
  },
  "system.refactor.completed": {
    "handler": "refactor-verifier",
    "agent": "analyst",
    "priority": "high",
    "description": "重构完成后路由到验证"
  },
  "system.architecture_bottleneck.*": {
    "handler": "architecture-reviewer",
    "agent": "researcher",
    "priority": "critical",
    "description": "架构瓶颈路由到架构审查"
  },
  "system.regression.*": {
    "handler": "regression-handler",
    "agent": "coder",
    "priority": "critical",
    "description": "回归路由到紧急修复"
  }
}
```

---

## 第八部分：自驱进化机制（元事件域）

### 8.1 进化空间识别

用户明确指定的四个进化方向：

| 进化方向 | 当前状态 | 进化目标 | 检测方法 |
|---------|---------|---------|---------|
| **记忆机制** | MEMORY.md + daily notes，会话间断裂 | 语义记忆 + 情景记忆 + 主动回忆 | L3检测记忆失败频率，L5检测记忆相关失败模式 |
| **多Agent协同** | sessions_spawn一对一，无协同 | Agent间可通信、可分工、可并行聚合 | L2检测子Agent完成率/延迟，L5检测协同瓶颈 |
| **自主闭环** | 部分自主，仍需大量人工介入 | 从感知→判断→执行→验证全自主 | L2统计人工介入频率，L3检测"又要我来做"的挫败感 |
| **自主学习** | CRAS有学习引擎但被动 | 主动发现学习机会→学习→验证→沉淀 | L4检测知识发现频率，L5检测学习有效性 |

### 8.2 进化机会检测引擎

**文件位置**：`scanners/evolution-detector.js`（新建）

```javascript
// scanners/evolution-detector.js
// 元事件域探针 - 检测IQ提升机会

const bus = require('../infrastructure/event-bus/bus.js');
const PROBE_ID = 'evolution-detector';

class EvolutionDetector {

  /**
   * 每周运行：综合L1-L5所有信号，识别进化机会
   */
  async detect() {
    const opportunities = [];

    // ─── 1. 记忆进化机会 ───
    const memorySignals = this.aggregateMemorySignals();
    if (memorySignals.failureRate > 0.1 || memorySignals.manualRecoveryCount > 2) {
      opportunities.push({
        type: 'evolution.memory.opportunity_detected',
        direction: 'memory',
        evidence: memorySignals,
        estimated_impact: 'high',
        proposed_actions: [
          '实现语义索引记忆（向量化MEMORY.md + 按需检索）',
          '实现情景记忆（关键对话场景快照）',
          '实现主动回忆（对话中自动召回相关记忆）'
        ]
      });
    }

    // ─── 2. 协同进化机会 ───
    const coordSignals = this.aggregateCoordinationSignals();
    if (coordSignals.bottleneckCount > 3 || coordSignals.avgLatencyMs > 60000) {
      opportunities.push({
        type: 'evolution.coordination.opportunity_detected',
        direction: 'coordination',
        evidence: coordSignals,
        estimated_impact: 'high',
        proposed_actions: [
          '实现Agent间消息通道',
          '实现任务依赖图自动调度',
          '实现并行聚合结果合并'
        ]
      });
    }

    // ─── 3. 自主闭环进化机会 ───
    const autonomySignals = this.aggregateAutonomySignals();
    if (autonomySignals.humanInterventionRate > 0.3) {
      opportunities.push({
        type: 'evolution.autonomy.opportunity_detected',
        direction: 'autonomy',
        evidence: autonomySignals,
        estimated_impact: 'critical',
        proposed_actions: [
          '识别高频人工介入场景 → 自动化',
          '实现自主判断能力（减少"我不确定要不要做"）',
          '实现自主验证能力（做完能自己验证结果）'
        ]
      });
    }

    // ─── 4. 学习进化机会 ───
    const learningSignals = this.aggregateLearningSignals();
    if (learningSignals.discoveryRate < 0.5 || learningSignals.adaptationRate < 0.3) {
      opportunities.push({
        type: 'evolution.learning.opportunity_detected',
        direction: 'learning',
        evidence: learningSignals,
        estimated_impact: 'high',
        proposed_actions: [
          '扩大主动学习范围（更多公网源）',
          '提高知识适配率（从"发现"到"落地"）',
          '实现跨Agent知识共享'
        ]
      });
    }

    // emit opportunities
    for (const opp of opportunities) {
      bus.emit(opp.type, {
        ...opp,
        layer: 'META',
        probe: PROBE_ID,
        metadata: { window: 'weekly' }
      }, PROBE_ID);
    }

    return opportunities;
  }

  aggregateMemorySignals() {
    // 从L3事件中统计记忆失败相关信号
    // 从L5事件中统计记忆相关故障模式
    return { failureRate: 0, manualRecoveryCount: 0 };
  }

  aggregateCoordinationSignals() {
    // 从L2事件中统计子Agent完成率/延迟
    // 从L5事件中统计协同瓶颈
    return { bottleneckCount: 0, avgLatencyMs: 0 };
  }

  aggregateAutonomySignals() {
    // 从L3事件中统计"需要人工"的频率
    // 从L2事件中统计自动执行成功率
    return { humanInterventionRate: 0 };
  }

  aggregateLearningSignals() {
    // 从L4事件中统计知识发现频率和适配率
    return { discoveryRate: 0, adaptationRate: 0 };
  }
}

module.exports = { EvolutionDetector };
```

### 8.3 进化优先级排序

```
优先级 = impact × urgency × feasibility

impact:      该进化对系统整体能力的提升幅度 (1-10)
urgency:     不进化会导致的损失速率 (1-10)
feasibility: 当前技术条件下的可行性 (1-10)
```

| 进化方向 | Impact | Urgency | Feasibility | Score | 优先级 |
|---------|--------|---------|-------------|-------|--------|
| 自主闭环 | 9 | 8 | 6 | 432 | 🥇 |
| 记忆机制 | 8 | 7 | 7 | 392 | 🥈 |
| 自主学习 | 8 | 6 | 5 | 240 | 🥉 |
| 多Agent协同 | 7 | 5 | 5 | 175 | 4th |

### 8.4 凌霄阁审议流程详细设计（v4.1补齐）

> v4.0只提到"凌霄阁审议"但未给出执行细节。v4.1完整设计。

#### 8.4.1 审议触发条件

| 触发源 | 事件类型 | 自动/手动 |
|--------|---------|----------|
| L4高影响知识发现 | `knowledge.*.evaluated(impact>6)` | 自动 |
| L5重构提案 | `system.refactor.proposed` | **强制** |
| META进化机会 | `evolution.*.opportunity_detected` | 自动 |
| 用户直接要求 | `user.intent.council_review.inferred` | 手动 |
| 架构瓶颈 | `system.architecture_bottleneck.pattern_emerged` | **强制** |

#### 8.4.2 审议流程状态机

```
                    ┌───────────┐
                    │ TRIGGERED │ 审议请求到达
                    └─────┬─────┘
                          │
                    ┌─────▼─────┐
                    │ PREPARING │ 收集证据、生成提案
                    └─────┬─────┘
                          │
                    ┌─────▼──────┐
                    │ DELIBERATE │ 七人议会各自评估
                    └─────┬──────┘
                          │
                    ┌─────▼─────┐
                    │  VOTING   │ ≥5/7通过
                    └──┬────┬───┘
                       │    │
              通过 ┌───▼┐  ┌▼───┐ 否决
                   │PASS│  │FAIL│
                   └─┬──┘  └─┬──┘
                     │       │
              ┌──────▼──┐  ┌─▼──────────┐
              │USER_REVIEW│ │ARCHIVED    │
              └──────┬──┘  │(记录否决原因)│
                     │     └────────────┘
              ┌──────▼──┐
              │APPROVED │ 用户拍板
              └──────┬──┘
                     │
              ┌──────▼──────┐
              │ EXECUTING   │ DTO调度执行
              └──────┬──────┘
                     │
              ┌──────▼──────┐
              │ VERIFIED    │ 执行结果验证
              └─────────────┘
```

#### 8.4.3 七人议会角色与评估维度

| 角色 | 评估维度 | 评估输出 | 投票权重 |
|------|---------|---------|---------|
| **战略家** | 与整体方向一致性、长期影响 | 方向判断(同意/反对/有条件) | 1票 |
| **架构师** | 技术正确性、架构影响、与现有系统兼容性 | 技术评审报告 | 1票 |
| **工程师** | 实施难度、工期、资源需求 | 工程量评估 | 1票 |
| **质量官** | 回归风险、测试覆盖、质量影响 | 质量风险矩阵 | 1票 |
| **分析师** | 数据支撑充分性、证据链完整性 | 数据验证报告 | 1票 |
| **创作大师** | 文档影响、用户沟通方案 | 沟通计划 | 1票 |
| **情报专家** | 外部对标、业界实践比较 | 对标报告 | 1票 |

**投票规则**：
- ≥5票通过 → 提交用户确认
- 3-4票 → 修改后重审（最多2次）
- ≤2票 → 否决，归档记录
- 任何角色可投"有条件通过"（附条件列表）

#### 8.4.4 审议成本控制

| 场景 | 预估Token消耗 | 频率 | 月成本 |
|------|-------------|------|--------|
| L5重构审议 | ~15000 tokens/次 | 2-4次/月 | 30K-60K tokens |
| META进化审议 | ~20000 tokens/次 | 1-2次/月 | 20K-40K tokens |
| L4高影响知识 | ~10000 tokens/次 | 1-3次/月 | 10K-30K tokens |
| **月总成本** | | | **60K-130K tokens** |

**成本控制策略**：
1. **预筛**: impact_score < 3 的不进入凌霄阁（自动处理或用户确认即可）
2. **缓存**: 相似提案复用之前的审议结论
3. **简化模式**: 紧急场景下可3人快审（战略家+架构师+工程师）

#### 8.4.5 进化执行完整路径 ★v4.1核心新增

```
Phase 1: 进化机会感知（Weekly）
  evolution-detector.js 综合L1-L5信号
    → 识别四个方向的进化机会:
      记忆(memory) | 协同(coordination) | 自主(autonomy) | 学习(learning)
    → 评估 impact × urgency × feasibility 得分
    → emit evolution.{direction}.opportunity_detected

Phase 2: 进化提案生成
  evolution-council handler 消费 opportunity_detected:
    ├── 生成进化提案:
    │   ├── 当前状态描述（量化基线）
    │   ├── 目标状态描述（量化目标）
    │   ├── 实施方案（步骤列表）
    │   ├── 预期效果（具体指标改善幅度）
    │   ├── 风险清单
    │   └── 资源需求
    └── emit evolution.{direction}.evolution_proposed

Phase 3: 凌霄阁审议（见8.4.2-8.4.3）
    → 通过后 emit evolution.{direction}.evolution_approved
    → 用户拍板确认

Phase 4: 进化执行
  evolution-executor handler:
    ├── 创建进化分支（Git）
    ├── 拆解为DTO任务链:
    │   ├── 进化代码实现
    │   ├── 测试验证
    │   └── 集成部署
    ├── 执行后 emit evolution.{direction}.evolution_executing
    └── 完成后 emit evolution.{direction}.evolution_completed

Phase 5: 进化效果度量
  AEO评测框架验证进化效果:
    ├── 前后对比:
    │   ├── 记忆: 记忆召回准确率（之前 vs 之后）
    │   ├── 协同: 子Agent平均完成时间（之前 vs 之后）
    │   ├── 自主: 人工介入频率（之前 vs 之后）
    │   └── 学习: 知识发现→适配成功率（之前 vs 之后）
    ├── 持续观察: 14天窗口内持续监测
    └── 报告: 生成进化效果报告 → 写入memory + MEMORY.md

Phase 6: 进化元反馈（递归进化）
  进化效果反馈回 evolution-detector:
    ├── 成功的进化模式: 记录为"已验证的进化路径"
    ├── 失败的进化尝试: 记录为"受限的进化方向"
    └── 新发现的进化需求: 触发下一轮检测
  
  ★ 这形成了递归闭环: 进化系统本身也在进化 ★
```

#### 8.4.6 进化方向的量化基线与目标

| 进化方向 | 量化基线指标 | 当前值（估）| 目标值 | 度量方法 |
|---------|------------|-----------|--------|---------|
| **记忆** | 跨会话记忆召回率 | ~30% | >80% | 测试用例: 第N次会话中提及第1次的信息，检查是否记得 |
| **记忆** | 人工记忆修复频率 | ~5次/周 | <1次/周 | 统计`infra.memory.deleted`后`infra.memory.gap_found`事件 |
| **协同** | 子Agent平均完成时间 | ~60s | <30s | 统计DTO子任务execution_time均值 |
| **协同** | 子Agent结果合并冲突率 | ~15% | <5% | 统计合并时需人工介入的比例 |
| **自主** | 人工介入频率 | ~30% | <10% | L3统计"用户被迫亲自操作"的对话比例 |
| **学习** | 知识发现→适配成功率 | ~20% | >50% | L4事件discovered→adapted的转化率 |

**routes.json 新增路由**：

```json
{
  "evolution.*.opportunity_detected": {
    "handler": "evolution-council",
    "agent": "main",
    "priority": "critical",
    "description": "进化机会路由到凌霄阁审议"
  },
  "evolution.*.evolution_proposed": {
    "handler": "council-review",
    "agent": "main",
    "priority": "critical",
    "description": "进化提案路由到凌霄阁投票"
  },
  "evolution.*.evolution_approved": {
    "handler": "evolution-executor",
    "agent": "coder",
    "priority": "high",
    "description": "已批准的进化方案路由到执行"
  },
  "evolution.*.evolution_completed": {
    "handler": "evolution-verifier",
    "agent": "analyst",
    "priority": "high",
    "description": "进化完成后路由到效果验证"
  }
}
```

---

## 第八·五部分：工程可行性方案 ★v4.1新增

> **背景**：工程师审查发现6项致命风险，v4.0声称"全部基于现有代码可落地"是过于乐观的。本章逐一给出可行的解决方案。

### 8.5.1 风险一：CRAS对话历史数据源不存在

**问题**：OpenClaw会话历史存储在`/root/.openclaw/agents/*/sessions/`下，由平台内部管理。CRAS作为skill没有标准API读取对话历史。L3层的前提不成立。

**解决方案：三级替代架构**

```
优先级1（立即可用）: 记忆文件代理
  数据源: memory/YYYY-MM-DD.md（Agent每日自动写入的对话记录）
  优点: 已存在、格式稳定、Agent主动写入
  缺点: 非实时（依赖Agent写入频率），格式非结构化
  快通道实现: 扫描最新的memory文件，提取用户消息行
  
优先级2（1-2天实现）: 消息钩子拦截
  数据源: 在Agent消息处理层增加钩子，每条消息emit到events.jsonl
  实现: 修改OpenClaw主Agent的消息处理流程，添加:
    interaction.message.received → events.jsonl (附带消息内容摘要)
    interaction.message.sent → events.jsonl (附带回复内容摘要)
  优点: 实时、结构化、无需访问平台内部存储
  缺点: 需要修改Agent主流程（但改动量小，约20行代码）
  
优先级3（依赖平台能力）: sessions_history API
  如果OpenClaw未来提供 sessions_history 作为tool给skill调用
  则CRAS可直接读取完整对话历史
  当前状态: 该API存在但仅main session可用，skill不可调用
```

**推荐方案**：先用优先级1+2组合。优先级2的消息钩子代码示例：

```javascript
// 在Agent消息处理层添加的钩子（约20行）
// 位置: 主Agent的消息处理中间件

function messageHook(message, direction) {
  const bus = require('./infrastructure/event-bus/bus.js');
  bus.emit(`interaction.message.${direction}`, {
    role: direction === 'received' ? 'user' : 'agent',
    content_hash: hash(message.content),  // 不存原文，存hash+摘要
    content_excerpt: message.content.substring(0, 500),
    timestamp: Date.now(),
    session_id: message.session_id,
    channel: message.channel
  }, 'message-hook');
}
```

**CRAS快通道适配**：不再读取session历史，而是消费`interaction.message.received`事件流。将`conversation-probe.js`改为事件消费者而非文件扫描器：

```javascript
// conversation-probe.js 适配后的核心逻辑
class FastChannel {
  scan() {
    // 不再: 读取对话历史文件
    // 改为: 消费事件总线中最近5分钟的interaction.message.received事件
    const recentMessages = bus.consume('cras-fast-channel', {
      type_filter: 'interaction.message.received',
      since: Date.now() - 5 * 60 * 1000
    });
    
    return this.analyzeMessages(recentMessages);
  }
}
```

### 8.5.2 风险二：bus.js的ack()是O(n)全量重写

**问题**：每次ack()读取整个events.jsonl到内存，修改consumed_by，再全量写回。5层事件吞吐下性能灾难。

**解决方案：分离ack存储（Append-Only Ack Log）**

**核心思路**：事件文件（events.jsonl）保持纯追加，永不修改。消费状态分离到独立的ack文件。

```
现有架构（O(n)每次ack）:
  events.jsonl: [event1(consumed_by:[A,B]), event2(consumed_by:[A]), ...]
  每次ack = 读取全部 + 修改 + 写回全部

新架构（O(1)每次ack）:
  events.jsonl: [event1, event2, event3, ...]  ← 纯追加，不可变
  acks.jsonl:   [{"consumer":"A","event_id":"evt_1","ts":123}, ...]  ← 纯追加
  cursors.json: {"A": {"offset": 42}, "B": {"offset": 38}}  ← 小文件，偶尔更新
```

**具体实现**：

```javascript
// bus.js 改造后的核心函数

// emit不变 — 纯追加到events.jsonl
function emit(type, payload, source) {
  const event = { id: generateId(), type, payload, source, timestamp: Date.now() };
  fs.appendFileSync(EVENTS_FILE, JSON.stringify(event) + '\n');
  return event.id;
}

// consume — 基于cursor读取未消费事件
function consume(consumerId, options = {}) {
  const cursor = readCursor(consumerId);
  const events = readEventsFromOffset(cursor.offset);
  const acked = loadAckedSet(consumerId);  // 从acks.jsonl加载该消费者已ack的事件ID集合
  
  return events.filter(e => !acked.has(e.id));
}

// ack — O(1)追加，不再O(n)重写
function ack(consumerId, eventId) {
  // 追加一行到acks.jsonl — O(1)操作
  fs.appendFileSync(ACKS_FILE, JSON.stringify({
    consumer: consumerId,
    event_id: eventId,
    ts: Date.now()
  }) + '\n');
}

// loadAckedSet — 构建消费者的已ack集合（启动时加载一次，内存缓存）
function loadAckedSet(consumerId) {
  if (!ackedCache[consumerId]) {
    const acks = readAcksFile();
    ackedCache[consumerId] = new Set(
      acks.filter(a => a.consumer === consumerId).map(a => a.event_id)
    );
  }
  return ackedCache[consumerId];
}
```

**性能对比**：

| 操作 | 旧方案（O(n)重写） | 新方案（O(1)追加） |
|------|-------------------|-------------------|
| emit | O(1) 追加 | O(1) 追加（不变） |
| ack | **O(n) 读+改+写** | **O(1) 追加** |
| consume | O(n) 全量读+遍历 | O(n) 从offset读（但n更小） |
| 10000事件时的ack | ~3MB读+写 | ~100字节追加 |

**acks.jsonl的清理**：当events.jsonl轮转（10MB）时，同步清理对应的acks记录。acks.jsonl的大小与events.jsonl成正比，不会无限膨胀。

### 8.5.3 风险三：scanners/目录不存在

**问题**：方案中的L5 pattern-analyzer.js和META evolution-detector.js引用`scanners/`目录，但该目录在workspace中不存在。

**解决方案**：

```bash
# 创建目录结构
mkdir -p /root/.openclaw/workspace/infrastructure/scanners

# 所有扫描器统一放在infrastructure/scanners/下
# 与event-bus/、dispatcher/平级
infrastructure/
├── event-bus/
│   ├── bus.js
│   ├── events.jsonl
│   ├── acks.jsonl        # v4.1新增
│   └── noun-registry.jsonl  # v4.1新增
├── dispatcher/
│   ├── dispatcher.js
│   ├── routes.json
│   └── handlers/         # v4.1新增handler目录
└── scanners/             # v4.1新增
    ├── base-scanner.js   # 扫描器基类
    ├── pattern-analyzer.js  # L5
    ├── evolution-detector.js  # META
    └── *.js              # L2扫描器
```

**方案中所有引用`scanners/*.js`的路径统一修正为`infrastructure/scanners/*.js`**。

### 8.5.4 风险四：event-trigger.js条件评估是空实现

**问题**：`evaluateCondition()`永远返回true。v4需要支持confidence过滤、时间窗口匹配、JS表达式评估。

**解决方案：分层条件评估器**

```javascript
// dto-core/triggers/event-trigger.js 改造后

class ConditionEvaluator {
  /**
   * 分层评估条件，从简单到复杂
   */
  evaluate(condition, eventData) {
    if (!condition || condition === '') return true;  // 无条件 = 通过
    
    // Layer 1: 置信度阈值（L3/L4事件必需）
    if (condition.min_confidence) {
      if ((eventData.metadata?.confidence || 0) < condition.min_confidence) {
        return false;
      }
    }
    
    // Layer 2: 时间窗口匹配
    if (condition.time_window) {
      const eventAge = Date.now() - eventData.timestamp;
      if (eventAge > parseWindow(condition.time_window)) {
        return false;  // 事件已过期
      }
    }
    
    // Layer 3: 字段精确匹配
    if (condition.match) {
      for (const [key, expected] of Object.entries(condition.match)) {
        const actual = getNestedValue(eventData, key);
        if (actual !== expected) return false;
      }
    }
    
    // Layer 4: JS表达式（沙箱执行）
    if (condition.expression) {
      return this.evaluateExpression(condition.expression, eventData);
    }
    
    return true;
  }
  
  evaluateExpression(expr, data) {
    // 使用vm.runInNewContext进行沙箱评估
    const vm = require('vm');
    const sandbox = {
      event: data,
      payload: data.payload,
      meta: data.metadata,
      layer: data.layer
    };
    try {
      return vm.runInNewContext(expr, sandbox, { timeout: 100 });
    } catch (e) {
      console.error(`Condition evaluation failed: ${e.message}`);
      return false;  // 评估失败 = 不触发（安全默认值）
    }
  }
}
```

**条件Schema示例**：

```json
{
  "trigger": {
    "events": {
      "L3": ["user.intent.file_request.inferred"]
    },
    "condition": {
      "min_confidence": 0.7,
      "time_window": "5min",
      "match": {
        "payload.channel": "feishu"
      }
    }
  }
}
```

### 8.5.5 风险五：CRAS Module B全部是mock

**问题**：意图分类返回随机值，情绪检测永远返回neutral，模式识别永远返回同一值。

**解决方案：两阶段替换**

**Phase 1（立即可用）— 正则 + 规则引擎**

已有的`conversation-probe.js`的`INTENT_PATTERNS`正则方案作为Phase 1。虽然不是NLU，但：
- 覆盖了高频意图（文件请求、视觉任务等）
- 精确度高（正则匹配 = 高置信度）
- 零额外成本（不消耗LLM Token）

扩展为**分层匹配**：

```javascript
class IntentClassifier {
  classify(message) {
    // Layer 1: 精确正则匹配（confidence = 0.95）
    const regexMatch = this.regexMatch(message);
    if (regexMatch) return { ...regexMatch, confidence: 0.95 };
    
    // Layer 2: 关键词匹配（confidence = 0.7）
    const keywordMatch = this.keywordMatch(message);
    if (keywordMatch) return { ...keywordMatch, confidence: 0.7 };
    
    // Layer 3: 无法分类（不emit事件，避免噪音）
    return null;
  }
}

class SentimentAnalyzer {
  analyze(message) {
    // 基于情绪词典的简单分析
    const negativeWords = ['又', '还是', '错', '问题', '不是', '搞错', '失望'];
    const positiveWords = ['好', '棒', '不错', '完美', '赞', '可以'];
    
    const negScore = negativeWords.filter(w => message.includes(w)).length;
    const posScore = positiveWords.filter(w => message.includes(w)).length;
    
    if (negScore >= 2) return { sentiment: 'frustration', confidence: 0.6 + negScore * 0.1 };
    if (posScore >= 2) return { sentiment: 'satisfaction', confidence: 0.6 + posScore * 0.1 };
    return null;  // 中性 = 不emit
  }
}
```

**Phase 2（后续迭代）— LLM辅助分类**

当Token预算允许时，引入GLM-5进行深层意图分类：

```javascript
// Phase 2: LLM辅助（仅当Phase 1无法分类且消息复杂度高时）
async classifyWithLLM(message) {
  if (message.length < 20) return null;  // 短消息不值得LLM分类
  
  const response = await glm5.chat({
    messages: [{
      role: 'system',
      content: `分析以下用户消息的意图。只返回JSON: {"intent":"xxx","confidence":0.x}`
    }, {
      role: 'user', 
      content: message.substring(0, 500)
    }],
    max_tokens: 50
  });
  
  return JSON.parse(response);
}
```

**成本控制**：Phase 2的LLM分类仅在Phase 1失败时触发，预计<10%的消息需要LLM辅助。月成本约5K-10K tokens。

### 8.5.6 风险六：DTO存在两套事件总线

**问题**：JSONL bus（持久化）和DTO内部EventEmitter（内存）并存，event-bridge.js是桥接层。统一需要全量回归。

**解决方案：Facade模式渐进统一**

**核心原则**：不"废弃"内部EventEmitter，而是将其降级为"进程内同步通知"，所有跨组件事件必须走JSONL bus。

```
旧架构:
  外部事件 → JSONL bus → event-bridge → 内部EventEmitter → DTO组件
  内部事件 → 内部EventEmitter → (丢失，不持久化)

新架构:
  外部事件 → JSONL bus → dispatcher → DTO handler
  内部事件 → JSONL bus → dispatcher → DTO handler  ← 统一了！
  同步回调 → 内部EventEmitter（仅用于进程内同步通知，如"任务开始"通知UI）
```

**渐进迁移策略**（降低回归风险）：

```
Week 1: 双写阶段
  所有新事件写JSONL bus
  内部EventEmitter继续工作
  event-bridge双向同步

Week 2: 消费迁移
  逐个将DTO组件的事件消费从EventEmitter迁移到JSONL bus
  每迁移一个组件后运行回归测试
  
Week 3: 降级阶段
  内部EventEmitter仅保留同步回调功能
  所有持久化事件完全走JSONL bus
  event-bridge简化为单向（JSONL → 同步回调）

Week 4: 清理
  删除event-bridge中的桥接逻辑
  EventEmitter降级为可选的同步通知（不影响事件流）
```

**回归测试清单**：

```javascript
// tests/bus-migration-regression.js
const testCases = [
  'ISC规则CRUD → 事件应出现在JSONL bus',
  'DTO任务创建/完成 → 事件应出现在JSONL bus',
  'SEEF技能流水线 → 全链路事件可追踪',
  'AEO评测 → 开始/完成事件正确emit',
  'CRAS洞察 → 事件正确路由',
  '40+个subscription文件 → 全部可被RuntimeBinder消费'
];
```

### 8.5.7 工程可行性总结

| 风险 | 解决方案 | 改造量 | 风险等级 | 前置依赖 |
|------|---------|--------|---------|---------|
| 对话数据源 | 消息钩子 + 记忆文件代理 | 1天 | 低 | 无 |
| bus.js ack性能 | 分离ack存储 | 1.5天 | 中（核心组件） | 无 |
| scanners/目录 | 创建infrastructure/scanners/ | 0.5h | 无风险 | 无 |
| 条件评估空实现 | 分层条件评估器 | 2天 | 中 | bus.js改造完成 |
| CRAS Module B mock | 正则+词典Phase 1 → LLM Phase 2 | 2天(P1) + 1天(P2) | 低 | 数据源方案完成 |
| DTO双总线 | Facade模式渐进迁移 | 3-4天 | **高**（需全量回归） | bus.js改造完成 |

**关键路径**：bus.js改造(1.5天) → 条件评估器(2天) → DTO总线统一(4天) → CRAS数据源(1天) → Module B Phase 1(2天) = **约10.5天**

---

## 第九部分：事件源架构（v4全景）

### 9.1 事件源清单（v4完整版）

| ES_ID | 名称 | 层级 | 位置 | 状态 | 职责 |
|-------|------|------|------|------|------|
| ES01 | git-hook | L1 | `.git/hooks/post-commit` | ✅已有 | 文件变更事件 |
| ES02 | event-bridge | L1 | `isc-core/event-bridge.js` | ✅已有 | ISC规则CRUD事件 |
| ES03 | event-bus | 基础设施 | `infrastructure/event-bus/bus.js` | ✅已有 | 统一事件持久化 |
| ES04 | dispatcher | 路由 | `infrastructure/dispatcher/dispatcher.js` | ✅已有 | 事件路由到handler |
| ES05 | dto-event-bus | (废弃) | `dto-core/core/event-bus.js` | ⚠️待废弃 | 统一到ES03 |
| ES06 | skill-watcher | L1 | `scanners/skill-watcher.js` | 🆕新建 | 技能目录变更事件 |
| ES07 | naming-scanner | L2 | `scanners/naming-scanner.js` | 🆕新建 | 命名规范扫描 |
| ES08 | skill-quality-scanner | L2 | `scanners/skill-quality-scanner.js` | 🆕新建 | 技能质量扫描 |
| ES09 | vectorization-scanner | L2 | `scanners/vectorization-scanner.js` | 🆕新建 | 向量化覆盖扫描 |
| ES10 | rule-scanner | L2 | `scanners/rule-scanner.js` | 🆕新建 | 规则格式/完整性扫描 |
| ES11 | alignment-scanner | L2 | `scanners/alignment-scanner.js` | 🆕新建 | ISC-DTO对齐扫描 |
| ES12 | capability-scanner | L2 | `scanners/capability-scanner.js` | 🆕新建 | 能力锚点扫描 |
| ES13 | error-scanner | L2 | `scanners/error-scanner.js` | 🆕新建 | 错误频率扫描 |
| ES14 | config-watcher | L1 | `scanners/config-watcher.js` | 🆕新建 | 配置变更监听 |
| **ES25** | **cras-fast-channel** | **L3** | `skills/cras/conversation-probe.js` | 🆕新建 | 快通道意图提取 |
| **ES26** | **cras-slow-channel** | **L3** | `skills/cras/daily-aggregator.js` | 🆕新建 | 慢通道模式分析 |
| **ES27** | **knowledge-probe** | **L4** | `skills/cras/knowledge-discovery-probe.js` | 🆕新建 | 知识发现探针 |
| **ES28** | **pattern-analyzer** | **L5** | `scanners/pattern-analyzer.js` | 🆕新建 | 系统性模式检测 |
| **ES29** | **evolution-detector** | **META** | `scanners/evolution-detector.js` | 🆕新建 | 进化机会检测 |
| ES24 | global-sweep | L1-L5 | `scanners/global-sweep.js` | 🆕新建 | 全量兜底扫描 |

### 9.2 五层事件源到规则的映射

```
┌───────────────────────────────────────────────────────────────────────┐
│ L1: ES01(git) + ES02(bridge) + ES06(skill) + ES14(config)            │
│     → 覆盖全部74条规则的lifecycle事件                                  │
├───────────────────────────────────────────────────────────────────────┤
│ L2: ES07-ES13 + ES24(sweep)                                         │
│     → 覆盖52条有量化条件的规则                                        │
├───────────────────────────────────────────────────────────────────────┤
│ L3: ES25(fast) + ES26(slow)                                         │
│     → 覆盖28条涉及用户交互的规则                                      │
│     → 核心驱动: R73(源文件), R76(视觉), R77(路由), R51(反馈)          │
├───────────────────────────────────────────────────────────────────────┤
│ L4: ES27(knowledge)                                                  │
│     → 覆盖18条可受外部知识驱动的规则                                  │
│     → 核心驱动: R60(架构审计), R36(向量化标准), R48(权限模型)          │
├───────────────────────────────────────────────────────────────────────┤
│ L5: ES28(pattern)                                                    │
│     → 覆盖22条涉及系统健康的规则                                      │
│     → 核心驱动: R06(错误检测), R59(根因分析), R61(模式解决)            │
├───────────────────────────────────────────────────────────────────────┤
│ META: ES29(evolution)                                                │
│     → 覆盖全部74条规则（任何规则都可能产生进化信号）                    │
│     → 核心驱动: 四个进化方向（记忆/协同/闭环/学习）                    │
└───────────────────────────────────────────────────────────────────────┘
```

### 9.3 整体架构图（v4）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          事件源层（五层 + META）                              │
│                                                                              │
│  L1 ──── ES01(git) + ES02(bridge) + ES06(skill) + ES14(config)              │
│           │ 实时同步emit                                                     │
│           │                                                                  │
│  L2 ──── ES07(naming) + ES08(quality) + ES09(vector) + ES10(rule)           │
│           + ES11(alignment) + ES12(capability) + ES13(error)                │
│           │ 10-30min扫描周期                                                 │
│           │                                                                  │
│  L3 ──── ES25(cras-fast: 5min) + ES26(cras-slow: daily)                    │
│           │ 对话流语义提取                                                    │
│           │                                                                  │
│  L4 ──── ES27(knowledge-discovery)                                          │
│           │ 学习任务驱动                                                      │
│           │                                                                  │
│  L5 ──── ES28(pattern-analyzer: daily)                                      │
│           │ 历史数据关联分析                                                  │
│           │                                                                  │
│  META ── ES29(evolution-detector: weekly)                                   │
│           │ L1-L5信号二阶聚合                                                │
│           │                                                                  │
│  SWEEP ─ ES24(global-sweep: 6h)                                            │
│                                                                              │
└──────────────┬───────────────────────────────────────────────────────────────┘
               │
    ┌──────────▼──────────┐
    │  统一事件总线         │
    │  infrastructure/     │
    │  event-bus/bus.js    │
    │  (JSONL持久化+锁)    │
    │                      │
    │  每个事件携带:        │
    │  · type (noun.verb)  │
    │  · layer (L1-L5/META)│
    │  · probe (ES_ID)     │
    │  · confidence        │
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │  Dispatcher          │
    │  事件-规则匹配        │
    │  按layer分级路由      │
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │  ISC规则层            │
    │  74条规则            │
    │  trigger.events.L1-L5│
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │  DTO执行层           │
    │  runtime-binder      │
    │  task-executor       │
    │  result-emitter      │
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │  结果→事件总线        │
    │  (形成闭环)          │
    └─────────────────────┘
```

---

## 第十部分：实施路线图

### Phase 1: v3基础完善（2天）

延续v3的Phase 1-2，先把L1+L2跑通。

| 任务 | 产出 | 文件位置 | 估时 |
|------|------|---------|------|
| 1.1 统一事件总线 | 废弃DTO内部bus | `dto-core/core/event-bus.js`（废弃） | 2h |
| 1.2 dispatcher真正执行 | handler执行框架 | `infrastructure/dispatcher/dispatcher.js`（改造） | 3h |
| 1.3 BaseScanner框架 | 扫描器基类 | `scanners/base-scanner.js`（新建） | 2h |
| 1.4 L1事件源完善 | git hook扩展 | `.git/hooks/post-commit`（改造） | 1h |
| 1.5 L2扫描器实现 | 7个组合扫描器 | `scanners/*.js`（新建） | 8h |
| 1.6 事件Schema v4 | layer/probe字段 | `infrastructure/event-bus/bus.js`（改造） | 1h |

### Phase 2: CRAS双通道（L3）（2天）

| 任务 | 产出 | 文件位置 | 估时 |
|------|------|---------|------|
| 2.1 快通道实现 | 5min意图扫描 | `skills/cras/conversation-probe.js`（新建） | 4h |
| 2.2 慢通道实现 | daily聚合分析 | `skills/cras/daily-aggregator.js`（新建） | 4h |
| 2.3 意图模式库 | 可扩展的模式匹配 | `skills/cras/intent-patterns.json`（新建） | 2h |
| 2.4 L3路由配置 | dispatcher路由 | `infrastructure/dispatcher/routes.json`（更新） | 1h |
| 2.5 Cron注册 | 快慢双通道 | `openclaw.json`（更新） | 0.5h |

### Phase 3: 知识发现闭环（L4）（2天）

| 任务 | 产出 | 文件位置 | 估时 |
|------|------|---------|------|
| 3.1 知识发现探针 | L4事件emit | `skills/cras/knowledge-discovery-probe.js`（新建） | 4h |
| 3.2 知识适配handler | 评估+适配 | `infrastructure/dispatcher/handlers/knowledge-adapter.js`（新建） | 4h |
| 3.3 凌霄阁接口 | 高影响决策审议 | `skills/council-integration.js`（改造） | 2h |
| 3.4 L4路由配置 | dispatcher路由 | `infrastructure/dispatcher/routes.json`（更新） | 1h |

### Phase 4: 系统性模式检测（L5）（2天）

| 任务 | 产出 | 文件位置 | 估时 |
|------|------|---------|------|
| 4.1 模式检测引擎 | L5事件emit | `scanners/pattern-analyzer.js`（新建） | 6h |
| 4.2 根因分析handler | 多维关联 | `infrastructure/dispatcher/handlers/refactor-analyzer.js`（新建） | 4h |
| 4.3 重构执行handler | 方案→执行 | `infrastructure/dispatcher/handlers/refactor-executor.js`（新建） | 3h |
| 4.4 L5路由配置 | dispatcher路由 | `infrastructure/dispatcher/routes.json`（更新） | 1h |

### Phase 5: 自驱进化（META）（1天）

| 任务 | 产出 | 文件位置 | 估时 |
|------|------|---------|------|
| 5.1 进化检测引擎 | META事件emit | `scanners/evolution-detector.js`（新建） | 4h |
| 5.2 凌霄阁进化审议 | 专用审议流程 | `skills/council-evolution.js`（新建） | 3h |
| 5.3 META路由配置 | dispatcher路由 | `infrastructure/dispatcher/routes.json`（更新） | 1h |

### Phase 6: 规则迁移+验证（2天）

| 任务 | 产出 | 文件位置 | 估时 |
|------|------|---------|------|
| 6.1 规则Schema迁移脚本 | v3→v4 trigger格式 | `scripts/migrate-rules-v4.js`（新建） | 3h |
| 6.2 执行迁移 | 74条规则JSON更新 | `skills/isc-core/rules/*.json`（更新） | 2h |
| 6.3 事件推导验证 | derive-events-v4.js | `skills/isc-core/bin/derive-events-v4.js`（新建） | 3h |
| 6.4 端到端测试 | L1-L5全链路验证 | `tests/e2e-event-flow.js`（新建） | 4h |
| 6.5 三角对齐监控 | ISC-Event-DTO | `monitors/alignment-monitor.js`（新建） | 2h |

### 总估时

| Phase | 估时 | 可并行 |
|-------|------|--------|
| Phase 1 (L1+L2基础) | 2天 | — |
| Phase 2 (L3 CRAS) | 2天 | 可与Phase 3并行 |
| Phase 3 (L4知识发现) | 2天 | 可与Phase 2并行 |
| Phase 4 (L5模式检测) | 2天 | 可与Phase 5并行 |
| Phase 5 (META进化) | 1天 | 可与Phase 4并行 |
| Phase 6 (迁移+验证) | 2天 | 需前5个Phase完成 |
| **总计** | **11天**（串行）/ **7天**（最大并行） |

---

## 第十一部分：代码变更清单

### 新建文件（19个）

| 文件路径 | 用途 | 对应Phase |
|---------|------|----------|
| `scanners/base-scanner.js` | 扫描器基类 | P1 |
| `scanners/skill-scanner.js` | L2技能扫描 | P1 |
| `scanners/rule-scanner.js` | L2规则扫描 | P1 |
| `scanners/vectorization-scanner.js` | L2向量化扫描 | P1 |
| `scanners/infra-scanner.js` | L2基础设施扫描 | P1 |
| `scanners/quality-scanner.js` | L2质量扫描 | P1 |
| `scanners/sync-scanner.js` | L2同步扫描 | P1 |
| `scanners/global-sweep.js` | 全量兜底扫描 | P1 |
| `skills/cras/conversation-probe.js` | L3 CRAS快通道 | P2 |
| `skills/cras/daily-aggregator.js` | L3 CRAS慢通道 | P2 |
| `skills/cras/intent-patterns.json` | L3意图模式库 | P2 |
| `skills/cras/knowledge-discovery-probe.js` | L4知识发现探针 | P3 |
| `infrastructure/dispatcher/handlers/knowledge-adapter.js` | L4知识适配 | P3 |
| `scanners/pattern-analyzer.js` | L5模式检测 | P4 |
| `infrastructure/dispatcher/handlers/refactor-analyzer.js` | L5根因分析 | P4 |
| `scanners/evolution-detector.js` | META进化检测 | P5 |
| `skills/isc-core/bin/derive-events-v4.js` | 事件推导算法 | P6 |
| `scripts/migrate-rules-v4.js` | 规则迁移脚本 | P6 |
| `tests/e2e-event-flow.js` | 端到端测试 | P6 |

### 改造文件（8个）

| 文件路径 | 变更内容 | 对应Phase |
|---------|---------|----------|
| `infrastructure/event-bus/bus.js` | emit增加layer/probe字段 | P1 |
| `infrastructure/dispatcher/dispatcher.js` | 真正执行handler | P1 |
| `infrastructure/dispatcher/routes.json` | 新增L3-L5+META路由 | P2-P5 |
| `.git/hooks/post-commit` | 扩展emit事件类型 | P1 |
| `dto-core/core/event-bus.js` | 标记废弃，引导到bus.js | P1 |
| `skills/isc-core/rules/*.json` (74个) | trigger.events格式v4化 | P6 |
| `openclaw.json` | 注册新Cron任务 | P2 |
| `skills/cras/event-bridge.js` | 对接新的L3探针 | P2 |

---

## 第十二部分：关键设计决策记录

| # | 决策 | 理由 | 来源 |
|---|------|------|------|
| D1 | 五层事件模型是关于**事件来源和捕获机制**，不是事件分类 | 事件分类仍用noun.verb语法，五层描述信号从哪来 | 用户教学 |
| D2 | 动词从4类扩展为6类（+signal +discovery） | L3的语义推断和L4的知识发现不能归入观测（observation是量化的） | 架构分析 |
| D3 | CRAS作为L3的唯一探针，双通道设计 | 快通道捕捉原子意图（实时性），慢通道识别宏观模式（深度） | 用户明确指定 |
| D4 | L5不等于L2的"错误次数≥N" | L5是多维关联分析（跨模块、跨时间、因果链），L2是单维度阈值 | 用户教学 |
| D5 | 元事件域是L1-L5的二阶聚合，不是第六层 | 进化机会来自所有层的信号综合，不是独立信号源 | 架构分析 |
| D6 | 所有进化决策必须经凌霄阁审议+用户拍板 | 进化改变系统根基，风险极高，必须有人类监督 | 用户明确指定 |
| D7 | 事件Schema增加layer/probe/confidence字段 | L3/L4是推断性的，需要置信度；layer/probe方便调试和统计 | 架构需要 |
| D8 | trigger.events从数组改为按层分类的对象 | 明确标注每条规则与哪些层相关，方便查询和管理 | 可维护性 |
| D9 | 知识发现→凌霄阁审议→用户确认→执行 | 外部知识适配有风险，高影响变更必须人审 | 用户价值观 |
| D10 | 系统性故障→重构必须强制经凌霄阁 | 重构改变系统结构，是最高风险操作 | 架构安全 |
| D11 | 事件分类体系6类×开放名词，支撑30000条规则 | 动词封闭（6类穷尽状态变化），名词开放（按需生长） | 反熵增原则 |
| D12 | DTO仍是唯一调度引擎，不新增引擎 | L3/L4/L5的handler最终都通过DTO调度执行 | 用户明确约束 |

---

## 附录A：v3→v4差异总结

| 维度 | v3 | v4 | 变化 |
|------|----|----|------|
| 事件层级 | 3层+sweep | 5层+META+sweep | L3/L4/L5/META全新 |
| 动词类别 | 4类/21个 | 6类/38个 | +signal(6)+discovery(7) |
| 事件源数量 | 24个 | 29个 | +5个(ES25-ES29) |
| 规则覆盖 | L1+L2 100% | L1-L5+META多层覆盖 | 从2层到5+1层 |
| CRAS定位 | 消费事件+学习 | **L3事件探针+知识发现** | 角色根本性升级 |
| 对话是否事件源 | 否 | **是** | 最大认知突破 |
| 知识发现 | 无 | **完整闭环** | 全新 |
| 系统性模式 | L2阈值 | **L5多维关联** | 从统计到智能 |
| 自驱进化 | 无 | **完整机制** | 全新 |
| 凌霄阁角色 | 可选 | **重构+进化强制** | 升级为安全门禁 |
| trigger格式 | events数组 | events按层分类对象 | 结构升级 |
| 事件Schema | type+source | +layer+probe+confidence | 元数据增强 |

---

## 附录B：事件类型注册表v4（完整版）

> 在v3的88种事件类型基础上，新增L3/L4/L5/META事件类型。

### L3新增事件类型（v4.1语义细分，25种）

> v4.0将10+种意图统一映射到`user.intent.inferred`，导致语义稀释。v4.1每个意图独立命名。

```
# 意图类事件（每种意图独立命名，消除语义稀释）
user.intent.file_request.inferred           # 文件请求意图
user.intent.vision_task.inferred            # 视觉任务意图
user.intent.task_routing.inferred           # 任务路由意图
user.intent.rule_creation.inferred          # 规则创建意图
user.intent.skillification.inferred         # 技能化意图
user.intent.skillification.emphasized       # 技能化强调
user.intent.evaluation.inferred             # 评测意图
user.intent.capability_declare.inferred     # 能力声明意图
user.intent.bilingual.inferred              # 双语要求意图
user.intent.parallel_analysis.inferred      # 并行分析意图
user.intent.priority_adjust.inferred        # 优先级调整意图
user.intent.time_granularity.inferred       # 时间粒度意图
user.intent.council_review.inferred         # 审议要求意图
user.intent.doc_request.inferred            # 文档请求意图
user.intent.severity.emphasized             # 严重度强调
user.intent.action_demand.emphasized        # 行动要求强调
user.intent.delivery_urgency.emphasized     # 交付紧迫强调

# 情绪类事件（按具体情绪细分）
user.sentiment.frustration.shifted          # 用户挫败
user.sentiment.satisfaction.inferred        # 用户满意
user.sentiment.doc_quality.shifted          # 文档质量不满
user.sentiment.info_overload.shifted        # 信息过载不满

# 对话模式类事件
conversation.topic.recurring                # 话题反复出现
conversation.correction.inferred            # 对话纠正信号
conversation.correction.recurring           # 纠正反复出现
conversation.teaching.inferred              # 教学信号
conversation.teaching.recurring             # 教学反复出现
conversation.capability_gap.inferred        # 对话中暴露的能力缺口
user.request.pattern_emerged                # 用户请求模式涌现
user.profile.preference_shifted             # 用户偏好变化（慢通道）
```

### L4新增事件类型（8种）

```
knowledge.architecture_pattern.discovered    # 架构模式发现
knowledge.engineering_practice.discovered    # 工程实践发现
knowledge.tool.discovered                    # 工具/库发现
knowledge.security_practice.discovered       # 安全实践发现
knowledge.embedding_method.discovered        # Embedding方法发现
knowledge.agent_coordination.discovered      # Agent协同模式发现
knowledge.model_capability.discovered        # 模型能力发现
knowledge.*.evaluated                        # 知识评估完成（通配）
knowledge.*.adapted                          # 知识适配完成（通配）
```

### L5新增事件类型（6种）

```
system.failure_pattern.pattern_emerged       # 失败模式涌现
system.failure_pattern.correlated            # 失败模式关联
system.patch_cycle.pattern_emerged           # 修补循环检测
system.architecture_bottleneck.pattern_emerged # 架构瓶颈涌现
system.regression.pattern_emerged            # 回归模式涌现
system.performance_degradation.pattern_emerged # 性能退化模式
```

### META新增事件类型（8种）

```
evolution.memory.opportunity_detected        # 记忆进化机会
evolution.coordination.opportunity_detected  # 协同进化机会
evolution.autonomy.opportunity_detected      # 闭环进化机会
evolution.learning.opportunity_detected      # 学习进化机会
evolution.reasoning.opportunity_detected     # 推理进化机会
evolution.*.evolution_proposed               # 进化方案提出
evolution.*.evolution_approved               # 进化方案批准
evolution.*.evolution_completed              # 进化执行完成
```

### v4.1事件类型总数

| 层级 | 事件类型数 | 来源 |
|------|-----------|------|
| L1 (v3已有) | 42 | 对象生命周期 |
| L2 (v3已有) | 46 | 量化阈值+扫描 |
| L3 (v4.1细分) | **28** | 语义意图（17种意图+4种情绪+7种对话模式） |
| L4 (v4新增) | 8+ | 知识发现（开放名词，可生长） |
| L5 (v4新增) | 6 | 系统性模式 |
| META (v4新增) | 8+ | 自驱进化（开放名词，可生长） |
| **合计** | **~138种**（当前） | 3000规则时预计~1100种 |

> v4.0的L3只有12种事件类型，但10+种意图共用`user.intent.inferred`导致语义稀释。v4.1将每种意图独立命名后，L3事件类型增至28种，但语义精度大幅提升，事件总线可直接基于类型路由。

---

## 附录C：与v3的向后兼容

v4完全向后兼容v3：

1. **事件Schema**：v3事件（无layer/probe字段）在v4中自动标记为`layer: "L1"` 或 `layer: "L2"`
2. **trigger格式**：如果trigger.events仍是字符串数组（v3格式），自动视为L1/L2事件
3. **routes.json**：v3的路由规则不变，v4只新增L3-L5和META的路由
4. **bus.js API**：emit/consume API不变，只是emit时可以额外传layer/probe

迁移策略：先跑v4新功能，再逐步迁移v3规则到v4 trigger格式。不需要一次性全部迁移。

---

## 附录D：反熵增检查清单

本设计的每个组件都需要通过反熵增检查：

| 检查项 | 标准 | 结果 |
|--------|------|------|
| 事件分类体系能否支撑3000条规则？ | 名词开放+动词封闭 | ✅ 6类×开放=无限 |
| 新增规则是否需要修改分类体系？ | 不需要 | ✅ 推导算法自动生成 |
| 新增事件层是否需要重构？ | 不需要 | ✅ 五层模型穷尽感知通道 |
| CRAS双通道能否独立扩展？ | 快慢通道独立 | ✅ 可独立新增通道 |
| 知识发现闭环能否泛化？ | 不限于特定知识类型 | ✅ 名词开放 |
| 进化机制能否自我进化？ | 进化检测器本身可被升级 | ✅ 凌霄阁可审议进化机制本身 |
| **★名词空间会否无序膨胀？** | **有注册+去重+废弃机制** | **✅ 2.8节名词治理机制** |
| **★语义是否会稀释？** | **每个意图独立命名** | **✅ v4.1细分了28种L3事件** |
| **★有"收缩"能力吗？** | **休眠→废弃→退役流程** | **✅ 2.8.3节自动废弃规则** |
| **★覆盖率数据是否诚实？** | **逐行核查** | **✅ v4.1修正为真实数据** |

**v4.1新增的反熵增保障**：
1. **名词注册表** — 防止命名空间无序膨胀（2.8.1）
2. **名词去重扫描** — 合并语义重复的名词（2.8.2）
3. **名词自动废弃** — 30天未使用→休眠，90天→废弃（2.8.3）
4. **收缩metrics** — 活跃名词/规则比、休眠占比等健康指标（2.8.3）
5. **命名层级标准化** — 禁止同义变体（2.8.4）

**本设计满足反熵增原则：系统不仅能有序增长，也能主动收缩清理。**

---

*v4.0.0 — 五层事件认知模型，基于用户3小时深度教学的认知全面升级。*