# ISC-事件-DTO 闭环方案 v4.3 — 五层事件认知模型（意图识别体系 + 三阻断项修复版）

> **版本**: v4.3.0
> **作者**: 系统架构师
> **日期**: 2026-03-04
> **状态**: V4.3 — 意图-事件识别与映射体系 + 三阻断项工程修复
> **前置**: v3的全面升级，基于用户五层事件认知模型教学（3小时深度教学）
> **v4.1变更**: 修正覆盖率统计、补齐闭环执行路径、解决语义稀释、增加工程可行性方案、增加名词治理机制
> **v4.2变更**: 容灾降级回滚、事件风暴抑制、端到端Trace、消息钩子精确集成、semanticSimilarity实现、DTO双写去重+subscription迁移、事件反馈环防护、10+空壳函数填充
> **v4.3变更**: 分层架构元原则（感知/认知/执行三层解耦）、意图-事件识别与映射体系（CRAS识别+AEO治理，五类收敛+未知意图发现+反熵增治理+AEO准出门禁）、推导算法12个判断函数实现、bus.consume() type_filter/since完整实现、Dispatcher loadHandler/matchRoute通配优先级策略、全子系统三层归属标注

---

## TL;DR

**v3的根本缺陷**：只看到了L1（对象生命周期）和L2（量化阈值），把"事件"局限在了代码/文件系统层面。缺失了L3（对话中的语义意图）、L4（知识发现）、L5（系统性故障模式），以及最高优先级的"元事件域"——自驱进化。v3是半盲的。

**v4的第一性原理**：**事件 = 系统状态空间中任何可被感知的状态跃迁。** 不仅是代码文件的CRUD（L1），不仅是计数器越过阈值（L2），还包括：从非结构化对话中提取的语义信号（L3）、从公网/学术学习中发现的增量价值（L4）、从反复失败中涌现的系统性模式（L5）。而这一切的一切，都服务于一个元目标——**系统如何让自己变得更聪明**。

**v4.3架构元原则**：**感知-认知-执行三层解耦。** 每个规则、任务、技能都必须明确：谁观察（感知层）、谁判断（认知层）、谁行动（执行层）。三层通过事件总线和Dispatcher路由解耦，每层可独立替换、独立演进、独立测试。这是所有子系统设计的结构约束。

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

## 第零部分：分层架构原则（感知-认知-执行三层解耦）★v4.3新增

> **元原则**：本方案中的每个规则、任务、技能、子系统都必须明确三层归属。这不是可选标注，而是架构约束——任何新设计如果不能清晰回答"谁观察？谁判断？谁行动？"，就不允许进入实施。

### 0.1 三层定义

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│    感知层（Perception）                                                      │
│    ─────────────────                                                         │
│    谁观察？什么探针？                                                         │
│    职责：从环境中捕获状态跃迁信号，转化为结构化事件                            │
│    产出：事件（event），写入事件总线                                           │
│    关键约束：感知层不做判断，不做决策，只负责"看到了什么"                       │
│                                                                              │
│    ────────────────── 事件总线（bus.emit）──────────────────                  │
│                                                                              │
│    认知层（Cognition）                                                        │
│    ─────────────────                                                         │
│    谁判断？什么引擎？                                                         │
│    职责：消费事件，做推理/评估/决策，决定是否行动、如何行动                     │
│    产出：决策（action plan），路由到执行层                                     │
│    关键约束：认知层不直接操作外部世界，只产出决策                              │
│                                                                              │
│    ────────────────── Dispatcher 路由 ──────────────────                     │
│                                                                              │
│    执行层（Execution）                                                        │
│    ─────────────────                                                         │
│    谁行动？什么技能？                                                         │
│    职责：接收决策，执行具体操作，产出结果，反馈回事件总线                       │
│    产出：操作结果 + 结果事件（形成闭环）                                       │
│    关键约束：执行层不做战略判断，只按决策执行                                  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 0.2 三层解耦方式

| 解耦边界 | 解耦介质 | 为什么解耦 |
|---------|---------|-----------|
| 感知→认知 | **事件总线**（events.jsonl） | 感知层产出结构化事件，认知层消费事件。二者通过事件Schema解耦——感知层不需要知道谁消费事件，认知层不需要知道事件怎么来的 |
| 认知→执行 | **Dispatcher路由**（routes.json） | 认知层产出行动决策，Dispatcher路由到handler/DTO任务。认知层不需要知道执行细节，执行层不需要知道决策过程 |
| 执行→感知 | **结果事件**（bus.emit反馈） | 执行完成后emit结果事件，感知层可以观测结果。形成闭环但不形成耦合 |

**解耦的反面是什么？** 一个函数里又读传感器、又做判断、又调API——三层职责混在一起。当传感器换了，判断逻辑要改；当API换了，判断逻辑又要改。三层解耦意味着每层可以独立替换、独立演进、独立测试。

### 0.3 全子系统三层归属总览

> 本表是整个方案的"三层地图"——读完此表就知道系统中每个组件的职责边界。

#### 0.3.1 五层事件认知模型的三层归属

| 事件层 | 感知层（谁观察？什么探针？） | 认知层（谁判断？什么引擎？） | 执行层（谁行动？什么技能？） |
|--------|--------------------------|--------------------------|--------------------------|
| **L1 对象生命周期** | git-hook, event-bridge, skill-watcher, config-watcher → 实时emit对象变更事件 | Dispatcher条件评估（Part 8.5.4）→ 判断是否触发规则 | ISC handler → validate/enforce/auto_fix → DTO任务 |
| **L2 量化阈值** | infrastructure/scanners/*.js → 周期扫描指标、计算当前值、与阈值比对 | 阈值越过判定 + 条件评估器（min_confidence/time_window） | ISC handler → 质量修复/告警/升级 → DTO任务 |
| **L3 语义意图** | CRAS快通道（消息钩子→事件消费→IntentScanner） → 5min增量扫描 | **LLM（Opus/GLM-5）+ intent-registry.json** → 意图分类+置信度评估 | ISC handler（R73/R76/R77等）→ 文件发送/模型路由/反馈采集 |
| **L3 意图治理** | CRAS触发计数回写 + `intent.unknown.discovered`事件积累 | **AEO: 向量聚类(智谱embedding) → LLM分类 → MECE校验** | AEO: 注册/合并/废弃intent-registry → AEO评测准出 |
| **L4 知识发现** | CRAS主动学习引擎 → 公网/学术搜索 → 发现价值评估 | knowledge-discovery-probe四维评估 + 凌霄阁（高影响） | knowledge-adapter → DTO创建适配任务 → 回归验证 |
| **L5 系统性模式** | pattern-analyzer → git历史+事件总线+DTO记录 → 日聚合分析 | refactor-analyzer根因分析（因果链构建）+ 凌霄阁（强制） | refactor-executor → Git分支 → DTO重构任务链 → 回归验证 |
| **META 自驱进化** | evolution-detector → L1-L5全层信号二阶聚合 → 周聚合 | 凌霄阁七人议会 + 用户拍板 | evolution-executor → DTO进化任务 → AEO效果度量 |

#### 0.3.2 核心子系统的三层归属

| 子系统 | 感知层 | 认知层 | 执行层 |
|--------|--------|--------|--------|
| **ISC规则治理** | event-bridge（规则CRUD事件）+ scanners（规则质量扫描） | ISC-core校验逻辑（格式/命名/完整性）+ 条件评估器 | auto_fix（自动修复）/ notify（通知）/ escalate（升级）→ DTO |
| **DTO任务调度** | event-trigger（事件订阅匹配）+ runtime-binder（订阅绑定） | 条件评估器（事件是否满足trigger条件） | task-executor（任务执行）+ result-emitter（结果事件） |
| **CRAS对话分析** | 消息钩子（interaction.message.received）→ 事件总线消费 | 快通道：LLM意图识别 / 慢通道：趋势聚合分析 | emit L3事件（意图/情绪/模式）→ 由Dispatcher路由到handler |
| **AEO效果运营** | 用户反馈事件 + 意图触发计数 + 评测结果事件 | AEO评测框架（黄金集+准确率+Badcase根因） | 飞书报告推送 / 规则调优 / 意图注册表更新 |
| **凌霄阁审议** | L4/L5/META的高影响事件（自动触发）+ 用户请求（手动触发） | 七人议会角色评估 → 投票（≥5/7通过）→ 用户确认 | 审议结论事件 → 批准/否决 → 下游执行handler |
| **名词空间治理** | noun-registry.jsonl（名词注册表）+ 名词使用频率统计 | 去重扫描（编辑距离+语义相似度）+ 废弃规则（30/90天） | 合并别名 / 状态变更（dormant→deprecated→retired） |
| **事件风暴抑制** | bus.emitDeduped（500ms去重窗口）+ emitBatch（批量合并） | HandlerRateLimiter（滑动窗口限流判断） | 限流：跳过执行 / 批量：合并后单次执行 |
| **容灾降级** | handler执行异常（catch块）+ events.jsonl损坏检测（selfCheck） | 降级策略矩阵（按handler类型差异化决策） | 重试（指数退避）/ 降级队列 / 飞书通知 / 延迟重试 |
| **端到端Trace** | bus.emit时自动注入trace_id/span_id | traces.jsonl记录每个span的因果关系和耗时 | trace-query.js查询工具 → 全链路可视化 |

#### 0.3.3 意图系统的三层详解

> 用户明确指定的三层分工，在此展开。

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  ┌────────────────────────────────────────────────────────┐                  │
│  │ 感知层：CRAS快通道                                      │                  │
│  │                                                         │                  │
│  │  消息钩子 → interaction.message.received                │                  │
│  │      ↓                                                  │                  │
│  │  bus.consume(type_filter, since:5min)                   │                  │
│  │      ↓                                                  │                  │
│  │  提取用户消息文本 → 传递给认知层                         │                  │
│  │                                                         │                  │
│  │  ★ 感知层只做数据采集，不做意图判断                      │                  │
│  └───────────────────────┬─────────────────────────────────┘                  │
│                          │ 用户消息                                           │
│  ┌───────────────────────▼─────────────────────────────────┐                  │
│  │ 认知层：LLM + 意图注册表                                 │                  │
│  │                                                         │                  │
│  │  intent-registry.json 注入 Prompt 上下文                │                  │
│  │      ↓                                                  │                  │
│  │  LLM（Opus/GLM-5）推理：                                │                  │
│  │    IC1 情绪识别 → 情绪词典+LLM情感分析                  │                  │
│  │    IC2 规则触发 → 注册表examples匹配                    │                  │
│  │    IC3 复杂意图 → 标记pending（不在快通道解决）           │                  │
│  │    IC4 隐含意图 → LLM推理+置信度门控                    │                  │
│  │    IC5 多意图   → LLM拆分                               │                  │
│  │      ↓                                                  │                  │
│  │  输出：结构化意图判定 [{intent_id, confidence, ...}]     │                  │
│  │                                                         │                  │
│  │  ★ 认知层做推理和判断，不做数据采集也不做执行            │                  │
│  └───────────────────────┬─────────────────────────────────┘                  │
│                          │ 结构化意图事件                                     │
│  ┌───────────────────────▼─────────────────────────────────┐                  │
│  │ 执行层：事件emit + AEO治理                               │                  │
│  │                                                         │                  │
│  │  路径A（已注册意图）：                                    │                  │
│  │    bus.emit(mapped_event) → Dispatcher路由 → ISC handler│                  │
│  │    如 file_request → R73 handler → message发送文件       │                  │
│  │                                                         │                  │
│  │  路径B（未知意图）：                                      │                  │
│  │    bus.emit(intent.unknown.discovered) → AEO消费         │                  │
│  │    AEO 每周执行：向量聚类 → LLM分类 → MECE → 用户确认  │                  │
│  │    → 注册到 intent-registry.json                        │                  │
│  │                                                         │                  │
│  │  路径C（意图生命周期治理）：                               │                  │
│  │    AEO 定期扫描 → 低频降级 → 90天废弃 → 退役清理         │                  │
│  │                                                         │                  │
│  │  ★ 执行层只按决策执行，不做推理判断                      │                  │
│  └──────────────────────────────────────────────────────────┘                  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 0.4 三层归属检查清单（新设计准入门禁）

> 未来每个新设计（新规则、新技能、新子系统）必须通过以下检查才允许进入实施。

| 检查项 | 通过标准 | 不通过的典型症状 |
|--------|---------|----------------|
| **感知层明确** | 能回答"数据从哪来？什么探针/钩子/扫描器在观察？" | "数据来源待定"、"先跑起来再说" |
| **认知层明确** | 能回答"谁做判断？什么引擎/算法/规则在推理？" | 判断逻辑散布在多个组件中、感知和判断混在同一函数 |
| **执行层明确** | 能回答"谁行动？什么handler/技能/DTO任务在执行？" | "由Agent自行决定怎么做"、执行逻辑嵌入认知层 |
| **感知-认知解耦** | 感知层通过事件总线传递数据，不直接调用认知层函数 | 探针里嵌入了if-else判断逻辑 |
| **认知-执行解耦** | 认知层通过Dispatcher路由到handler，不直接调用执行代码 | handler里嵌入了推理/评估逻辑 |
| **执行-感知闭环** | 执行完成后emit结果事件，形成反馈循环 | 执行完成后不emit事件（开环，无法追踪） |

**三层归属标注模板**（新设计文档必须包含）：

```markdown
### [子系统名称] 三层归属

| 层 | 组件 | 输入 | 输出 |
|----|------|------|------|
| 感知 | [探针/钩子名称] | [数据源] | [事件类型] |
| 认知 | [引擎/算法名称] | [消费的事件] | [决策/判断结果] |
| 执行 | [handler/技能名称] | [决策] | [操作结果 + 结果事件] |
```

### 0.5 三层原则与五层事件模型的关系

> 三层（感知-认知-执行）和五层（L1-L5）是正交的两个维度。不要混淆。

```
            感知层        认知层        执行层
         ┌──────────┬──────────┬──────────┐
  L1     │ git-hook │ 条件评估  │ ISC handler│
  L2     │ scanner  │ 阈值比对  │ ISC handler│
  L3     │ CRAS探针 │ LLM推理   │ 意图handler│
  L4     │ 知识探针 │ 价值评估  │ 适配executor│
  L5     │ 模式分析 │ 根因分析  │ 重构executor│
  META   │ 进化检测 │ 凌霄阁   │ 进化executor│
         └──────────┴──────────┴──────────┘
```

- **五层**回答"事件从哪里来？"（信号源分类）
- **三层**回答"事件被谁处理？"（处理流程分工）
- 每个五层事件在被处理时，都走过完整的三层流程：感知→认知→执行
- 五层是**纵轴**（信号空间），三层是**横轴**（处理流水线）

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
| **探针位置** | `infrastructure/scanners/*.js`（组合扫描器） |
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
| **探针位置** | `infrastructure/scanners/pattern-analyzer.js`（新建） |
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
| **探针位置** | `infrastructure/scanners/evolution-detector.js`（新建） |
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

// ═══════════════════════════════════════════════════════════════════
// 以下12个判断函数 — v4.3补齐，消除推导算法黑箱
// 每个函数基于规则JSON的字段结构做确定性判断
// ═══════════════════════════════════════════════════════════════════

/**
 * 规则JSON结构约定（所有判断函数的输入）:
 * {
 *   rule_id: "R01",
 *   name: "ISC格式统一",
 *   domain: "isc",            // 一级域（isc/skill/quality/security/...）
 *   object: "rule",           // 被治理的对象
 *   description: "...",       // 自然语言描述
 *   severity: "high",         // critical/high/medium/low
 *   tags: ["format", "compliance"],  // 标签集
 *   trigger: { events: {...}, condition: {...}, sweep: {...} },
 *   action: { type: "validate", handler: "...", on_failure: "warn" },
 *   metadata: { involves_user: false, has_threshold: true, ... }
 * }
 */

// ─── L1 判断函数 ───────────────────────────────────────────

/**
 * 判断规则是否治理对象生命周期（CRUD操作）
 * 判断标准：
 *   1. 规则的action.type包含validate/enforce/auto_fix（对对象施加操作）
 *   2. 规则的domain+object对应一个被管理实体（非纯度量）
 *   3. 排除：纯阈值驱动规则（R04/R07/R09/R34/R61）无对象生命周期
 */
function ruleGovernsObjectLifecycle(rule) {
  // 硬排除：已确认无L1事件的5条规则
  const noLifecycleRules = new Set(['R04', 'R07', 'R09', 'R34', 'R61']);
  if (noLifecycleRules.has(rule.rule_id)) return false;

  // 规则管理的对象存在可被创建/修改/删除的实体
  const manageableObjects = [
    'rule', 'skill', 'md', 'config', 'task', 'evaluation',
    'report', 'message', 'knowledge', 'memory', 'plan',
    'pipeline', 'decision', 'design', 'file', 'apikey',
    'cron', 'subagent', 'capability_anchor'
  ];
  const ruleObject = (rule.object || '').toLowerCase();
  if (manageableObjects.some(obj => ruleObject.includes(obj))) return true;

  // 兜底：action.type为validate/enforce/auto_fix意味着对实体施加操作
  const actionType = (rule.action?.type || '').toLowerCase();
  if (['validate', 'enforce', 'auto_fix', 'pipeline'].includes(actionType)) return true;

  return false;
}

/**
 * 判断规则是否治理对象删除
 * 判断标准：描述或tags中包含删除/清理/废弃/移除相关语义
 */
function ruleGovernsObjectDeletion(rule) {
  const deletionKeywords = [
    '删除', '清理', '废弃', '移除', '归档', '过期',
    'delete', 'remove', 'cleanup', 'archive', 'expire', 'purge'
  ];
  const searchText = `${rule.description || ''} ${(rule.tags || []).join(' ')}`.toLowerCase();
  return deletionKeywords.some(kw => searchText.includes(kw));
}

// ─── L2 判断函数 ───────────────────────────────────────────

/**
 * 判断规则是否包含可量化条件（阈值/计数/百分比）
 * 判断标准：
 *   1. trigger.condition中包含数值比较
 *   2. 描述中包含量化词汇（阈值/比率/频率/次数/分数）
 *   3. action.type为validate（隐含验证标准=量化条件）
 */
function hasQuantifiableCondition(rule) {
  // 检查trigger.condition是否包含数值表达式
  const conditionStr = JSON.stringify(rule.trigger?.condition || '');
  const quantPatterns = [
    /threshold/i, />=|<=|>|</,
    /\d+%/, /count/i, /rate/i, /score/i,
    /min_confidence/i, /frequency/i
  ];
  if (quantPatterns.some(p => p.test(conditionStr))) return true;

  // 检查描述中的量化词汇
  const quantKeywords = [
    '阈值', '比率', '频率', '次数', '分数', '百分比', '覆盖率',
    '准确率', '成功率', '错误率', '上限', '下限', '超过', '低于',
    'threshold', 'rate', 'count', 'score', 'percentage', 'limit'
  ];
  const descText = (rule.description || '').toLowerCase();
  if (quantKeywords.some(kw => descText.includes(kw))) return true;

  // 检查tags
  const quantTags = ['threshold', 'metric', 'quantitative', 'scoring'];
  if ((rule.tags || []).some(t => quantTags.includes(t.toLowerCase()))) return true;

  return false;
}

/**
 * 判断规则是否包含完整性检查（缺口/缺失检测）
 * 判断标准：规则检查"某些东西是否存在/完整"
 */
function hasCompletenessCheck(rule) {
  const completenessKeywords = [
    '缺失', '缺少', '不完整', '未覆盖', '遗漏', '空缺',
    '必须存在', '必须包含', '必须有', '强制', '必填',
    'missing', 'incomplete', 'gap', 'required', 'mandatory',
    'must have', 'must include', 'must exist'
  ];
  const searchText = `${rule.description || ''} ${rule.name || ''}`.toLowerCase();
  return completenessKeywords.some(kw => searchText.includes(kw));
}

/**
 * 判断规则是否包含验证标准（通过/不通过）
 * 判断标准：规则对对象施加合规性校验
 */
function hasValidationCriteria(rule) {
  // action.type为validate是最直接的信号
  if (rule.action?.type === 'validate') return true;

  const validationKeywords = [
    '校验', '验证', '合规', '规范', '格式', '标准',
    '命名', '质量', '安全', '权限', '准入', '准出',
    'validate', 'verify', 'comply', 'format', 'standard',
    'naming', 'quality', 'security', 'permission', 'gate'
  ];
  const searchText = `${rule.description || ''} ${(rule.tags || []).join(' ')}`.toLowerCase();
  return validationKeywords.some(kw => searchText.includes(kw));
}

// ─── L3 判断函数 ───────────────────────────────────────────

/**
 * 判断规则是否涉及用户交互/意图
 * 判断标准：
 *   1. 规则的触发源包含用户消息/对话
 *   2. 规则的domain涉及interaction/orchestration
 *   3. 描述中包含"用户"、"意图"、"请求"等交互词汇
 *   4. metadata.involves_user显式标记
 */
function ruleInvolvesUserInteraction(rule) {
  // 显式标记
  if (rule.metadata?.involves_user === true) return true;
  if (rule.metadata?.involves_user === false) return false;

  // domain级判断
  const interactiveDomains = ['interaction', 'orchestration'];
  if (interactiveDomains.includes(rule.domain)) return true;

  // 关键词检测
  const interactionKeywords = [
    '用户', '意图', '请求', '消息', '对话', '交互',
    '反馈', '情绪', '指令', '命令', '输入',
    'user', 'intent', 'request', 'message', 'conversation',
    'interaction', 'feedback', 'command', 'input'
  ];
  const searchText = `${rule.description || ''} ${rule.name || ''}`.toLowerCase();
  return interactionKeywords.some(kw => searchText.includes(kw));
}

/**
 * 判断规则是否涉及用户情绪
 * 判断标准：规则的应用场景包含用户满意度/不满/挫败感
 */
function ruleInvolvesUserSentiment(rule) {
  const sentimentKeywords = [
    '情绪', '满意', '不满', '挫败', '抱怨', '满足', '失望',
    '体验', '反馈质量', '用户感受',
    'sentiment', 'satisfaction', 'frustration', 'emotion',
    'user experience', 'feedback quality'
  ];
  const searchText = `${rule.description || ''} ${(rule.tags || []).join(' ')}`.toLowerCase();
  return sentimentKeywords.some(kw => searchText.includes(kw));
}

/**
 * 判断规则是否涉及对话模式（反复纠正、反复强调等）
 * 判断标准：规则关注对话层面的重复/模式/趋势
 */
function ruleInvolvesConversationPattern(rule) {
  const patternKeywords = [
    '反复', '重复', '多次', '持续', '模式', '趋势',
    '纠正', '强调', '教学', '偏好', '习惯',
    'recurring', 'repeated', 'pattern', 'trend',
    'correction', 'emphasis', 'preference'
  ];
  const searchText = `${rule.description || ''} ${(rule.tags || []).join(' ')}`.toLowerCase();

  // 额外条件：必须同时涉及用户交互
  const hasPattern = patternKeywords.some(kw => searchText.includes(kw));
  return hasPattern && ruleInvolvesUserInteraction(rule);
}

// ─── L4 判断函数 ───────────────────────────────────────────

/**
 * 判断规则是否可受外部知识驱动
 * 判断标准：
 *   1. 规则治理的领域存在外部最佳实践（安全/架构/文档/工具）
 *   2. 规则的验证标准可能随行业发展变化
 *   3. 排除：纯内部逻辑规则（ISC格式、DTO握手等）
 */
function ruleCouldBenefitFromExternalKnowledge(rule) {
  // 某些domain天然受外部知识驱动
  const knowledgeDrivenDomains = ['security', 'quality'];
  if (knowledgeDrivenDomains.includes(rule.domain)) return true;

  // 关键词检测：规则涉及可从外部学习的领域
  const knowledgeKeywords = [
    '最佳实践', '行业标准', '安全', '架构', '模式', '方法论',
    '工具', '框架', '技术选型', '性能优化', '模型',
    'best practice', 'standard', 'pattern', 'framework',
    'optimization', 'methodology', 'tool', 'model capability'
  ];
  const searchText = `${rule.description || ''} ${(rule.tags || []).join(' ')}`.toLowerCase();
  if (knowledgeKeywords.some(kw => searchText.includes(kw))) return true;

  // 规则涉及的对象有外部对标可能
  const externalizableObjects = [
    'documentation', 'naming', 'permission', 'api',
    'report', 'architecture', 'coordination'
  ];
  const ruleObject = (rule.object || '').toLowerCase();
  return externalizableObjects.some(obj => ruleObject.includes(obj));
}

// ─── L5 判断函数 ───────────────────────────────────────────

/**
 * 判断规则是否涉及错误处理/故障模式
 * 判断标准：规则的触发或执行与错误、失败、异常相关
 */
function ruleInvolvesErrorHandling(rule) {
  const errorKeywords = [
    '错误', '失败', '异常', '超时', '重试', '回退', '降级',
    '报警', '告警', '限流', '过期', '无效', '损坏',
    'error', 'failure', 'exception', 'timeout', 'retry',
    'fallback', 'degrade', 'alert', 'rate_limit', 'invalid'
  ];
  const searchText = `${rule.description || ''} ${rule.name || ''} ${(rule.tags || []).join(' ')}`.toLowerCase();
  if (errorKeywords.some(kw => searchText.includes(kw))) return true;

  // action.on_failure不是warn意味着规则关注失败场景
  const onFailure = rule.action?.on_failure || 'warn';
  return ['retry', 'escalate', 'reject'].includes(onFailure);
}

/**
 * 判断规则是否涉及质量检查
 * 判断标准：规则的目标是维护/提升某种质量指标
 */
function ruleInvolvesQuality(rule) {
  // domain为quality是最直接的信号
  if (rule.domain === 'quality') return true;

  const qualityKeywords = [
    '质量', '完整性', '一致性', '规范性', '覆盖率', '评分',
    '合规', '健康', '技术债', '代码质量', '文档质量',
    'quality', 'completeness', 'consistency', 'compliance',
    'coverage', 'health', 'tech debt', 'score'
  ];
  const searchText = `${rule.description || ''} ${(rule.tags || []).join(' ')}`.toLowerCase();
  return qualityKeywords.some(kw => searchText.includes(kw));
}

// ─── 辅助函数 ──────────────────────────────────────────────

/**
 * 提取规则的语义上下文（用于意图子类型推导）
 * 从规则的domain/object/description/tags综合推导语义类别
 */
function extractRuleContext(rule) {
  // 优先从metadata显式标记获取
  if (rule.metadata?.intent_context) return rule.metadata.intent_context;

  // 基于关键词的上下文推导映射
  const contextPatterns = [
    { keywords: ['文件', '发送', '交付', 'file', 'delivery', 'send'], context: 'file_delivery' },
    { keywords: ['视觉', '图片', '图像', 'vision', 'image', 'ocr'], context: 'vision' },
    { keywords: ['模型', '路由', '选择', 'model', 'routing', 'select'], context: 'model_routing' },
    { keywords: ['规则', '创建', '新增', 'rule', 'create'], context: 'rule_creation' },
    { keywords: ['技能化', '封装', 'skillif', 'skill creation'], context: 'skill_creation' },
    { keywords: ['评测', '评估', '测试', 'evaluat', 'benchmark', 'test'], context: 'evaluation' },
    { keywords: ['能力', '声明', '锚点', 'capability', 'declare', 'anchor'], context: 'capability_declaration' },
    { keywords: ['双语', '中英', 'bilingual', 'i18n'], context: 'bilingual' },
    { keywords: ['并行', '并发', 'parallel', 'concurrent'], context: 'parallel' },
    { keywords: ['优先级', 'priority', 'urgency'], context: 'priority' },
    { keywords: ['时间', '粒度', '计划', 'time', 'granularity', 'plan'], context: 'time_planning' },
    { keywords: ['审议', '议会', '评审', 'council', 'review', 'deliberat'], context: 'council_review' }
  ];

  const searchText = `${rule.description || ''} ${rule.name || ''} ${(rule.tags || []).join(' ')}`.toLowerCase();

  for (const { keywords, context } of contextPatterns) {
    if (keywords.some(kw => searchText.includes(kw))) return context;
  }

  // 兜底：用domain_object作为上下文
  return `${rule.domain || 'unknown'}_${rule.object || 'general'}`;
}

/**
 * 推导情绪子类型
 */
function deriveSentimentSubtype(rule) {
  const sentimentPatterns = [
    { keywords: ['挫败', 'frustrat'], subtype: 'frustration' },
    { keywords: ['满意', 'satisf'], subtype: 'satisfaction' },
    { keywords: ['文档质量', 'doc quality'], subtype: 'doc_quality' },
    { keywords: ['信息过载', 'overload'], subtype: 'info_overload' }
  ];
  const searchText = `${rule.description || ''} ${(rule.tags || []).join(' ')}`.toLowerCase();
  for (const { keywords, subtype } of sentimentPatterns) {
    if (keywords.some(kw => searchText.includes(kw))) return subtype;
  }
  return 'general';
}
```

> **v4.3关键修复**：以上12个判断函数 + 2个辅助函数，从v4.1/v4.2的"调用签名无函数体"升级为完整的确定性实现。每个函数基于规则JSON的字段结构做多维度关键词+结构检查，支撑`derive-events-v4.js`对3000+条规则的自动推导——不再依赖人工标注。
>
> **判断策略分层**：
> 1. **硬编码排除**（如`noLifecycleRules`）：对已确认的特例做精确处理
> 2. **结构性判断**（如`rule.action?.type === 'validate'`）：检查规则JSON的具体字段值
> 3. **关键词扫描**（如description/tags中的语义词汇）：覆盖长尾场景
> 4. **兜底策略**（如`extractRuleContext`的`domain_object`兜底）：确保不返回undefined

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
      "L3": ["user.intent.file_request.inferred"],
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

## 第四部分：70条规则五层事件拆解（v4.1修正）

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
| R06 | 重复错误检测 | `system.error.created` | `system.error.recurring.threshold_crossed` | `user.sentiment.frustration.shifted`（用户因错误不满） | — | `system.failure_pattern.pattern_emerged` ★核心 |
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
| R59 | 根因分析 | `dto.task.failed`, `pipeline.failed` | — | `user.sentiment.frustration.shifted` | `knowledge.debugging_technique.discovered` | `system.failure_pattern.pattern_emerged` ★核心 |
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

> **v4.1数据源修正**：v4.0假设CRAS可直接读取OpenClaw会话历史（`agents/*/sessions/`），但该路径从skill不可访问。v4.1改为**消息钩子+事件总线**方案：消息到达时通过钩子emit到events.jsonl，CRAS从事件总线消费，无需直接访问session存储。详见Part 8.5.1。

```
┌──────────────────────────────────────────────────────────────────────┐
│                     消息流（通过消息钩子捕获）                          │
│   user msg → message-hook emit → events.jsonl → CRAS消费            │
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

// 意图模式库（可扩展，v4.1语义细分）
const INTENT_PATTERNS = {
  file_request: {
    patterns: [/发.*源文件/, /发我.*md/, /发.*文件给我/, /源码.*发/],
    event_type: 'user.intent.file_request.inferred',
    payload_type: 'file_request'
  },
  vision_task: {
    patterns: [/分析.*图/, /看.*图片/, /图.*理解/, /OCR/],
    event_type: 'user.intent.vision_task.inferred',
    payload_type: 'vision_task'
  },
  frustration: {
    patterns: [/又.*错了/, /还是.*问题/, /怎么又/, /说了.*遍/, /不是.*意思/],
    event_type: 'user.sentiment.frustration.shifted',
    payload_type: 'frustration'
  },
  repeated_emphasis: {
    patterns: [/重点是/, /必须/, /一定要/, /关键/, /最重要/],
    event_type: 'user.intent.severity.emphasized',
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
  },
  rule_creation: {
    patterns: [/创建.*规则/, /新增.*规则/, /加.*规则/, /注册.*规则/],
    event_type: 'user.intent.rule_creation.inferred',
    payload_type: 'rule_creation'
  },
  skillification: {
    patterns: [/技能化/, /做成.*技能/, /封装.*技能/, /变成.*skill/],
    event_type: 'user.intent.skillification.inferred',
    payload_type: 'skillification'
  },
  evaluation: {
    patterns: [/评测/, /测试.*效果/, /跑个.*评估/, /benchmark/],
    event_type: 'user.intent.evaluation.inferred',
    payload_type: 'evaluation'
  },
  task_routing: {
    patterns: [/用.*模型/, /换.*模型/, /试试.*GLM/, /选.*模型/],
    event_type: 'user.intent.task_routing.inferred',
    payload_type: 'task_routing'
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
                confidence: 0.95, // 正则精确匹配 = 高置信度
                timestamp: msg.timestamp
              },
              metadata: {
                confidence: 0.95,
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

  aggregateCorrections(messages) {
    // 从消息中提取纠正信号（匹配纠正模式）
    const correctionPatterns = [/不对/, /不是这样/, /应该是/, /纠正/, /搞错了/, /说错了/, /改一下/];
    const corrections = [];
    const topicBuckets = {};

    for (const msg of messages) {
      if (msg.role !== 'user') continue;
      for (const pattern of correctionPatterns) {
        if (pattern.test(msg.content)) {
          // 提取纠正的关键词作为topic
          const topic = this.extractKeywords(msg.content)[0] || 'general';
          if (!topicBuckets[topic]) topicBuckets[topic] = [];
          topicBuckets[topic].push({
            topic,
            content: msg.content.substring(0, 200),
            timestamp: msg.timestamp
          });
          break;
        }
      }
    }

    // 同方向纠正 >= 2次才返回
    for (const [topic, items] of Object.entries(topicBuckets)) {
      if (items.length >= 2) {
        corrections.push(...items);
      }
    }
    return corrections;
  }

  aggregateTeachings(messages) {
    // 从消息中提取教学信号（用户在教Agent概念/方法）
    const teachingPatterns = [
      /你要理解/, /本质是/, /第一性原理/, /你想想/, /仔细想/,
      /记住/, /以后.*要/, /规则是/, /原则是/, /不要再.*了/
    ];
    const teachings = [];

    for (const msg of messages) {
      if (msg.role !== 'user') continue;
      for (const pattern of teachingPatterns) {
        if (pattern.test(msg.content)) {
          teachings.push({
            lesson: msg.content.substring(0, 300),
            timestamp: msg.timestamp,
            pattern: pattern.source
          });
          break;
        }
      }
    }
    return teachings;
  }

  identifyCapabilityGaps(messages) {
    // 从失败/人工介入消息中识别能力缺口
    // 检测模式：Agent说"我不确定"、"需要你确认"、用户说"我来做吧"、"你不会这个"
    const gapPatterns = {
      agent_uncertainty: [/我不确定/, /需要你确认/, /我无法/, /暂时不支持/],
      human_takeover: [/我来做/, /我自己来/, /算了/, /你不会/],
      repeated_failure: [/又失败了/, /还是不行/, /做不到/]
    };
    const gaps = {};

    for (const msg of messages) {
      for (const [gapType, patterns] of Object.entries(gapPatterns)) {
        for (const pattern of patterns) {
          if (pattern.test(msg.content)) {
            if (!gaps[gapType]) gaps[gapType] = { type: gapType, evidence: [], frequency: 0 };
            gaps[gapType].evidence.push(msg.content.substring(0, 100));
            gaps[gapType].frequency++;
            break;
          }
        }
      }
    }

    // 只返回出现>=2次的能力缺口
    return Object.values(gaps).filter(g => g.frequency >= 2);
  }

  extractKeywords(text) {
    // 基于停用词过滤 + 词频的简易关键词提取
    const stopWords = new Set([
      '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一',
      '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
      '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '那',
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'to', 'of', 'and', 'in', 'that', 'for', 'it', 'with'
    ]);
    
    // 中文分词简化：按标点和空格分割，取2-6字的词段
    const segments = text.replace(/[，。！？、；：""''（）\[\]{}【】\s]+/g, ' ').split(' ');
    const wordFreq = {};
    
    for (const seg of segments) {
      const word = seg.trim().toLowerCase();
      if (word.length < 2 || word.length > 20 || stopWords.has(word)) continue;
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
    
    // 按频率降序返回top-5关键词
    return Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  avgSentiment(messages) {
    // 基于情绪词典计算平均情绪分（-1 到 +1）
    const negativeWords = ['又', '还是', '错', '问题', '不是', '搞错', '失望', '不行', '糟糕', '烦', '差'];
    const positiveWords = ['好', '棒', '不错', '完美', '赞', '可以', '优秀', '满意', '感谢', '太好了'];
    
    let totalScore = 0;
    let count = 0;
    
    for (const msg of messages) {
      if (msg.role !== 'user') continue;
      let score = 0;
      for (const w of negativeWords) {
        if (msg.content.includes(w)) score -= 0.2;
      }
      for (const w of positiveWords) {
        if (msg.content.includes(w)) score += 0.2;
      }
      // clamp to [-1, 1]
      totalScore += Math.max(-1, Math.min(1, score));
      count++;
    }
    
    return count === 0 ? 0 : totalScore / count;
  }
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
CRAS快通道 emit user.intent.{具体意图}.inferred (如 user.intent.file_request.inferred)
    → 事件总线 (bus.emit)
    → dispatcher 消费事件
    → 匹配 routes.json 中的 user.intent.* 通配路由
    → 精确路由到对应ISC规则的handler
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

## 第五·一部分：意图-事件识别与映射体系（轻量版）★v4.3新增

> **定位**：本章补全L3层的核心运行机制——**从对话中识别意图，并映射为结构化事件**。
> **现阶段原则**：云端长期有更好方案，本地不过度复杂。**不做RAG增强，不做嵌入模型微调。**
> **架构归属**：意图识别（推理、分类、emit）= **CRAS职责**；意图类型的自主增加、优化、废弃、MECE治理、评测 = **AEO职责**。这两者不是独立模块，而是各自体系中的一个功能面。

### 5A.1 架构概览

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    意图-事件识别与映射体系                                     │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐         │
│  │  CRAS（识别引擎）                                                │         │
│  │                                                                  │         │
│  │  引擎 = LLM（Opus）本身                                         │         │
│  │  不是单独的分类模型，不是正则匹配                                  │         │
│  │                                                                  │         │
│  │  ┌──────────────┐      ┌────────────────┐                       │         │
│  │  │ 意图注册表    │ ───▶ │  扫描Prompt    │                       │         │
│  │  │ intent-      │ 注入  │  (Opus上下文)  │                       │         │
│  │  │ registry.json│      └───────┬────────┘                       │         │
│  │  └──────────────┘              │                                 │         │
│  │                                ▼                                 │         │
│  │  快通道（5min增量扫描）──── LLM推理 ──── 结构化意图事件           │         │
│  │                                              │                   │         │
│  │                                              ▼                   │         │
│  │                                        事件总线                   │         │
│  │                                        bus.emit()                │         │
│  └──────────────────────────────────────────────────────────────────┘         │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐         │
│  │  AEO（意图治理）                                                 │         │
│  │                                                                  │         │
│  │  未知意图发现 ─── 向量聚类 ─── LLM分类 ─── MECE校验             │         │
│  │       │                                         │                │         │
│  │       ▼                                         ▼                │         │
│  │  候选意图 ──── 用户确认 ──── 注册到 intent-registry.json         │         │
│  │                                                                  │         │
│  │  低频废弃 ─── 30天<3次降级 ─── 90天未触发废弃                    │         │
│  │                                                                  │         │
│  │  变更准出 ─── 黄金评测集 ─── 自动化报告 ─── Badcase根因          │         │
│  └──────────────────────────────────────────────────────────────────┘         │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**关键架构决策**：
- **CRAS不维护意图类型表**——它只消费`intent-registry.json`并执行识别
- **AEO不做实时识别**——它只管理意图类型的生命周期（增/改/废/评测）
- **二者通过`intent-registry.json`解耦**：AEO写入，CRAS读取

### 5A.2 五类意图收敛模型

> **用户明确指定**：五种，不多不少。这是意图空间的MECE穷尽分类。

| 类型ID | 类型名称 | 定义 | 识别难度 | 识别策略 |
|--------|---------|------|---------|---------|
| **IC1** | 正负向情绪意图 | 用户通过情绪表达传递的隐含诉求（满意→保持、不满→改变、焦虑→加速） | 低 | 情绪词典 + LLM情感分析 |
| **IC2** | 规则触发意图 | 已在ISC规则中定义的、可直接映射到handler的明确意图（如"发MD源文件"→R73） | 低 | intent-registry精确匹配（正则+LLM） |
| **IC3** | 复杂意图 | 需要5轮以上上下文推理才能收敛的意图（用户逐步修正、补充、澄清） | 高 | LLM多轮上下文窗口分析 |
| **IC4** | 隐含意图 | 用户未明确表达但可推理得出的意图（如"这个文档太长了"→隐含"帮我总结"） | 高 | LLM推理 + 置信度门控 |
| **IC5** | 一句话多意图 | 单条消息包含多个独立意图（如"把报告发给我，顺便跑个评测"→file_request + evaluation） | 中 | LLM分解 + 多事件emit |

#### 五类的MECE性证明

| 维度 | 互斥性证明 |
|------|-----------|
| IC1 vs IC2 | IC1是情绪驱动（无具体行动指令），IC2是行动驱动（有明确行动映射） |
| IC2 vs IC3 | IC2一次可识别（单消息→单规则），IC3需多轮才能收敛 |
| IC3 vs IC4 | IC3是用户逐步明确表达的，IC4是用户始终未明确表达的 |
| IC4 vs IC1 | IC4是认知推理（"言外之意"），IC1是情感感知（"言中之情"） |
| IC5 vs 其他 | IC5是数量维度（1→N），其他是性质维度（每个独立意图仍归属IC1-IC4） |

**穷尽性**：用户的任何一条消息，其中的每个意图要么有明确情绪（IC1）、要么可直接映射到规则（IC2）、要么需要多轮澄清（IC3）、要么是隐含的（IC4）。如果一条消息包含多个意图，那它还属于IC5。五类穷尽。

### 5A.3 意图注册表（intent-registry.json）

**文件位置**：`infrastructure/event-bus/intent-registry.json`
**所有权**：AEO负责写入和维护，CRAS只读消费

```json
{
  "$schema": "intent-registry-v1",
  "version": "2026-03-04T22:00:00Z",
  "intents": [
    {
      "intent_id": "file_request",
      "category": "IC2",
      "display_name": "文件请求意图",
      "description": "用户请求发送某个文件的原始内容（MD源文件、配置文件等）",
      "examples": [
        "发MD源文件",
        "把这个文件发给我",
        "源码发一下",
        "发我设计文档的源文件"
      ],
      "counter_examples": [
        "帮我写个文件",
        "创建一个新文件",
        "这个文件质量怎么样"
      ],
      "mapped_event": "user.intent.file_request.inferred",
      "mapped_rules": ["R73"],
      "confidence_threshold": 0.7,
      "status": "active",
      "created": "2026-02-15",
      "last_triggered": "2026-03-04",
      "trigger_count_30d": 12,
      "owner": "aeo"
    },
    {
      "intent_id": "vision_task",
      "category": "IC2",
      "display_name": "视觉任务意图",
      "description": "用户请求分析/理解图片内容",
      "examples": [
        "分析这张图",
        "看看这个图片",
        "OCR一下",
        "图片里写了什么"
      ],
      "counter_examples": [
        "帮我画个图",
        "生成一张图片"
      ],
      "mapped_event": "user.intent.vision_task.inferred",
      "mapped_rules": ["R76"],
      "confidence_threshold": 0.7,
      "status": "active",
      "created": "2026-02-15",
      "last_triggered": "2026-03-04",
      "trigger_count_30d": 8,
      "owner": "aeo"
    },
    {
      "intent_id": "frustration",
      "category": "IC1",
      "display_name": "挫败情绪",
      "description": "用户对Agent表现不满、反复纠正、表达失望",
      "examples": [
        "又错了",
        "说了多少遍了",
        "不是这个意思",
        "怎么又这样"
      ],
      "counter_examples": [
        "这个错误是什么意思",
        "帮我查下这个error"
      ],
      "mapped_event": "user.sentiment.frustration.shifted",
      "mapped_rules": ["R06", "R51"],
      "confidence_threshold": 0.6,
      "status": "active",
      "created": "2026-02-20",
      "last_triggered": "2026-03-03",
      "trigger_count_30d": 5,
      "owner": "aeo"
    }
  ],

  "categories": {
    "IC1": { "name": "正负向情绪意图", "description": "情绪驱动的隐含诉求" },
    "IC2": { "name": "规则触发意图", "description": "可直接映射到ISC规则handler的明确意图" },
    "IC3": { "name": "复杂意图", "description": "需5+轮上下文推理的意图" },
    "IC4": { "name": "隐含意图", "description": "未明确表达但可推理的意图" },
    "IC5": { "name": "一句话多意图", "description": "单消息包含多个独立意图" }
  },

  "governance": {
    "dormancy_days": 30,
    "dormancy_min_triggers": 3,
    "deprecation_days": 90,
    "mece_check_required": true,
    "aeo_approval_required": true
  }
}
```

**注册表字段说明**：

| 字段 | 用途 | 谁写 |
|------|------|------|
| `examples` / `counter_examples` | 注入到CRAS扫描prompt，作为few-shot示例 | AEO维护 |
| `mapped_event` | 识别成功后emit的事件类型 | AEO定义 |
| `mapped_rules` | 该意图对应的ISC规则（用于闭环验证） | AEO定义 |
| `confidence_threshold` | 该意图的最低置信度门控（低于此值不emit） | AEO调优 |
| `trigger_count_30d` | 30天内触发次数（CRAS回写，AEO用于治理决策） | CRAS回写 |
| `status` | active/dormant/deprecated/retired | AEO管理 |

### 5A.4 CRAS识别引擎（引擎=LLM本身）

> **核心设计**：引擎不是一个单独的分类模型或正则引擎——引擎就是LLM（Opus）本身。CRAS快通道（5min增量扫描）将intent-registry.json注入prompt上下文，让LLM做意图推理。

#### 5A.4.1 扫描Prompt模板

```javascript
// skills/cras/intent-scanner.js — CRAS意图识别引擎 ★v4.3新建

const bus = require('../../infrastructure/event-bus/bus.js');
const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '../../infrastructure/event-bus/intent-registry.json');
const PROBE_ID = 'cras-intent-scanner';

class IntentScanner {
  constructor() {
    this._registry = null;
    this._registryMtime = 0;
  }

  /**
   * 加载意图注册表（热重载）
   */
  getRegistry() {
    try {
      const stat = fs.statSync(REGISTRY_PATH);
      if (stat.mtimeMs > this._registryMtime) {
        this._registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
        this._registryMtime = stat.mtimeMs;
      }
    } catch (e) {
      if (!this._registry) this._registry = { intents: [] };
    }
    return this._registry;
  }

  /**
   * 构造扫描prompt：将intent-registry注入上下文
   * @param {Array} messages — 最近5分钟的用户消息
   * @returns {string} — 完整的扫描prompt
   */
  buildScanPrompt(messages) {
    const registry = this.getRegistry();
    const activeIntents = registry.intents.filter(i => i.status === 'active');

    // ─── System Prompt ───
    const systemPrompt = `你是一个意图识别引擎。分析用户消息，识别其中的意图。

## 已注册意图类型

${activeIntents.map(intent => `### ${intent.intent_id}（${intent.category}）
描述: ${intent.description}
示例: ${intent.examples.slice(0, 3).map(e => `"${e}"`).join(', ')}
反例: ${(intent.counter_examples || []).slice(0, 2).map(e => `"${e}"`).join(', ')}
`).join('\n')}

## 意图分类规则

1. **IC1 正负向情绪意图**: 用户通过情绪传递诉求（满意/不满/焦虑/挫败）
2. **IC2 规则触发意图**: 可直接映射到已注册意图的明确行动请求
3. **IC3 复杂意图**: 需要多轮上下文才能理解的意图（本次仅标记，不做推导）
4. **IC4 隐含意图**: 言外之意——用户没直接说但可以推理出的意图
5. **IC5 一句话多意图**: 一条消息包含多个独立意图，拆分输出

## 输出格式

对每条消息，输出JSON数组（可能多个意图）:
\`\`\`json
[
  {
    "message_index": 0,
    "intent_id": "已注册的intent_id 或 'unknown_需简短描述'",
    "category": "IC1|IC2|IC3|IC4|IC5",
    "confidence": 0.0-1.0,
    "reasoning": "一句话说明为什么判断为该意图"
  }
]
\`\`\`

如果消息不包含任何可识别的意图，返回空数组 \`[]\`。
对于IC3（复杂意图），仅标记 intent_id="complex_pending"，不做推导。
对于未注册的意图，使用 "unknown_" 前缀 + 简短描述（如 "unknown_code_review"）。
置信度低于0.5的意图不输出。`;

    // ─── User Messages ───
    const userContent = messages.map((msg, i) =>
      `[消息${i}] ${msg.content_excerpt || msg.content || ''}`
    ).join('\n\n');

    return { systemPrompt, userContent };
  }

  /**
   * 执行意图识别扫描
   * 由CRAS快通道（5min cron）调用
   * @param {Array} recentMessages — 最近5分钟的用户消息事件
   */
  async scan(recentMessages) {
    if (recentMessages.length === 0) return [];

    const userMessages = recentMessages.filter(m =>
      m.payload?.role === 'user' || m.role === 'user'
    );
    if (userMessages.length === 0) return [];

    const { systemPrompt, userContent } = this.buildScanPrompt(userMessages);
    const registry = this.getRegistry();
    const emittedEvents = [];

    // ─── 调用LLM（Opus）做意图推理 ───
    // 在CRAS快通道的cron任务中，通过sessions_spawn调用主Agent做推理
    // 或直接使用本地GLM-5做轻量分类（降低成本）
    let intentResults;
    try {
      intentResults = await this.callLLM(systemPrompt, userContent);
    } catch (e) {
      console.error(`Intent scan LLM call failed: ${e.message}`);
      // 降级：使用正则匹配（Part 5.2 FastChannel的INTENT_PATTERNS）
      return this.regexFallback(userMessages);
    }

    // ─── 处理识别结果 ───
    for (const result of intentResults) {
      const msg = userMessages[result.message_index];
      if (!msg) continue;

      // 查找注册表中的意图配置
      const intentConfig = registry.intents.find(i => i.intent_id === result.intent_id);

      // 置信度门控
      const threshold = intentConfig?.confidence_threshold || 0.6;
      if (result.confidence < threshold) continue;

      if (intentConfig && intentConfig.status === 'active') {
        // ─── 已注册意图：emit映射的事件 ───
        const event = bus.emit(intentConfig.mapped_event, {
          intent_id: result.intent_id,
          category: result.category,
          confidence: result.confidence,
          reasoning: result.reasoning,
          message_id: msg.payload?.message_id || msg.id,
          message_excerpt: (msg.payload?.content_excerpt || msg.content || '').substring(0, 200),
          timestamp: msg.timestamp || Date.now()
        }, PROBE_ID);

        emittedEvents.push(event);

        // 更新触发计数（CRAS回写到registry供AEO治理用）
        this.incrementTriggerCount(result.intent_id);

      } else if (result.intent_id.startsWith('unknown_')) {
        // ─── 未知意图：emit发现事件，供AEO消费 ───
        bus.emit('intent.unknown.discovered', {
          suggested_id: result.intent_id,
          category: result.category,
          confidence: result.confidence,
          reasoning: result.reasoning,
          message_excerpt: (msg.payload?.content_excerpt || msg.content || '').substring(0, 200),
          timestamp: Date.now()
        }, PROBE_ID);

        emittedEvents.push({ type: 'intent.unknown.discovered' });

      } else if (result.intent_id === 'complex_pending') {
        // ─── 复杂意图（IC3）：标记但不处理 ───
        bus.emit('intent.complex.flagged', {
          category: 'IC3',
          confidence: result.confidence,
          reasoning: result.reasoning,
          message_excerpt: (msg.payload?.content_excerpt || msg.content || '').substring(0, 200),
          requires_context_rounds: '5+',
          timestamp: Date.now()
        }, PROBE_ID);
      }
    }

    return emittedEvents;
  }

  /**
   * 调用LLM做意图推理
   * 实际实现依赖可用的LLM调用方式（GLM-5 for cost, Opus for accuracy）
   */
  async callLLM(systemPrompt, userContent) {
    // 策略：先尝试GLM-5（低成本），失败/低置信度时escalate到Opus
    // GLM-5调用通过skills/glm-5-coder的API
    const { execSync } = require('child_process');

    try {
      const prompt = JSON.stringify({
        system: systemPrompt,
        user: `分析以下用户消息的意图:\n\n${userContent}`
      });

      // 写入临时文件避免命令行转义问题
      const tmpFile = '/tmp/intent-scan-prompt.json';
      fs.writeFileSync(tmpFile, prompt);

      const result = execSync(
        `node /root/.openclaw/workspace/skills/glm-5-coder/index.cjs --intent-scan ${tmpFile}`,
        { encoding: 'utf8', timeout: 30000 }
      );

      return JSON.parse(result.trim());
    } catch (e) {
      console.error(`GLM-5 intent scan failed, trying regex fallback: ${e.message}`);
      throw e; // 让调用者执行降级
    }
  }

  /**
   * 正则降级：当LLM不可用时，使用Part 5.2的INTENT_PATTERNS做匹配
   */
  regexFallback(messages) {
    const { INTENT_PATTERNS } = require('./conversation-probe.js');
    const events = [];
    for (const msg of messages) {
      const content = msg.payload?.content_excerpt || msg.content || '';
      for (const [, config] of Object.entries(INTENT_PATTERNS)) {
        for (const pattern of config.patterns) {
          if (pattern.test(content)) {
            bus.emit(config.event_type, {
              intent_type: config.payload_type,
              confidence: 0.95,
              source: 'regex_fallback',
              message_excerpt: content.substring(0, 200),
              timestamp: Date.now()
            }, PROBE_ID);
            events.push({ type: config.event_type });
            break;
          }
        }
      }
    }
    return events;
  }

  /**
   * 更新意图触发计数（CRAS → intent-registry.json）
   * 节流：每5分钟最多写一次，批量更新
   */
  incrementTriggerCount(intentId) {
    const countsFile = path.join(__dirname, '.intent-trigger-counts.json');
    let counts = {};
    try {
      counts = JSON.parse(fs.readFileSync(countsFile, 'utf8'));
    } catch (_) { /* first run */ }

    counts[intentId] = (counts[intentId] || 0) + 1;
    fs.writeFileSync(countsFile, JSON.stringify(counts));

    // 实际同步到registry由AEO治理流程完成（不在识别引擎中修改registry）
  }
}

module.exports = { IntentScanner };
```

#### 5A.4.2 快通道集成

CRAS快通道（Part 5.2）升级为调用IntentScanner：

```javascript
// skills/cras/conversation-probe.js — 快通道升级 ★v4.3

const { IntentScanner } = require('./intent-scanner.js');
const scanner = new IntentScanner();

class FastChannel {
  async scan() {
    // 从事件总线消费最近5分钟的消息事件
    const recentMessages = bus.consume('cras-fast-channel', {
      type_filter: 'interaction.message.received',
      since: Date.now() - 5 * 60 * 1000
    });

    if (recentMessages.length === 0) return [];

    // ─── Phase 1: LLM意图识别（主路径） ───
    const intentEvents = await scanner.scan(recentMessages);

    // ─── Phase 2: 正则补充（LLM可能遗漏的高频简单意图） ───
    // 正则匹配作为LLM的补充而非替代——两者结果取并集，去重
    const regexEvents = this.regexScan(recentMessages);

    // 合并去重（同一消息同一意图不重复emit）
    return this.deduplicateEvents(intentEvents, regexEvents);
  }
}
```

### 5A.5 AEO意图治理（未知意图发现流程）

> **关键架构归属**：未知意图发现流程的执行主体是AEO，不是独立的定时任务。AEO负责意图类型的完整生命周期。

#### 5A.5.1 未知意图发现流程（AEO驱动）

```
┌───────────────────────────────────────────────────────────────────────┐
│              AEO 未知意图发现流程（每周执行）                           │
│              执行主体: AEO评测体系，不是独立cron                        │
│                                                                       │
│  Step 1: 向量聚类                                                     │
│  ├── 数据源: 过去7天的 intent.unknown.discovered 事件                 │
│  │         + 过去7天未命中任何意图的用户消息                           │
│  ├── 工具: 智谱Embedding API（zhipu-embedding-3）                    │
│  ├── 方法: 对消息文本做embedding → DBSCAN聚类（eps=0.3, minPts=3）   │
│  └── 输出: 聚类结果（每个cluster = 一个候选意图模式）                  │
│                                                                       │
│  Step 2: LLM意图分类                                                  │
│  ├── 输入: 每个cluster的top-5代表性消息                               │
│  ├── Prompt: "这组消息表达了什么共同意图？给出intent_id和description" │
│  ├── 输出: 候选意图列表 [{intent_id, description, category, examples}]│
│  └── 过滤: cluster_size < 3 的丢弃（低频噪音）                       │
│                                                                       │
│  Step 3: MECE校验                                                     │
│  ├── 对每个候选意图，检查:                                            │
│  │   1. 与现有active意图的语义相似度 < 0.7（不重叠）                  │
│  │   2. 不是现有意图的子集或超集                                      │
│  │   3. 归属于IC1-IC5中的某一类                                       │
│  ├── 重叠检测: 用intent-registry中每个active意图的examples做embedding │
│  │   对比候选意图examples的embedding，余弦相似度 > 0.7 = 重叠         │
│  └── 重叠处理: 与现有意图合并（扩展examples），而非新建               │
│                                                                       │
│  Step 4: 用户确认                                                     │
│  ├── 生成飞书卡片:                                                    │
│  │   "发现3个候选意图，是否注册？"                                    │
│  │   - [意图A] 描述 + 3个示例 + 归属类别 → [注册] [忽略] [合并到X]   │
│  │   - [意图B] ...                                                    │
│  ├── 用户决策:                                                        │
│  │   ├── 注册: AEO写入intent-registry.json，status=active            │
│  │   ├── 忽略: 记录到ignore列表，后续不再提议                        │
│  │   └── 合并: 将examples合并到指定的现有意图                        │
│  └── 无用户响应48h: 自动归档，不注册                                  │
│                                                                       │
│  Step 5: AEO准出门禁                                                  │
│  ├── 新注册的意图必须通过AEO评测:                                     │
│  │   1. 黄金评测集: ≥10条标注消息（5正例+5反例）                      │
│  │   2. 自动化准确率: 在评测集上准确率 ≥ 80%                          │
│  │   3. Badcase根因: 如果准确率 < 80%，分析失败case → 优化examples    │
│  ├── 通过 → 正式激活                                                  │
│  └── 未通过 → 优化后重测（最多3轮）→ 仍未通过 → 废弃                 │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

#### 5A.5.2 AEO治理事件定义

```
# AEO意图治理事件（新增）
aeo.intent.discovery_triggered        # AEO触发未知意图发现流程
aeo.intent.candidates_found           # 发现候选意图（含聚类结果）
aeo.intent.mece_validated             # MECE校验通过
aeo.intent.mece_rejected              # MECE校验失败（与现有意图重叠）
aeo.intent.user_approved              # 用户确认注册
aeo.intent.user_ignored               # 用户忽略
aeo.intent.user_merged                # 用户选择合并到现有意图
aeo.intent.evaluation_passed          # AEO评测通过
aeo.intent.evaluation_failed          # AEO评测未通过
aeo.intent.registered                 # 正式注册到intent-registry
aeo.intent.dormant                    # 意图降级为休眠
aeo.intent.deprecated                 # 意图废弃
aeo.intent.retired                    # 意图正式退役
```

#### 5A.5.3 AEO意图治理handler

```javascript
// infrastructure/dispatcher/handlers/aeo-intent-governance.js

const bus = require('../../event-bus/bus.js');
const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '../../event-bus/intent-registry.json');

class AEOIntentGovernance {

  /**
   * AEO周期性意图治理（由AEO评测体系调度，非独立cron）
   * 触发方式: AEO定期任务 → emit aeo.intent.discovery_triggered → 本handler
   */
  async handle(event) {
    if (event.type === 'aeo.intent.discovery_triggered') {
      return await this.runDiscoveryPipeline();
    }
    if (event.type === 'aeo.intent.user_approved') {
      return await this.registerIntent(event.payload);
    }
    if (event.type === 'aeo.intent.user_merged') {
      return await this.mergeIntent(event.payload);
    }
  }

  /**
   * Step 1-3: 向量聚类 → LLM分类 → MECE校验
   */
  async runDiscoveryPipeline() {
    // ─── Step 1: 收集未知意图事件 ───
    const unknownEvents = bus.consume('aeo-intent-discovery', {
      type_filter: 'intent.unknown.discovered',
      since: Date.now() - 7 * 24 * 60 * 60 * 1000  // 过去7天
    });

    if (unknownEvents.length < 3) {
      // 不够形成聚类，跳过本周期
      return { skipped: true, reason: 'insufficient_unknown_intents', count: unknownEvents.length };
    }

    // ─── Step 2: 向量聚类（智谱Embedding） ───
    const messages = unknownEvents.map(e => e.payload.message_excerpt);
    const clusters = await this.vectorCluster(messages);

    // ─── Step 3: LLM对聚类结果做意图分类 ───
    const candidates = [];
    for (const cluster of clusters) {
      if (cluster.size < 3) continue; // 低频噪音过滤

      const candidate = await this.classifyCluster(cluster);
      if (!candidate) continue;

      // ─── MECE校验 ───
      const meceResult = await this.meceCheck(candidate);
      if (meceResult.overlaps) {
        bus.emit('aeo.intent.mece_rejected', {
          candidate: candidate.intent_id,
          overlaps_with: meceResult.overlapping_intent,
          similarity: meceResult.similarity
        }, 'aeo-intent-governance');

        // 建议合并而非新建
        candidate.merge_suggestion = meceResult.overlapping_intent;
      } else {
        bus.emit('aeo.intent.mece_validated', {
          candidate: candidate.intent_id,
          category: candidate.category
        }, 'aeo-intent-governance');
      }

      candidates.push(candidate);
    }

    if (candidates.length > 0) {
      bus.emit('aeo.intent.candidates_found', {
        count: candidates.length,
        candidates: candidates.map(c => ({
          intent_id: c.intent_id,
          category: c.category,
          description: c.description,
          cluster_size: c.cluster_size,
          merge_suggestion: c.merge_suggestion || null
        }))
      }, 'aeo-intent-governance');

      // Step 4: 发飞书卡片请求用户确认（由AEO报告发送器处理）
    }

    return { candidates_found: candidates.length };
  }

  /**
   * 向量聚类（调用智谱Embedding API）
   */
  async vectorCluster(messages) {
    // 使用智谱 embedding-3 模型
    const embeddings = await this.getEmbeddings(messages);

    // DBSCAN聚类（轻量实现）
    return this.dbscan(embeddings, messages, {
      eps: 0.3,      // 余弦距离阈值
      minPts: 3      // 最小聚类点数
    });
  }

  async getEmbeddings(texts) {
    // 调用智谱Embedding API
    const keysFile = '/root/.openclaw/.secrets/zhipu-keys.env';
    const keys = fs.readFileSync(keysFile, 'utf8').split('\n').filter(l => l.trim());
    const apiKey = keys[0]?.split('=')[1]?.trim();

    if (!apiKey) throw new Error('No Zhipu API key available');

    const results = [];
    // 批量请求，每批最多25条
    for (let i = 0; i < texts.length; i += 25) {
      const batch = texts.slice(i, i + 25);
      const response = await fetch('https://open.bigmodel.cn/api/paas/v4/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'embedding-3',
          input: batch
        })
      });

      const data = await response.json();
      if (data.data) {
        results.push(...data.data.map(d => d.embedding));
      }
    }
    return results;
  }

  /**
   * DBSCAN聚类（轻量本地实现）
   */
  dbscan(embeddings, messages, { eps, minPts }) {
    const n = embeddings.length;
    const labels = new Array(n).fill(-1); // -1 = 未分类
    let clusterId = 0;

    for (let i = 0; i < n; i++) {
      if (labels[i] !== -1) continue;

      // 找邻居
      const neighbors = [];
      for (let j = 0; j < n; j++) {
        if (i !== j && this.cosineDistance(embeddings[i], embeddings[j]) <= eps) {
          neighbors.push(j);
        }
      }

      if (neighbors.length < minPts) continue; // 噪点

      // 扩展聚类
      labels[i] = clusterId;
      const queue = [...neighbors];
      while (queue.length > 0) {
        const q = queue.shift();
        if (labels[q] === -1 || labels[q] === undefined) {
          labels[q] = clusterId;

          const qNeighbors = [];
          for (let j = 0; j < n; j++) {
            if (q !== j && this.cosineDistance(embeddings[q], embeddings[j]) <= eps) {
              qNeighbors.push(j);
            }
          }
          if (qNeighbors.length >= minPts) {
            queue.push(...qNeighbors.filter(nn => labels[nn] === -1));
          }
        }
      }
      clusterId++;
    }

    // 组装聚类结果
    const clusters = {};
    for (let i = 0; i < n; i++) {
      if (labels[i] < 0) continue;
      if (!clusters[labels[i]]) clusters[labels[i]] = { id: labels[i], messages: [], size: 0 };
      clusters[labels[i]].messages.push(messages[i]);
      clusters[labels[i]].size++;
    }

    return Object.values(clusters);
  }

  cosineDistance(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const similarity = dot / (Math.sqrt(na) * Math.sqrt(nb));
    return 1 - similarity; // 余弦距离 = 1 - 余弦相似度
  }

  /**
   * MECE校验：候选意图不得与现有意图重叠
   */
  async meceCheck(candidate) {
    const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    const activeIntents = registry.intents.filter(i => i.status === 'active');

    // 对候选意图的examples和现有意图的examples做embedding比较
    const candidateText = [candidate.description, ...candidate.examples].join(' ');

    for (const existing of activeIntents) {
      const existingText = [existing.description, ...existing.examples].join(' ');

      // 使用TF-IDF相似度（零API成本，Part 8.10）
      const { semanticSimilarity } = require('../../event-bus/semantic-similarity.js');
      const similarity = semanticSimilarity(candidateText, existingText);

      if (similarity > 0.7) {
        return {
          overlaps: true,
          overlapping_intent: existing.intent_id,
          similarity
        };
      }
    }

    return { overlaps: false };
  }

  /**
   * 注册新意图到intent-registry.json
   * 前置条件: 用户已确认 + MECE通过 + AEO评测通过
   */
  async registerIntent(intentData) {
    const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));

    const newIntent = {
      intent_id: intentData.intent_id,
      category: intentData.category,
      display_name: intentData.display_name || intentData.intent_id,
      description: intentData.description,
      examples: intentData.examples || [],
      counter_examples: intentData.counter_examples || [],
      mapped_event: `user.intent.${intentData.intent_id}.inferred`,
      mapped_rules: intentData.mapped_rules || [],
      confidence_threshold: 0.7, // 新意图默认较高门控
      status: 'active',
      created: new Date().toISOString().split('T')[0],
      last_triggered: null,
      trigger_count_30d: 0,
      owner: 'aeo'
    };

    registry.intents.push(newIntent);
    registry.version = new Date().toISOString();
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));

    bus.emit('aeo.intent.registered', {
      intent_id: newIntent.intent_id,
      category: newIntent.category
    }, 'aeo-intent-governance');

    return { registered: true, intent: newIntent };
  }

  /**
   * 合并候选意图到现有意图
   */
  async mergeIntent({ candidate_id, target_intent_id, new_examples }) {
    const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    const target = registry.intents.find(i => i.intent_id === target_intent_id);
    if (!target) throw new Error(`Target intent ${target_intent_id} not found`);

    // 合并examples（去重）
    const existingSet = new Set(target.examples);
    for (const ex of (new_examples || [])) {
      if (!existingSet.has(ex)) {
        target.examples.push(ex);
      }
    }

    registry.version = new Date().toISOString();
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));

    bus.emit('aeo.intent.user_merged', {
      candidate_id,
      target_intent_id,
      new_examples_count: (new_examples || []).length
    }, 'aeo-intent-governance');
  }

  async classifyCluster(cluster) {
    // LLM对聚类代表消息做意图命名
    const topMessages = cluster.messages.slice(0, 5);
    // 实际调用LLM的prompt: "以下消息属于同一意图类别，请命名并描述"
    // 简化实现：从消息中提取高频关键词作为intent_id
    const keywords = this.extractClusterKeywords(topMessages);
    if (!keywords) return null;

    return {
      intent_id: keywords.id,
      category: 'IC2', // 默认归为规则触发类，MECE校验可能修改
      description: keywords.description,
      examples: topMessages.slice(0, 5),
      cluster_size: cluster.size
    };
  }

  extractClusterKeywords(messages) {
    // 从聚类消息中提取共同关键词
    const allWords = {};
    for (const msg of messages) {
      const words = msg.replace(/[^\w\u4e00-\u9fff]/g, ' ').split(/\s+/).filter(w => w.length >= 2);
      for (const w of words) {
        allWords[w] = (allWords[w] || 0) + 1;
      }
    }
    // 取出现在 >= 50% 消息中的关键词
    const threshold = Math.ceil(messages.length * 0.5);
    const common = Object.entries(allWords)
      .filter(([, c]) => c >= threshold)
      .sort((a, b) => b[1] - a[1]);

    if (common.length === 0) return null;

    const id = common.slice(0, 3).map(([w]) => w).join('_').toLowerCase();
    const description = `用户消息中反复出现的 "${common[0][0]}" 相关意图`;
    return { id, description };
  }
}

module.exports = { AEOIntentGovernance };
```

### 5A.6 反熵增治理机制

#### 5A.6.1 意图生命周期状态机

```
             ┌───────────┐
     AEO注册 │  ACTIVE   │ ← 用户确认 + AEO评测通过
             └─────┬─────┘
                   │
          30天内<3次触发
                   │
             ┌─────▼─────┐
             │  DORMANT  │ 休眠（仍在registry中，CRAS仍可识别）
             └─────┬─────┘
                   │
          再60天仍未触发（总计90天）
                   │
             ┌─────▼──────┐
             │ DEPRECATED │ 废弃候选（CRAS不再识别）
             └─────┬──────┘
                   │
          AEO确认 + 用户知会
                   │
             ┌─────▼─────┐
             │  RETIRED  │ 正式退役（从registry移除）
             └───────────┘
```

#### 5A.6.2 自动治理规则

```javascript
// AEO治理cron（每周执行，嵌入AEO评测流程）

function governIntentLifecycle(registry) {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const changes = [];

  for (const intent of registry.intents) {
    if (intent.status === 'active') {
      // ─── 30天内触发 < 3次 → DORMANT ───
      if (intent.trigger_count_30d < 3) {
        const daysSinceLastTrigger = intent.last_triggered
          ? (now - new Date(intent.last_triggered).getTime()) / DAY_MS
          : Infinity;

        if (daysSinceLastTrigger > 30) {
          intent.status = 'dormant';
          intent.dormant_since = new Date().toISOString().split('T')[0];
          changes.push({ intent_id: intent.intent_id, from: 'active', to: 'dormant' });

          bus.emit('aeo.intent.dormant', {
            intent_id: intent.intent_id,
            trigger_count_30d: intent.trigger_count_30d,
            days_since_last: Math.floor(daysSinceLastTrigger)
          }, 'aeo-intent-governance');
        }
      }
    }

    if (intent.status === 'dormant') {
      // ─── 休眠后再60天未触发 → DEPRECATED ───
      const dormantDays = intent.dormant_since
        ? (now - new Date(intent.dormant_since).getTime()) / DAY_MS
        : 0;

      if (dormantDays >= 60) {
        intent.status = 'deprecated';
        intent.deprecated_since = new Date().toISOString().split('T')[0];
        changes.push({ intent_id: intent.intent_id, from: 'dormant', to: 'deprecated' });

        bus.emit('aeo.intent.deprecated', {
          intent_id: intent.intent_id,
          dormant_days: Math.floor(dormantDays)
        }, 'aeo-intent-governance');
      }
    }

    // DEPRECATED → RETIRED 需要AEO人工确认，不自动执行
  }

  return changes;
}
```

#### 5A.6.3 MECE健康度指标

| 指标 | 健康 | 警告 | 危险 |
|------|------|------|------|
| 活跃意图总数 | 10-30 | 30-50 | >50（意图膨胀） |
| dormant占比 | <10% | 10-20% | >20%（清理不及时） |
| 意图间最大相似度 | <0.5 | 0.5-0.7 | >0.7（MECE破坏） |
| 未知意图发现率 | 1-5/周 | 0或>10/周 | 持续0（盲区）或>20（分类粒度不够） |
| AEO评测通过率 | >80% | 60-80% | <60%（意图质量差） |

### 5A.7 AEO准出门禁

> **意图系统变更必须经AEO评测——这是质量门禁，不是可选项。**

#### 5A.7.1 三重门禁

| 门禁 | 内容 | 通过标准 | 失败处理 |
|------|------|---------|---------|
| **黄金评测集** | 每个意图≥10条标注消息（5正例+5反例） | 正例全部被正确识别，反例全部不被误识别 | 优化examples/counter_examples后重测 |
| **自动化准确率** | 在评测集上运行IntentScanner.scan() | 准确率≥80%（Precision和Recall都≥80%） | 分析失败case → 调优threshold/examples |
| **Badcase根因** | 对每个识别失败的case做根因分析 | 根因已明确且有修复方案 | 修复后进入下一轮评测（最多3轮） |

#### 5A.7.2 评测流程

```
新意图注册 / 现有意图修改
    │
    ▼
┌─────────────────┐
│ 1. 构建评测集    │  AEO从对话历史中标注10+条消息
│    (≥10条)       │  5正例 + 5反例（至少）
└────────┬────────┘
         │
    ▼
┌─────────────────┐
│ 2. 运行评测      │  IntentScanner.scan(评测消息)
│                  │  对比预期输出 vs 实际输出
└────────┬────────┘
         │
    准确率 ≥ 80%? ──── No ──── ┐
         │                     │
        Yes              ┌─────▼─────────────┐
         │               │ 3. Badcase根因分析  │
         ▼               │    每个失败case:    │
┌───────────────┐        │    - 为什么错?       │
│ 4. 通过       │        │    - 如何修?         │
│ 意图激活/更新 │        └─────┬───────────────┘
└───────────────┘              │
                          修复 + 重测（最多3轮）
                               │
                          3轮仍未通过 → 废弃
```

#### 5A.7.3 评测数据存储

```
skills/aeo/intent-evaluations/
├── {intent_id}/
│   ├── golden-set.json        # 黄金评测集
│   ├── eval-results-{date}.json  # 评测结果
│   └── badcase-analysis-{date}.md  # Badcase根因分析
```

### 5A.8 关键设计决策

| # | 决策 | 理由 |
|---|------|------|
| **D19** | 引擎=LLM本身，不是单独的分类模型 | 保持轻量，利用Opus的强推理能力，不引入额外模型部署成本 |
| **D20** | intent-registry.json解耦CRAS和AEO | CRAS只读消费→专注识别；AEO独占写入→专注治理。职责清晰 |
| **D21** | 未知意图发现由AEO驱动，非独立cron | AEO是意图类型生命周期的唯一owner，独立cron会导致职责分散 |
| **D22** | 五类收敛模型（IC1-IC5）是穷尽分类 | 情绪/规则触发/复杂/隐含/多意图，覆盖了意图的所有性质和数量维度 |
| **D23** | 正则匹配降级为LLM的fallback而非主路径 | LLM意图识别能力远超正则，正则仅在LLM不可用时作为安全降级 |
| **D24** | 不做RAG增强和嵌入模型微调 | 现阶段保持轻量可落地，云端方案成熟后再升级 |
| **D25** | AEO准出是质量门禁，不是可选项 | 意图系统变更直接影响L3事件质量，质量门禁防止意图质量退化 |

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
    // 四维评估矩阵：相关性、改进幅度、实施成本、风险
    const relevanceScore = this.assessRelevance(finding);
    const improvementScore = this.assessImprovement(finding);
    const costScore = this.assessCost(finding);
    const riskScore = this.assessRisk_value(finding);
    
    // 加权综合分 = relevance*0.3 + improvement*0.3 + (1-cost)*0.2 + (1-risk)*0.2
    const score = relevanceScore * 0.3 + improvementScore * 0.3 + 
                  (1 - costScore) * 0.2 + (1 - riskScore) * 0.2;
    
    const applicability = score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low';
    const recommendation = score >= 0.7 ? 'evaluate_and_adapt' : 
                          score >= 0.4 ? 'further_research' : 'archive';
    
    return { score: Math.round(score * 100) / 100, applicability, recommendation };
  }
  
  assessRelevance(finding) {
    // 检查发现与当前系统的交集：匹配的关键词越多越相关
    const systemKeywords = ['isc', 'dto', 'event', 'skill', 'agent', 'cras', 'aeo', 
                           'bus', 'scanner', 'dispatcher', 'memory', 'rule'];
    const findingText = (finding.summary || '' + ' ' + (finding.keywords || []).join(' ')).toLowerCase();
    const matches = systemKeywords.filter(kw => findingText.includes(kw));
    return Math.min(1, matches.length / 3);  // 3个以上关键词匹配 = 满分
  }
  
  assessImprovement(finding) {
    // 基于发现类型估算改进幅度
    const highImpact = ['architecture', 'performance', 'security', 'reliability'];
    const medImpact = ['pattern', 'practice', 'tool', 'api'];
    const keywords = finding.keywords || [];
    if (keywords.some(k => highImpact.includes(k))) return 0.8;
    if (keywords.some(k => medImpact.includes(k))) return 0.5;
    return 0.3;
  }
  
  assessCost(finding) {
    // 基于变更复杂度估算成本 (0=免费, 1=极高)
    // 简化：如果涉及核心架构变更成本高，配置类变更成本低
    const keywords = finding.keywords || [];
    if (keywords.includes('architecture') || keywords.includes('refactor')) return 0.8;
    if (keywords.includes('tool') || keywords.includes('library')) return 0.4;
    return 0.3; // 默认中低成本
  }
  
  assessRisk_value(finding) {
    // 评估引入风险 (0=无风险, 1=极高)
    const keywords = finding.keywords || [];
    if (keywords.includes('breaking') || keywords.includes('migration')) return 0.7;
    if (keywords.includes('security')) return 0.5;
    return 0.2;
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

  identifyAffectedRules(finding) {
    // 根据发现的领域关键词匹配可能受影响的ISC规则
    const keywords = finding.keywords || [];
    const ruleMap = {
      'security': ['R45', 'R46', 'R47', 'R48'],
      'architecture': ['R60', 'R54', 'R04'],
      'embedding': ['R36', 'R37', 'R40', 'R41', 'R42', 'R44'],
      'vector': ['R36', 'R37', 'R40', 'R41', 'R42', 'R44'],
      'agent': ['R63', 'R64', 'R66'],
      'coordination': ['R63', 'R64', 'R66'],
      'model': ['R70', 'R76', 'R77'],
      'documentation': ['R14', 'R17', 'R18', 'R19'],
      'naming': ['R05', 'R22', 'R23', 'R24']
    };
    
    const affected = new Set();
    for (const kw of keywords) {
      const rules = ruleMap[kw] || [];
      rules.forEach(r => affected.add(r));
    }
    return [...affected];
  }

  identifyAffectedSkills(finding) {
    // 根据发现内容匹配可能受影响的技能
    const keywords = finding.keywords || [];
    const skillMap = {
      'security': ['isc-core'],
      'architecture': ['dto-core', 'isc-core'],
      'embedding': ['cras'],
      'agent': ['parallel-subagent'],
      'model': ['glm-asr', 'glm-5-coder'],
      'api': ['evomap-publisher', 'evomap-a2a'],
      'documentation': ['isc-document-quality']
    };
    
    const affected = new Set();
    for (const kw of keywords) {
      const skills = skillMap[kw] || [];
      skills.forEach(s => affected.add(s));
    }
    return [...affected];
  }
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

**文件位置**：`infrastructure/scanners/pattern-analyzer.js`（新建，v4.1修正路径）

```javascript
// infrastructure/scanners/pattern-analyzer.js
// L5 系统性模式检测引擎

const bus = require('../event-bus/bus.js');  // 同在infrastructure/下，向上一级即可
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
    // 从Git log中提取同一模块的修改记录，检测修补循环
    const { execSync } = require('child_process');
    const windowDays = 7;
    const threshold = 3; // 同一模块7天内修改>=3次
    
    try {
      // 获取最近N天的commit，按文件路径分组
      const log = execSync(
        `git log --oneline --name-only --since="${windowDays} days ago" -- skills/ infrastructure/`,
        { cwd: '/root/.openclaw/workspace', encoding: 'utf8', timeout: 10000 }
      );
      
      // 按模块（skills/xxx/ 或 infrastructure/xxx/）分组统计
      const moduleCounts = {};
      const modulePatches = {};
      let currentCommit = null;
      
      for (const line of log.split('\n')) {
        if (!line.trim()) continue;
        // commit行格式: "abc1234 commit message"
        if (/^[a-f0-9]{7,}/.test(line)) {
          currentCommit = { hash: line.split(' ')[0], description: line.substring(8) };
          continue;
        }
        // 文件路径行
        const moduleMatch = line.match(/^(skills\/[^/]+|infrastructure\/[^/]+)/);
        if (moduleMatch && currentCommit) {
          const module = moduleMatch[1];
          if (!moduleCounts[module]) { moduleCounts[module] = 0; modulePatches[module] = []; }
          moduleCounts[module]++;
          modulePatches[module].push({
            date: new Date().toISOString().split('T')[0], // 简化：实际应从git log --format获取
            commit: currentCommit.hash,
            description: currentCommit.description
          });
        }
      }
      
      // 过滤出超过阈值的模块
      return Object.entries(moduleCounts)
        .filter(([_, count]) => count >= threshold)
        .map(([module, count]) => ({
          module,
          count,
          windowDays,
          patches: (modulePatches[module] || []).slice(0, 10) // 最多返回10条
        }));
    } catch (e) {
      console.error(`detectPatchCycles failed: ${e.message}`);
      return [];
    }
  }

  async detectCorrelatedFailures() {
    // 从事件总线消费 *.failed 事件，按时间窗口分组检测关联失败
    const bus = require('../event-bus/bus.js');
    const windowHours = 4; // 4小时窗口
    const minModules = 2;  // 至少2个不同模块同时失败
    
    try {
      const failedEvents = bus.consume(PROBE_ID + '-corr', {
        type_filter: '*.failed',
        since: Date.now() - 24 * 60 * 60 * 1000 // 过去24小时
      });
      
      // 按时间窗口分桶
      const buckets = {};
      for (const evt of failedEvents) {
        const bucketKey = Math.floor(evt.timestamp / (windowHours * 3600000));
        if (!buckets[bucketKey]) buckets[bucketKey] = [];
        buckets[bucketKey].push(evt);
      }
      
      const correlations = [];
      for (const [_, events] of Object.entries(buckets)) {
        // 提取涉及的不同模块
        const modules = [...new Set(events.map(e => e.type.split('.')[0]))];
        if (modules.length >= minModules) {
          correlations.push({
            modules,
            totalFailures: events.length,
            correlationScore: Math.min(1, modules.length / 3), // 3+模块关联=满分
            possibleCommonRoot: this.inferCommonRoot(events),
            windowHours
          });
        }
      }
      return correlations;
    } catch (e) {
      console.error(`detectCorrelatedFailures failed: ${e.message}`);
      return [];
    }
  }

  inferCommonRoot(events) {
    // 简易根因推断：找到事件中最高频的source/probe
    const sources = {};
    for (const e of events) {
      const src = e.source || e.probe || 'unknown';
      sources[src] = (sources[src] || 0) + 1;
    }
    const sorted = Object.entries(sources).sort((a, b) => b[1] - a[1]);
    return sorted[0] ? sorted[0][0] : 'unknown';
  }

  async detectRegressions() {
    // 对比已修复问题的事件签名与新出现的事件签名
    const bus = require('../event-bus/bus.js');
    
    try {
      // 获取最近resolved的事件
      const resolvedEvents = bus.consume(PROBE_ID + '-reg-resolved', {
        type_filter: '*.resolved',
        since: Date.now() - 30 * 24 * 60 * 60 * 1000 // 过去30天
      });
      
      // 获取最近detected/failed的事件
      const failedEvents = bus.consume(PROBE_ID + '-reg-failed', {
        type_filter: '*.failed',
        since: Date.now() - 7 * 24 * 60 * 60 * 1000 // 过去7天
      });
      
      const regressions = [];
      for (const resolved of resolvedEvents) {
        // 查找同类型事件是否又出现
        const baseType = resolved.type.replace('.resolved', '');
        const reappeared = failedEvents.find(f => 
          f.type.startsWith(baseType) && f.timestamp > resolved.timestamp
        );
        
        if (reappeared) {
          regressions.push({
            issue: baseType,
            fixCommit: resolved.payload?.fix_commit || 'unknown',
            regressionCommit: reappeared.payload?.commit || 'unknown',
            daysBetween: Math.floor((reappeared.timestamp - resolved.timestamp) / 86400000)
          });
        }
      }
      return regressions;
    } catch (e) {
      console.error(`detectRegressions failed: ${e.message}`);
      return [];
    }
  }

  async detectArchitectureBottlenecks() {
    // 统计每个组件被引用次数 + 报错频率
    const bus = require('../event-bus/bus.js');
    const fs = require('fs');
    
    try {
      // 从routes.json统计每个handler被多少规则引用
      const routesPath = path.join(__dirname, '../dispatcher/routes.json');
      const routes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
      
      const handlerRefCount = {};
      for (const [_, route] of Object.entries(routes)) {
        const handler = route.handler || 'unknown';
        handlerRefCount[handler] = (handlerRefCount[handler] || 0) + 1;
      }
      
      // 从事件总线统计每个组件的错误率
      const allEvents = bus.consume(PROBE_ID + '-bottleneck', {
        since: Date.now() - 7 * 24 * 60 * 60 * 1000
      });
      
      const componentErrors = {};
      const componentTotal = {};
      for (const evt of allEvents) {
        const component = evt.type.split('.')[0];
        componentTotal[component] = (componentTotal[component] || 0) + 1;
        if (evt.type.includes('.failed') || evt.type.includes('.violated')) {
          componentErrors[component] = (componentErrors[component] || 0) + 1;
        }
      }
      
      // 组件被高引用 + 高错误率 = 架构瓶颈
      const bottlenecks = [];
      for (const [component, total] of Object.entries(componentTotal)) {
        const errors = componentErrors[component] || 0;
        const errorRate = total > 0 ? errors / total : 0;
        const refCount = handlerRefCount[component] || 0;
        
        if (errorRate > 0.2 && refCount >= 3) {
          bottlenecks.push({
            component,
            dependentRules: refCount,
            errorRate: Math.round(errorRate * 100) / 100,
            recommendation: errorRate > 0.5 
              ? '紧急重构：错误率过高，影响多个依赖规则' 
              : '建议重构：错误率偏高，降低影响面'
          });
        }
      }
      return bottlenecks;
    } catch (e) {
      console.error(`detectArchitectureBottlenecks failed: ${e.message}`);
      return [];
    }
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

**文件位置**：`infrastructure/scanners/evolution-detector.js`（新建，v4.1修正路径）

```javascript
// infrastructure/scanners/evolution-detector.js
// 元事件域探针 - 检测IQ提升机会

const bus = require('../event-bus/bus.js');  // 同在infrastructure/下，向上一级即可
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
    // 从事件总线聚合记忆相关信号
    const bus = require('../event-bus/bus.js');
    try {
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      
      // L1: 记忆删除事件
      const memDeleted = bus.consume(PROBE_ID + '-mem-del', {
        type_filter: 'infra.memory.deleted',
        since: Date.now() - weekMs
      });
      
      // L2: 记忆缺口事件
      const memGaps = bus.consume(PROBE_ID + '-mem-gap', {
        type_filter: 'infra.memory.gap_found',
        since: Date.now() - weekMs
      });
      
      // L3: 用户提到记忆失败 ("你忘了"、"上次说过")
      const frustrations = bus.consume(PROBE_ID + '-mem-frust', {
        type_filter: 'user.sentiment.frustration.shifted',
        since: Date.now() - weekMs
      });
      const memoryFrustrations = frustrations.filter(e => 
        (e.payload?.message_excerpt || '').match(/忘了|记不住|上次|说过|提过/)
      );
      
      // 计算失败率 = (删除+缺口+记忆相关挫败) / 总交互事件数
      const totalInteractions = bus.consume(PROBE_ID + '-mem-total', {
        type_filter: 'interaction.message.received',
        since: Date.now() - weekMs
      }).length || 1; // 防除零
      
      const failureCount = memDeleted.length + memGaps.length + memoryFrustrations.length;
      
      return {
        failureRate: Math.round((failureCount / totalInteractions) * 100) / 100,
        manualRecoveryCount: memGaps.length, // 需要手动恢复的次数
        deletionCount: memDeleted.length,
        frustrationCount: memoryFrustrations.length
      };
    } catch (e) {
      console.error(`aggregateMemorySignals failed: ${e.message}`);
      return { failureRate: 0, manualRecoveryCount: 0 };
    }
  }

  aggregateCoordinationSignals() {
    // 从事件总线聚合多Agent协同信号
    const bus = require('../event-bus/bus.js');
    try {
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      
      // 子Agent任务：统计完成和失败
      const subagentCompleted = bus.consume(PROBE_ID + '-coord-done', {
        type_filter: 'orchestration.subagent.completed',
        since: Date.now() - weekMs
      });
      const subagentFailed = bus.consume(PROBE_ID + '-coord-fail', {
        type_filter: 'orchestration.subagent.failed',
        since: Date.now() - weekMs
      });
      
      // 计算平均延迟 (从spawned到completed的时间差)
      const latencies = subagentCompleted
        .filter(e => e.payload?.duration_ms)
        .map(e => e.payload.duration_ms);
      const avgLatencyMs = latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0;
      
      // 瓶颈 = 失败+超时的次数
      const bottleneckCount = subagentFailed.length;
      
      return {
        bottleneckCount,
        avgLatencyMs: Math.round(avgLatencyMs),
        totalTasks: subagentCompleted.length + subagentFailed.length,
        failureRate: (subagentCompleted.length + subagentFailed.length) > 0
          ? subagentFailed.length / (subagentCompleted.length + subagentFailed.length)
          : 0
      };
    } catch (e) {
      console.error(`aggregateCoordinationSignals failed: ${e.message}`);
      return { bottleneckCount: 0, avgLatencyMs: 0 };
    }
  }

  aggregateAutonomySignals() {
    // 从L3事件中统计人工介入频率
    const bus = require('../event-bus/bus.js');
    try {
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      
      // 总交互数
      const totalInteractions = bus.consume(PROBE_ID + '-auto-total', {
        type_filter: 'interaction.message.received',
        since: Date.now() - weekMs
      }).length || 1;
      
      // 人工介入信号：用户纠正、用户接管、Agent不确定
      const corrections = bus.consume(PROBE_ID + '-auto-corr', {
        type_filter: 'conversation.correction.*',
        since: Date.now() - weekMs
      });
      
      // 用户挫败 (需要人工介入的强信号)
      const frustrations = bus.consume(PROBE_ID + '-auto-frust', {
        type_filter: 'user.sentiment.frustration.shifted',
        since: Date.now() - weekMs
      });
      
      const humanInterventionCount = corrections.length + frustrations.length;
      
      return {
        humanInterventionRate: Math.round((humanInterventionCount / totalInteractions) * 100) / 100,
        correctionCount: corrections.length,
        frustrationCount: frustrations.length,
        totalInteractions
      };
    } catch (e) {
      console.error(`aggregateAutonomySignals failed: ${e.message}`);
      return { humanInterventionRate: 0 };
    }
  }

  aggregateLearningSignals() {
    // 从L4事件中统计知识发现频率和适配率
    const bus = require('../event-bus/bus.js');
    try {
      const monthMs = 30 * 24 * 60 * 60 * 1000;
      
      // L4发现事件
      const discoveries = bus.consume(PROBE_ID + '-learn-disc', {
        type_filter: 'knowledge.*.discovered',
        since: Date.now() - monthMs
      });
      
      // L4适配成功事件
      const adapted = bus.consume(PROBE_ID + '-learn-adapt', {
        type_filter: 'knowledge.*.adapted',
        since: Date.now() - monthMs
      });
      
      // L4回滚事件（适配失败）
      const rollbacks = bus.consume(PROBE_ID + '-learn-roll', {
        type_filter: 'knowledge.*.rollback',
        since: Date.now() - monthMs
      });
      
      const discoveryRate = discoveries.length / 30; // 每天发现数
      const adaptationRate = discoveries.length > 0
        ? adapted.length / discoveries.length
        : 0;
      
      return {
        discoveryRate: Math.round(discoveryRate * 100) / 100,
        adaptationRate: Math.round(adaptationRate * 100) / 100,
        totalDiscoveries: discoveries.length,
        totalAdapted: adapted.length,
        totalRollbacks: rollbacks.length
      };
    } catch (e) {
      console.error(`aggregateLearningSignals failed: ${e.message}`);
      return { discoveryRate: 0, adaptationRate: 0 };
    }
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

// consume — 基于cursor读取未消费事件 ★v4.3完整实现：支持type_filter + since
function consume(consumerId, options = {}) {
  const cursor = readCursor(consumerId);
  const events = readEventsFromOffset(cursor.offset);
  const acked = loadAckedSet(consumerId);  // 从acks.jsonl加载该消费者已ack的事件ID集合
  
  let filtered = events.filter(e => !acked.has(e.id));
  
  // ─── type_filter: 支持精确匹配和通配符 ───
  // 通配符规则: 
  //   'user.intent.file_request.inferred' → 精确匹配
  //   'user.intent.*' → 匹配 user.intent 下任意子路径
  //   '*.failed' → 匹配任何以 .failed 结尾的事件
  //   '*' → 匹配所有（等于不过滤）
  if (options.type_filter && options.type_filter !== '*') {
    const filter = options.type_filter;
    
    if (filter.includes('*')) {
      // 通配符匹配：将 * 转为正则
      // 'user.intent.*' → /^user\.intent\..+$/
      // '*.failed' → /^.+\.failed$/
      const regexStr = '^' + filter
        .replace(/\./g, '\\.')       // 转义.
        .replace(/\*/g, '.+')        // * → .+（至少匹配一个字符）
        + '$';
      const regex = new RegExp(regexStr);
      filtered = filtered.filter(e => regex.test(e.type));
    } else {
      // 精确匹配
      filtered = filtered.filter(e => e.type === filter);
    }
  }
  
  // ─── since: 时间戳过滤（只返回该时间之后的事件） ───
  if (options.since && typeof options.since === 'number') {
    filtered = filtered.filter(e => e.timestamp >= options.since);
  }
  
  // ─── layer: 按事件层级过滤（可选） ───
  if (options.layer) {
    filtered = filtered.filter(e => e.layer === options.layer);
  }
  
  // ─── limit: 限制返回数量（可选，防止大量事件撑爆内存） ───
  if (options.limit && typeof options.limit === 'number') {
    filtered = filtered.slice(0, options.limit);
  }
  
  return filtered;
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

**方案中所有引用`infrastructure/scanners/*.js`的路径统一修正为`infrastructure/scanners/*.js`**。

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
| ES06 | skill-watcher | L1 | `infrastructure/scanners/skill-watcher.js` | 🆕新建 | 技能目录变更事件 |
| ES07 | naming-scanner | L2 | `infrastructure/scanners/naming-scanner.js` | 🆕新建 | 命名规范扫描 |
| ES08 | skill-quality-scanner | L2 | `infrastructure/scanners/skill-quality-scanner.js` | 🆕新建 | 技能质量扫描 |
| ES09 | vectorization-scanner | L2 | `infrastructure/scanners/vectorization-scanner.js` | 🆕新建 | 向量化覆盖扫描 |
| ES10 | rule-scanner | L2 | `infrastructure/scanners/rule-scanner.js` | 🆕新建 | 规则格式/完整性扫描 |
| ES11 | alignment-scanner | L2 | `infrastructure/scanners/alignment-scanner.js` | 🆕新建 | ISC-DTO对齐扫描 |
| ES12 | capability-scanner | L2 | `infrastructure/scanners/capability-scanner.js` | 🆕新建 | 能力锚点扫描 |
| ES13 | error-scanner | L2 | `infrastructure/scanners/error-scanner.js` | 🆕新建 | 错误频率扫描 |
| ES14 | config-watcher | L1 | `infrastructure/scanners/config-watcher.js` | 🆕新建 | 配置变更监听 |
| **ES25** | **cras-fast-channel** | **L3** | `skills/cras/conversation-probe.js` | 🆕新建 | 快通道意图提取 |
| **ES26** | **cras-slow-channel** | **L3** | `skills/cras/daily-aggregator.js` | 🆕新建 | 慢通道模式分析 |
| **ES27** | **knowledge-probe** | **L4** | `skills/cras/knowledge-discovery-probe.js` | 🆕新建 | 知识发现探针 |
| **ES28** | **pattern-analyzer** | **L5** | `infrastructure/scanners/pattern-analyzer.js` | 🆕新建 | 系统性模式检测 |
| **ES29** | **evolution-detector** | **META** | `infrastructure/scanners/evolution-detector.js` | 🆕新建 | 进化机会检测 |
| ES24 | global-sweep | L1-L5 | `infrastructure/scanners/global-sweep.js` | 🆕新建 | 全量兜底扫描 |

### 9.2 五层事件源到规则的映射

```
┌───────────────────────────────────────────────────────────────────────┐
│ L1: ES01(git) + ES02(bridge) + ES06(skill) + ES14(config)            │
│     → 覆盖全部70条独立规则的lifecycle事件（5条纯阈值驱动规则除外）      │
├───────────────────────────────────────────────────────────────────────┤
│ L2: ES07-ES13 + ES24(sweep)                                         │
│     → 覆盖38条有量化条件的规则（54.3%，与4.0节统计一致）                │
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
│     → 覆盖全部70条独立规则（任何规则都可能产生进化信号）                │
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
    │  70条独立规则        │
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
| 1.3 BaseScanner框架 | 扫描器基类 | `infrastructure/scanners/base-scanner.js`（新建） | 2h |
| 1.4 L1事件源完善 | git hook扩展 | `.git/hooks/post-commit`（改造） | 1h |
| 1.5 L2扫描器实现 | 7个组合扫描器 | `infrastructure/scanners/*.js`（新建） | 8h |
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
| 4.1 模式检测引擎 | L5事件emit | `infrastructure/scanners/pattern-analyzer.js`（新建） | 6h |
| 4.2 根因分析handler | 多维关联 | `infrastructure/dispatcher/handlers/refactor-analyzer.js`（新建） | 4h |
| 4.3 重构执行handler | 方案→执行 | `infrastructure/dispatcher/handlers/refactor-executor.js`（新建） | 3h |
| 4.4 L5路由配置 | dispatcher路由 | `infrastructure/dispatcher/routes.json`（更新） | 1h |

### Phase 5: 自驱进化（META）（1天）

| 任务 | 产出 | 文件位置 | 估时 |
|------|------|---------|------|
| 5.1 进化检测引擎 | META事件emit | `infrastructure/scanners/evolution-detector.js`（新建） | 4h |
| 5.2 凌霄阁进化审议 | 专用审议流程 | `skills/council-evolution.js`（新建） | 3h |
| 5.3 META路由配置 | dispatcher路由 | `infrastructure/dispatcher/routes.json`（更新） | 1h |

### Phase 6: 规则迁移+验证（2天）

| 任务 | 产出 | 文件位置 | 估时 |
|------|------|---------|------|
| 6.1 规则Schema迁移脚本 | v3→v4 trigger格式 | `scripts/migrate-rules-v4.js`（新建） | 3h |
| 6.2 执行迁移 | 70条独立规则JSON更新 | `skills/isc-core/rules/*.json`（更新） | 2h |
| 6.3 事件推导验证 | derive-events-v4.js | `skills/isc-core/bin/derive-events-v4.js`（新建） | 3h |
| 6.4 端到端测试 | L1-L5全链路验证 | `tests/e2e-event-flow.js`（新建） | 4h |
| 6.5 三角对齐监控 | ISC-Event-DTO | `monitors/alignment-monitor.js`（新建） | 2h |

### 总估时

> **v4.1修正**：v4.0声称"全部基于现有代码可落地"过于乐观。以下是工程审查后的诚实估时。

| Phase | 估时 | 可并行 | 备注 |
|-------|------|--------|------|
| Phase 0 (工程基建) | 3天 | — | bus.js性能重构+scanners目录+条件评估器 |
| Phase 1 (L1+L2基础) | 2天 | — | 扫描器实现、event schema升级 |
| Phase 2 (L3 CRAS) | 3天 | 可与Phase 3并行 | 含消息钩子数据源+Module B Phase 1 |
| Phase 3 (L4知识发现) | 2天 | 可与Phase 2并行 | |
| Phase 4 (L5模式检测) | 3天 | 可与Phase 5并行 | 含根因分析handler |
| Phase 5 (META进化) | 2天 | 可与Phase 4并行 | 含凌霄阁流程实现 |
| Phase 6 (DTO总线统一) | 4天 | 需Phase 0完成 | ★高风险，需全量回归 |
| Phase 7 (迁移+验证) | 3天 | 需前6个Phase完成 | 规则迁移+端到端测试 |
| **总计** | **22天**（串行）/ **14天**（最大并行） | | 工程师评估24-28天更保守 |

---

## 第十一部分：代码变更清单

### 新建文件（22个，v4.1新增3个）

| 文件路径 | 用途 | 对应Phase |
|---------|------|----------|
| `infrastructure/scanners/base-scanner.js` | 扫描器基类 | P1 |
| `infrastructure/scanners/skill-scanner.js` | L2技能扫描 | P1 |
| `infrastructure/scanners/rule-scanner.js` | L2规则扫描 | P1 |
| `infrastructure/scanners/vectorization-scanner.js` | L2向量化扫描 | P1 |
| `infrastructure/scanners/infra-scanner.js` | L2基础设施扫描 | P1 |
| `infrastructure/scanners/quality-scanner.js` | L2质量扫描 | P1 |
| `infrastructure/scanners/sync-scanner.js` | L2同步扫描 | P1 |
| `infrastructure/scanners/global-sweep.js` | 全量兜底扫描 | P1 |
| `skills/cras/conversation-probe.js` | L3 CRAS快通道 | P2 |
| `skills/cras/daily-aggregator.js` | L3 CRAS慢通道 | P2 |
| `skills/cras/intent-patterns.json` | L3意图模式库 | P2 |
| `skills/cras/knowledge-discovery-probe.js` | L4知识发现探针 | P3 |
| `infrastructure/dispatcher/handlers/knowledge-adapter.js` | L4知识适配 | P3 |
| `infrastructure/scanners/pattern-analyzer.js` | L5模式检测 | P4 |
| `infrastructure/dispatcher/handlers/refactor-analyzer.js` | L5根因分析 | P4 |
| `infrastructure/scanners/evolution-detector.js` | META进化检测 | P5 |
| `skills/isc-core/bin/derive-events-v4.js` | 事件推导算法 | P7 |
| `scripts/migrate-rules-v4.js` | 规则迁移脚本 | P7 |
| `tests/e2e-event-flow.js` | 端到端测试 | P7 |
| **`infrastructure/event-bus/acks.jsonl`** ★v4.1 | **分离式ack存储** | **P0** |
| **`infrastructure/event-bus/noun-registry.jsonl`** ★v4.1 | **名词注册表** | **P0** |
| **`infrastructure/dispatcher/handlers/knowledge-verifier.js`** ★v4.1 | **L4知识验证** | **P3** |

### 改造文件（8个）

| 文件路径 | 变更内容 | 对应Phase |
|---------|---------|----------|
| `infrastructure/event-bus/bus.js` | emit增加layer/probe字段 | P1 |
| `infrastructure/dispatcher/dispatcher.js` | 真正执行handler | P1 |
| `infrastructure/dispatcher/routes.json` | 新增L3-L5+META路由 | P2-P5 |
| `.git/hooks/post-commit` | 扩展emit事件类型 | P1 |
| `dto-core/core/event-bus.js` | 标记废弃，引导到bus.js | P1 |
| `skills/isc-core/rules/*.json` (70个独立规则) | trigger.events格式v4化 | P7 |
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
| **D13** ★ | **user.intent必须按具体意图细分命名** | v4.0将10+种意图映射到同一事件类型，路由效率低、调试困难 | v4.1质量审查 |
| **D14** ★ | **覆盖率必须逐行核查，不接受估算** | v4.0声称100%实为92.9%，数据诚实性是红线 | v4.1质量审查 |
| **D15** ★ | **名词空间必须有注册+收缩机制** | 只有"增长"无"收缩"违反反熵增原则 | v4.1质量审查 |
| **D16** ★ | **bus.js ack改为追加式，不重写events.jsonl** | O(n)全量重写在5层事件吞吐下是性能灾难 | v4.1工程审查 |
| **D17** ★ | **CRAS数据源用消息钩子替代session历史读取** | session历史不可从skill直接访问 | v4.1工程审查 |
| **D18** ★ | **不声称"基于现有代码可落地"** | L3-L5+META探针全部需新建，工期24-28天 | v4.1工程审查（诚实） |
| **D19** ★★ | **引擎=LLM本身，不是单独的分类模型** | 保持轻量，利用Opus推理能力，不引入额外模型 | v4.3用户明确指定 |
| **D20** ★★ | **intent-registry.json解耦CRAS和AEO** | CRAS只读消费→专注识别；AEO独占写入→专注治理 | v4.3架构分析 |
| **D21** ★★ | **未知意图发现由AEO驱动，非独立cron** | AEO是意图类型生命周期的唯一owner，独立cron会导致职责分散 | v4.3用户明确指定 |
| **D22** ★★ | **五类收敛模型（IC1-IC5）是穷尽分类** | 情绪/规则触发/复杂/隐含/多意图覆盖全部性质和数量维度 | v4.3用户明确指定 |
| **D23** ★★ | **正则匹配降级为LLM的fallback** | LLM意图识别能力远超正则，正则仅在LLM不可用时作为安全降级 | v4.3架构决策 |
| **D24** ★★ | **AEO准出是质量门禁，不是可选项** | 意图系统变更直接影响L3事件质量，不经评测不允许上线 | v4.3用户明确指定 |
| **D25** ★★ | **推导算法判断函数基于关键词+结构多维判断** | 12个判断函数不再是黑箱，支撑3000+规则自动推导 | v4.3阻断项修复 |
| **D26** ★★ | **bus.consume()支持type_filter通配+since时间过滤** | 20+处调用依赖这两个参数，是L5/META探针数据获取基础 | v4.3阻断项修复 |
| **D27** ★★ | **Dispatcher路由四级优先级：精确>前缀通配>后缀通配>全通配** | 通配匹配策略直接影响事件路由正确性，必须有确定性规则 | v4.3阻断项修复 |
| **D28** ★★★ | **三层解耦是架构元原则：感知/认知/执行每层独立可替换** | 防止职责混杂导致的耦合灾难，每个新设计必须通过三层归属检查 | v4.3用户明确指定 |

---

## 第八·十三部分：Dispatcher核心路由引擎 ★v4.3新增

> **v4.2遗留阻断项**：`loadHandler()`和`matchRoute()`是事件系统中枢，但此前只有调用签名无实现。通配匹配优先级策略（精确 > 前缀 > 通配 > 默认）直接影响事件路由的正确性。

### 8.13.1 路由匹配引擎

```javascript
// infrastructure/dispatcher/dispatcher.js — 完整实现 ★v4.3

const fs = require('fs');
const path = require('path');

const ROUTES_FILE = path.join(__dirname, 'routes.json');
const HANDLERS_DIR = path.join(__dirname, 'handlers');

class Dispatcher {
  constructor() {
    this._routes = null;           // 路由表缓存
    this._routesMtime = 0;         // 路由表文件修改时间
    this._handlerCache = {};       // handler模块缓存
    this._compiledRoutes = null;   // 编译后的路由（按优先级排序）
  }

  // ═══════════════════════════════════════════════════════════
  // matchRoute — 四级优先级路由匹配
  // ═══════════════════════════════════════════════════════════

  /**
   * 匹配事件类型到路由配置
   * 
   * 优先级（从高到低）：
   *   1. 精确匹配 (exact)     — "user.intent.file_request.inferred"
   *   2. 前缀通配 (prefix)    — "user.intent.*"
   *   3. 后缀通配 (suffix)    — "*.failed"
   *   4. 全通配 (global)      — "*"
   * 
   * 同级别内：更具体的匹配优先（更长的非通配前缀）
   * 
   * @param {string} eventType — 事件类型，如 "user.intent.file_request.inferred"
   * @returns {Object|null} — 匹配的路由配置，或null（无匹配）
   */
  matchRoute(eventType) {
    const routes = this._getCompiledRoutes();

    // Phase 1: 精确匹配（O(1) HashMap查找）
    if (routes.exact[eventType]) {
      return { ...routes.exact[eventType], _match_type: 'exact', _pattern: eventType };
    }

    // Phase 2: 前缀通配匹配（按前缀长度降序，更具体的优先）
    for (const { pattern, regex, prefixLen, config } of routes.prefix) {
      if (regex.test(eventType)) {
        return { ...config, _match_type: 'prefix', _pattern: pattern };
      }
    }

    // Phase 3: 后缀通配匹配
    for (const { pattern, regex, config } of routes.suffix) {
      if (regex.test(eventType)) {
        return { ...config, _match_type: 'suffix', _pattern: pattern };
      }
    }

    // Phase 4: 全通配
    if (routes.global) {
      return { ...routes.global, _match_type: 'global', _pattern: '*' };
    }

    return null; // 无匹配
  }

  /**
   * 编译routes.json为按优先级分类的路由结构
   * 编译一次，缓存复用（routes.json变更时重新编译）
   */
  _getCompiledRoutes() {
    this._reloadIfChanged();
    if (this._compiledRoutes) return this._compiledRoutes;

    const raw = this._routes;
    const compiled = {
      exact: {},     // 精确匹配: { eventType: config }
      prefix: [],    // 前缀通配: [{ pattern, regex, prefixLen, config }]（按prefixLen降序）
      suffix: [],    // 后缀通配: [{ pattern, regex, config }]
      global: null   // 全通配: config
    };

    for (const [pattern, config] of Object.entries(raw)) {
      if (pattern === '*') {
        // 全通配
        compiled.global = config;
      } else if (!pattern.includes('*')) {
        // 精确匹配
        compiled.exact[pattern] = config;
      } else if (pattern.endsWith('.*')) {
        // 前缀通配: "user.intent.*"
        const prefix = pattern.slice(0, -2); // "user.intent"
        const regexStr = '^' + prefix.replace(/\./g, '\\.') + '\\..+$';
        compiled.prefix.push({
          pattern,
          regex: new RegExp(regexStr),
          prefixLen: prefix.length,
          config
        });
      } else if (pattern.startsWith('*.')) {
        // 后缀通配: "*.failed"
        const suffix = pattern.slice(2); // "failed"
        const regexStr = '^.+\\.' + suffix.replace(/\./g, '\\.') + '$';
        compiled.suffix.push({
          pattern,
          regex: new RegExp(regexStr),
          config
        });
      } else {
        // 中间通配（罕见，如 "user.*.inferred"）— 退化为正则
        const regexStr = '^' + pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.+')
          + '$';
        // 中间通配按前缀长度归入prefix组
        const prefixLen = pattern.indexOf('*');
        compiled.prefix.push({
          pattern,
          regex: new RegExp(regexStr),
          prefixLen,
          config
        });
      }
    }

    // 前缀通配按 prefixLen 降序排序（更具体的优先）
    compiled.prefix.sort((a, b) => b.prefixLen - a.prefixLen);

    this._compiledRoutes = compiled;
    return compiled;
  }

  // ═══════════════════════════════════════════════════════════
  // loadHandler — 约定式handler加载
  // ═══════════════════════════════════════════════════════════

  /**
   * 根据handler名称加载handler模块
   * 
   * 加载约定（按顺序查找）：
   *   1. handlers/{name}.js          — 标准位置
   *   2. handlers/{name}/index.js    — 目录形式
   *   3. ../../skills/{name}/handler.js  — 技能内嵌handler
   * 
   * handler模块必须导出:
   *   { handle: async function(event) → result }
   * 
   * @param {string} handlerName — handler名称
   * @returns {Object} — handler模块实例（含handle方法）
   * @throws {Error} — handler不存在或加载失败
   */
  loadHandler(handlerName) {
    // 缓存命中
    if (this._handlerCache[handlerName]) {
      return this._handlerCache[handlerName];
    }

    // 按约定顺序查找handler文件
    const searchPaths = [
      path.join(HANDLERS_DIR, `${handlerName}.js`),
      path.join(HANDLERS_DIR, handlerName, 'index.js'),
      path.join(__dirname, '../../skills', handlerName, 'handler.js')
    ];

    for (const handlerPath of searchPaths) {
      if (fs.existsSync(handlerPath)) {
        try {
          const handler = require(handlerPath);

          // 验证handler接口
          if (typeof handler.handle !== 'function') {
            throw new Error(
              `Handler '${handlerName}' at ${handlerPath} does not export handle() function`
            );
          }

          this._handlerCache[handlerName] = handler;
          return handler;

        } catch (e) {
          if (e.code === 'MODULE_NOT_FOUND') continue; // 尝试下一个路径
          throw e; // 其他错误直接抛出
        }
      }
    }

    throw new Error(
      `Handler '${handlerName}' not found. Searched:\n` +
      searchPaths.map(p => `  - ${p}`).join('\n')
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 路由表热重载
  // ═══════════════════════════════════════════════════════════

  _reloadIfChanged() {
    try {
      const stat = fs.statSync(ROUTES_FILE);
      if (stat.mtimeMs > this._routesMtime) {
        this._routes = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8'));
        this._routesMtime = stat.mtimeMs;
        this._compiledRoutes = null; // 清除编译缓存，下次调用重新编译
        this._handlerCache = {};     // 清除handler缓存（路由变更可能影响handler映射）
      }
    } catch (e) {
      if (!this._routes) {
        this._routes = {};
        console.error(`Failed to load routes.json: ${e.message}`);
      }
    }
  }
}

module.exports = { Dispatcher };
```

### 8.13.2 路由匹配优先级示例

```
routes.json 内容:
{
  "user.intent.file_request.inferred": { "handler": "file-sender", ... },      // 精确
  "user.intent.*":                      { "handler": "intent-dispatcher", ... }, // 前缀通配
  "user.sentiment.*":                   { "handler": "sentiment-handler", ... }, // 前缀通配
  "*.failed":                           { "handler": "failure-handler", ... },   // 后缀通配
  "*":                                  { "handler": "default-handler", ... }    // 全通配
}

事件路由结果:
  "user.intent.file_request.inferred"  → file-sender        (精确匹配优先)
  "user.intent.vision_task.inferred"   → intent-dispatcher   (前缀通配)
  "user.sentiment.frustration.shifted" → sentiment-handler   (前缀通配)
  "dto.task.failed"                    → failure-handler     (后缀通配)
  "isc.rule.created"                   → default-handler     (全通配兜底)
```

### 8.13.3 Handler接口契约

```javascript
// handlers/example-handler.js — handler标准模板

/**
 * Handler接口契约:
 * - 必须导出 handle(event) 异步函数
 * - event 包含: { id, type, layer, source, probe, timestamp, payload, metadata }
 * - 返回值: { success: boolean, emittedEvents?: Array, result?: any }
 * - 抛出异常: 由Dispatcher容灾包装器处理（重试+降级，见Part 8.6）
 */
module.exports = {
  async handle(event) {
    const { type, payload, metadata } = event;

    // 1. 业务逻辑
    const result = await processEvent(payload);

    // 2. 可选：emit下游事件（传递trace_id形成因果链）
    const bus = require('../../event-bus/bus.js');
    const downstream = bus.emit('downstream.event.type', {
      upstream_event_id: event.id,
      result_data: result
    }, 'example-handler', metadata?.trace_id);

    return {
      success: true,
      emittedEvents: [downstream],
      result
    };
  }
};
```

### 8.13.4 与容灾包装器的集成

Dispatcher的`dispatch()`方法整合了matchRoute + loadHandler + 容灾执行（Part 8.6）+ Trace注入（Part 8.8）+ 限流（Part 8.7）的完整链路：

```javascript
// 完整dispatch流程（伪代码）

async dispatch(event) {
  // 1. 路由匹配
  const route = this.matchRoute(event.type);
  if (!route) {
    // 无匹配路由 → 记录到未路由事件日志（可能是新事件类型）
    bus.emit('dispatcher.event.unrouted', { event_type: event.type }, 'dispatcher');
    return;
  }

  // 2. 限流检查（Part 8.7）
  if (!rateLimiter.allow(route.handler, event.type)) {
    bus.emit('dispatcher.event.rate_limited', {
      handler: route.handler, event_type: event.type
    }, 'dispatcher');
    return;
  }

  // 3. 反馈环深度检查（Part 8.12）
  if (!feedbackGuard.checkChainDepth(event)) return;

  // 4. 加载handler
  const handler = this.loadHandler(route.handler);

  // 5. 容灾包装执行（Part 8.6: 重试+超时+降级）
  await this.executeHandler(route.handler, event);
  // executeHandler 内部已包含Trace span记录（Part 8.8）
}
```

---

## 附录A：v3→v4→v4.1差异总结

| 维度 | v3 | v4.0 | v4.1修正 |
|------|----|----|---------|
| 事件层级 | 3层+sweep | 5层+META+sweep | 不变 |
| 动词类别 | 4类/21个 | 6类/38个 | 不变 |
| 事件源数量 | 24个 | 29个 | 不变 |
| 规则覆盖 | L1+L2 100% | ~~L1 100%~~（虚报） | **L1 92.9%, L2 54.3%（诚实数据）** |
| 独立规则数 | — | ~~74条~~（虚报） | **70条（去重后实际值）** |
| L3事件类型 | 无 | 12种（语义稀释） | **28种（每种意图独立命名）** |
| CRAS定位 | 消费事件+学习 | L3事件探针 | **+消息钩子数据源替代方案** |
| 对话数据源 | 无 | ~~假设可读取session历史~~ | **消息钩子+记忆文件代理** |
| 闭环完整性 | L1/L2 | ~~声称L3-L5完整~~（缺失） | **L3-L5+META完整执行路径** |
| 名词治理 | 无 | 无（只有增长） | **注册+去重+废弃收缩机制** |
| 凌霄阁 | 可选 | 概念（缺细节） | **完整流程+成本控制+分级** |
| bus.js性能 | — | ~~未识别问题~~ | **分离ack存储，O(1)追加** |
| 工程可行性 | — | ~~声称"现有代码可落地"~~ | **专章分析6项风险+方案** |
| 事件Schema | type+source | +layer+probe+confidence | 不变 |

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

## 第八·六部分：容灾/降级/回滚完整设计 ★v4.2新增

> **v4.1缺失**：整个方案缺少系统性的错误处理和容灾设计。handler崩溃、事件丢失、JSONL损坏怎么办？本章补齐。

### 8.6.1 三层容灾架构

```
┌──────────────────────────────────────────────────────────────────────┐
│                     容灾/降级/回滚三层架构                             │
│                                                                      │
│  Layer 1: 组件级容错（单点故障不扩散）                                 │
│  ├── handler崩溃 → 隔离 + 重试 + 降级                                │
│  ├── 事件丢失 → 事件持久化保证 + sweep兜底                            │
│  └── 文件损坏 → 自动修复 + 备份恢复                                  │
│                                                                      │
│  Layer 2: 链路级降级（闭环断裂时退化为安全模式）                       │
│  ├── L3探针宕机 → 退化为L1/L2驱动（功能降级但不停服）                │
│  ├── CRAS不可用 → 意图识别关闭，其他层不受影响                       │
│  └── 凌霄阁不可用 → 降级为人工审批                                   │
│                                                                      │
│  Layer 3: 系统级回滚（重大变更可回退）                                │
│  ├── 规则迁移回滚 → v3 trigger格式向后兼容                           │
│  ├── bus.js改造回滚 → 旧ack机制可一键恢复                            │
│  └── DTO统一回滚 → Facade可撤除，EventEmitter恢复                    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 8.6.2 组件级容错详细设计

#### Handler异常处理

```javascript
// infrastructure/dispatcher/dispatcher.js — handler执行包装器

class Dispatcher {
  async executeHandler(handlerName, event) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = [1000, 5000, 30000]; // 指数退避
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const handler = this.loadHandler(handlerName);
        const result = await Promise.race([
          handler.handle(event),
          this.timeout(30000) // 30秒超时
        ]);
        
        // 成功：记录执行trace
        bus.emit('dispatcher.handler.completed', {
          handler: handlerName,
          event_id: event.id,
          event_type: event.type,
          attempt,
          duration_ms: Date.now() - event.timestamp
        }, 'dispatcher');
        
        return result;
        
      } catch (error) {
        console.error(`Handler ${handlerName} failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${error.message}`);
        
        // 记录失败事件
        bus.emit('dispatcher.handler.failed', {
          handler: handlerName,
          event_id: event.id,
          event_type: event.type,
          attempt,
          error: error.message,
          stack: error.stack?.substring(0, 500)
        }, 'dispatcher');
        
        if (attempt < MAX_RETRIES) {
          await this.sleep(RETRY_DELAY_MS[attempt]);
        } else {
          // 最终失败：执行降级策略
          await this.degrade(handlerName, event, error);
        }
      }
    }
  }
  
  async degrade(handlerName, event, error) {
    // 降级策略矩阵
    const degradeMap = {
      'intent-dispatcher': () => {
        // L3 handler失败 → 忽略本次意图（L1/L2仍在工作）
        console.warn(`L3 intent-dispatcher degraded: ignoring event ${event.id}`);
      },
      'knowledge-adapter': () => {
        // L4 handler失败 → 将发现存入待处理队列，等人工处理
        this.enqueueForManual(event, 'knowledge-pending');
      },
      'refactor-analyzer': () => {
        // L5 handler失败 → 发飞书通知，请求人工介入
        bus.emit('system.degradation.human_required', {
          handler: handlerName,
          event: event,
          error: error.message
        }, 'dispatcher');
      },
      'evolution-council': () => {
        // META handler失败 → 延迟到下周重试
        this.enqueueForRetry(event, 7 * 24 * 60 * 60 * 1000);
      }
    };
    
    const degrade = degradeMap[handlerName] || (() => {
      // 默认降级：记录 + 通知
      this.enqueueForManual(event, 'handler-failed');
    });
    
    await degrade();
  }
  
  enqueueForManual(event, queue) {
    const fs = require('fs');
    const queueFile = path.join(__dirname, `../../.queues/${queue}.jsonl`);
    fs.mkdirSync(path.dirname(queueFile), { recursive: true });
    fs.appendFileSync(queueFile, JSON.stringify({ event, enqueuedAt: Date.now() }) + '\n');
  }
  
  enqueueForRetry(event, delayMs) {
    const fs = require('fs');
    const retryFile = path.join(__dirname, '../../.queues/retry.jsonl');
    fs.mkdirSync(path.dirname(retryFile), { recursive: true });
    fs.appendFileSync(retryFile, JSON.stringify({
      event,
      retryAt: Date.now() + delayMs,
      enqueuedAt: Date.now()
    }) + '\n');
  }
  
  timeout(ms) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error('Handler timeout')), ms));
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

#### events.jsonl损坏自动修复

```javascript
// infrastructure/event-bus/bus.js — 文件完整性保护

class EventBus {
  /**
   * 启动时自检events.jsonl完整性
   * 处理：最后一行写入中断（进程崩溃）导致的截断JSON
   */
  selfCheck() {
    const fs = require('fs');
    try {
      const content = fs.readFileSync(this.eventsFile, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());
      const validLines = [];
      let corruptedCount = 0;
      
      for (const line of lines) {
        try {
          JSON.parse(line);
          validLines.push(line);
        } catch (_) {
          corruptedCount++;
          // 将损坏行移到.corrupted文件保留证据
          fs.appendFileSync(this.eventsFile + '.corrupted', line + '\n');
        }
      }
      
      if (corruptedCount > 0) {
        // 重写文件，移除损坏行
        fs.writeFileSync(this.eventsFile, validLines.join('\n') + '\n');
        console.warn(`EventBus selfCheck: repaired ${corruptedCount} corrupted lines`);
        
        // 记录修复事件
        this.emit('system.eventbus.repaired', {
          corrupted_lines: corruptedCount,
          total_lines: validLines.length
        }, 'bus-selfcheck');
      }
      
      return { ok: true, corrupted: corruptedCount, total: validLines.length };
    } catch (e) {
      if (e.code === 'ENOENT') {
        // 文件不存在 → 正常，首次启动
        return { ok: true, corrupted: 0, total: 0 };
      }
      throw e; // 其他错误向上抛
    }
  }
  
  /**
   * 定期备份events.jsonl（每6小时，保留最近3份）
   */
  backup() {
    const fs = require('fs');
    const backupDir = path.join(path.dirname(this.eventsFile), '.backups');
    fs.mkdirSync(backupDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `events-${timestamp}.jsonl`);
    fs.copyFileSync(this.eventsFile, backupFile);
    
    // 清理旧备份，保留最近3份
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('events-'))
      .sort()
      .reverse();
    for (const old of backups.slice(3)) {
      fs.unlinkSync(path.join(backupDir, old));
    }
  }
}
```

### 8.6.3 链路级降级矩阵

| 故障场景 | 影响范围 | 降级行为 | 恢复方式 |
|---------|---------|---------|---------|
| CRAS快通道宕机 | L3意图检测停止 | L1/L2正常工作，意图类规则暂停触发 | Cron自动重启，5min后自动恢复 |
| CRAS慢通道宕机 | L3趋势分析停止 | 快通道仍在，日级洞察延迟 | 次日Cron自动执行 |
| pattern-analyzer宕机 | L5模式检测停止 | L1-L4正常，系统性故障发现延迟 | 手动重启或下次daily Cron |
| evolution-detector宕机 | META进化检测停止 | L1-L5全部正常，仅进化建议延迟 | 下次weekly Cron |
| dispatcher宕机 | 所有事件路由停止 | 事件持续写入events.jsonl（不丢失），恢复后从cursor消费积压事件 | **最高优先级恢复** |
| bus.js写入失败 | 事件无法持久化 | emit降级为console.error日志记录 | 磁盘空间/权限修复后自动恢复 |
| events.jsonl满10MB | 轮转触发 | 旧文件归档到.archive/，新文件从空开始 | 自动，无需人工 |
| 凌霄阁LLM不可用 | 审议无法完成 | 自动降级为"人工审批"：直接发飞书卡片给用户决策 | LLM恢复后自动切回 |

### 8.6.4 系统级回滚方案

**回滚触发条件**：
1. v4迁移后24小时内发现3个以上规则执行异常
2. bus.js改造后事件丢失率 > 1%
3. DTO统一后任何现有功能中断

**回滚步骤**：

```bash
# 1. bus.js回滚 — 恢复原始ack机制
git checkout HEAD~1 -- infrastructure/event-bus/bus.js
# events.jsonl格式不变，仅ack逻辑回退

# 2. 规则trigger格式回滚 — v3格式兼容
# v4 dispatcher自动检测trigger.events格式：
#   如果是对象 → v4处理
#   如果是数组 → v3兼容处理
# 因此无需回滚规则文件

# 3. DTO EventEmitter回滚 — 恢复event-bridge双向桥接
git checkout HEAD~1 -- dto-core/core/event-bus.js
git checkout HEAD~1 -- isc-core/event-bridge.js
# Facade层可以直接删除，不影响EventEmitter功能
```

---

## 第八·七部分：事件风暴抑制机制 ★v4.2新增

> **问题**：一次git push可能修改20个文件 → 触发20个L1事件 → 每个L1事件可能触发L2扫描 → 事件呈指数膨胀。缺少降噪/限流/批量合并机制。

### 8.7.1 三级风暴抑制

```
┌──────────────────────────────────────────────────────────────────────┐
│                     事件风暴抑制三级防线                               │
│                                                                      │
│  Level 1: 源头去重（Dedup at Source）                                 │
│  同一对象在500ms内的多次变更合并为1个事件                              │
│                                                                      │
│  Level 2: 批量合并（Batch Merge）                                    │
│  同类型事件在2秒窗口内合并为1个批量事件                               │
│                                                                      │
│  Level 3: 消费者限流（Consumer Rate Limit）                           │
│  每个handler 10秒内最多执行5次同类事件                                │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 8.7.2 源头去重实现

```javascript
// infrastructure/event-bus/bus.js — emit层去重

class EventBus {
  constructor() {
    this._dedupeWindow = new Map(); // key → {timer, event}
    this.DEDUPE_MS = 500; // 500ms去重窗口
  }
  
  /**
   * 带去重的emit：同一type+同一对象在500ms内只写入最后一次
   */
  emitDeduped(type, payload, source) {
    // 生成去重键：type + 对象标识
    const objectId = payload.rule_id || payload.skill_name || payload.file_path || '';
    const dedupeKey = `${type}:${objectId}`;
    
    // 如果窗口内已有同一事件，取消旧的，用新的覆盖
    if (this._dedupeWindow.has(dedupeKey)) {
      clearTimeout(this._dedupeWindow.get(dedupeKey).timer);
    }
    
    // 延迟500ms写入，如果期间有新事件则覆盖
    const timer = setTimeout(() => {
      this._dedupeWindow.delete(dedupeKey);
      this.emit(type, payload, source); // 实际写入
    }, this.DEDUPE_MS);
    
    this._dedupeWindow.set(dedupeKey, { timer, event: { type, payload, source } });
  }
  
  /**
   * 批量变更场景使用（如git push）：收集所有文件变更，合并为1个批量事件
   */
  emitBatch(events, source) {
    if (events.length === 0) return;
    if (events.length === 1) return this.emit(events[0].type, events[0].payload, source);
    
    // 按type分组
    const groups = {};
    for (const evt of events) {
      if (!groups[evt.type]) groups[evt.type] = [];
      groups[evt.type].push(evt.payload);
    }
    
    // 每组emit一个批量事件
    for (const [type, payloads] of Object.entries(groups)) {
      this.emit(type, {
        batch: true,
        count: payloads.length,
        items: payloads,
        first_item: payloads[0],
        batch_timestamp: Date.now()
      }, source);
    }
  }
}
```

### 8.7.3 消费者限流实现

```javascript
// infrastructure/dispatcher/rate-limiter.js

class HandlerRateLimiter {
  constructor() {
    this._windows = new Map(); // handlerName → [{timestamp}, ...]
    this.MAX_PER_WINDOW = 5;   // 每10秒最多5次
    this.WINDOW_MS = 10000;     // 10秒窗口
  }
  
  /**
   * 检查handler是否允许执行
   * @returns {boolean} true=允许, false=限流
   */
  allow(handlerName, eventType) {
    const key = `${handlerName}:${eventType}`;
    const now = Date.now();
    
    if (!this._windows.has(key)) this._windows.set(key, []);
    const window = this._windows.get(key);
    
    // 清除过期的时间戳
    while (window.length > 0 && window[0] < now - this.WINDOW_MS) {
      window.shift();
    }
    
    if (window.length >= this.MAX_PER_WINDOW) {
      console.warn(`Rate limited: ${handlerName} for ${eventType} (${window.length}/${this.MAX_PER_WINDOW} in ${this.WINDOW_MS}ms)`);
      return false; // 限流
    }
    
    window.push(now);
    return true;
  }
}

module.exports = { HandlerRateLimiter };
```

### 8.7.4 git push风暴场景示例

```
场景：一次git push修改了 skills/ 下20个文件

无风暴抑制（v4.1）：
  20个 skill.lifecycle.updated 事件
  → 20次 dispatcher 路由
  → 可能触发 20次 L2扫描
  → 事件数：20 + 20 = 40
  → handler执行：40次

有风暴抑制（v4.2）：
  Level 1 去重：20个事件在500ms窗口内去重
  → 但不同文件objectId不同，不会去重
  
  Level 2 批量合并：20个同类型事件合并为1个batch事件
  → batch: { type: "skill.lifecycle.updated", count: 20, items: [...] }
  → 事件数：1
  
  Level 3 限流：即使batch未启用，handler 10秒内最多执行5次
  → 最坏情况：5次执行 + 15个排队
  
  实际事件数：1-5（vs 原来的40）
  handler执行：1-5次（vs 原来的40次）
```

### 8.7.5 git hook批量emit适配

```javascript
// .git/hooks/post-commit — 适配批量emit

const bus = require('/root/.openclaw/workspace/infrastructure/event-bus/bus.js');
const { execSync } = require('child_process');

// 获取本次commit修改的文件列表
const files = execSync('git diff-tree --no-commit-id --name-only -r HEAD', { encoding: 'utf8' })
  .split('\n')
  .filter(f => f.trim());

// 收集所有变更事件
const events = files.map(file => {
  const noun = deriveNounFromPath(file); // skills/ → skill.lifecycle, infrastructure/ → infra.*
  return {
    type: `${noun}.updated`,
    payload: { file_path: file, commit: process.env.GIT_COMMIT || 'unknown' }
  };
});

// 批量emit（合并同类型）
bus.emitBatch(events, 'git-hook');
```

---

## 第八·八部分：端到端运行时Trace ★v4.2新增

> **问题**：缺少从用户消息到最终执行结果的全链路追踪。无法回答"这个规则是被什么事件触发的？走了哪些handler？最终结果是什么？"

### 8.8.1 Trace数据模型

```javascript
// 每个事件链共享一个trace_id，贯穿全链路

const traceEvent = {
  trace_id: "trc_1709561234_abc",     // 全链路追踪ID
  span_id: "spn_001",                  // 当前span
  parent_span_id: "spn_000",           // 父span（形成因果树）
  
  // 事件基本信息
  event_id: "evt_xxx",
  event_type: "user.intent.file_request.inferred",
  layer: "L3",
  
  // span信息
  operation: "handler.execute",        // 操作名
  component: "intent-dispatcher",      // 组件名
  status: "success",                   // success|error|timeout
  
  // 时序
  start_ms: 1709561234000,
  end_ms: 1709561234150,
  duration_ms: 150,
  
  // 因果链
  caused_by: "evt_yyy",                // 触发本事件的上游事件
  triggers: ["evt_zzz", "evt_www"]     // 本事件触发的下游事件
};
```

### 8.8.2 Trace注入点

```javascript
// infrastructure/event-bus/bus.js — emit时自动注入trace

class EventBus {
  emit(type, payload, source, parentTraceId = null) {
    const traceId = parentTraceId || this.generateTraceId();
    const spanId = this.generateSpanId();
    
    const event = {
      id: this.generateId(),
      type,
      payload,
      source,
      timestamp: Date.now(),
      metadata: {
        ...payload.metadata,
        trace_id: traceId,
        span_id: spanId,
        parent_span_id: parentTraceId ? payload.metadata?.span_id : null
      }
    };
    
    fs.appendFileSync(this.eventsFile, JSON.stringify(event) + '\n');
    return { eventId: event.id, traceId, spanId };
  }
  
  generateTraceId() {
    return `trc_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
  }
  
  generateSpanId() {
    return `spn_${Math.random().toString(36).substr(2, 8)}`;
  }
}

// infrastructure/dispatcher/dispatcher.js — handler执行时传递trace

class Dispatcher {
  async dispatch(event) {
    const traceId = event.metadata?.trace_id;
    const parentSpanId = event.metadata?.span_id;
    
    const route = this.matchRoute(event.type);
    if (!route) return;
    
    // 创建handler执行的span
    const handlerSpanId = bus.generateSpanId();
    const startMs = Date.now();
    
    try {
      const result = await this.executeHandler(route.handler, event);
      
      // 记录handler span到trace日志
      this.logTrace({
        trace_id: traceId,
        span_id: handlerSpanId,
        parent_span_id: parentSpanId,
        operation: `handler.${route.handler}`,
        component: route.handler,
        status: 'success',
        start_ms: startMs,
        end_ms: Date.now(),
        duration_ms: Date.now() - startMs,
        event_id: event.id,
        event_type: event.type
      });
      
      return result;
    } catch (error) {
      this.logTrace({
        trace_id: traceId,
        span_id: handlerSpanId,
        parent_span_id: parentSpanId,
        operation: `handler.${route.handler}`,
        component: route.handler,
        status: 'error',
        error: error.message,
        start_ms: startMs,
        end_ms: Date.now(),
        duration_ms: Date.now() - startMs,
        event_id: event.id,
        event_type: event.type
      });
      throw error;
    }
  }
  
  logTrace(span) {
    const fs = require('fs');
    const traceFile = path.join(__dirname, '../../infrastructure/event-bus/traces.jsonl');
    fs.appendFileSync(traceFile, JSON.stringify(span) + '\n');
  }
}
```

### 8.8.3 完整端到端Trace示例：R73源文件交付

```
Trace ID: trc_m1a2b3_xyz

[00.000s] SPAN-1: message-hook
  ├── 操作: emit interaction.message.received
  ├── 输入: 用户消息 "发MD源文件"
  ├── 输出: event_id=evt_001
  └── 组件: message-hook

[00.005s] SPAN-2: cras-fast-channel.scan (触发: SPAN-1)
  ├── 操作: 正则匹配 /发.*源文件/
  ├── 匹配: INTENT_PATTERNS.file_request
  ├── 置信度: 0.95 (正则精确匹配)
  ├── 输出: emit user.intent.file_request.inferred (event_id=evt_002)
  └── 组件: conversation-probe.js

[00.010s] SPAN-3: dispatcher.route (触发: SPAN-2)
  ├── 操作: 匹配路由 user.intent.* → intent-dispatcher
  ├── 路由: routes.json["user.intent.*"]
  └── 组件: dispatcher.js

[00.015s] SPAN-4: intent-dispatcher.handle (触发: SPAN-3)
  ├── 操作: 识别file_request意图 → 查找对应文件 → 发送
  ├── 规则: R73 源文件交付
  ├── 行动: message(action=send, filePath=..., filename=..., caption=...)
  ├── 结果: 文件发送成功
  ├── 输出: emit interaction.message.sent (event_id=evt_003)
  └── 组件: handlers/intent-dispatcher.js

[00.150s] SPAN-5: result-feedback (触发: SPAN-4)
  ├── 操作: 记录执行成功
  ├── 输出: emit dispatcher.handler.completed
  └── 组件: dispatcher.js

全链路耗时: 150ms
事件链: evt_001 → evt_002 → evt_003
层级跨越: L1(消息到达) → L3(意图识别) → L1(消息发送)
handler调用: 1次 (intent-dispatcher)
结果: ✅ 成功，用户收到文件
```

### 8.8.4 Trace查询工具

```javascript
// scripts/trace-query.js — 命令行trace查询

// 用法: node trace-query.js --trace trc_m1a2b3_xyz
// 输出: 完整的因果树+时序图

function queryTrace(traceId) {
  const fs = require('fs');
  const traceFile = '/root/.openclaw/workspace/infrastructure/event-bus/traces.jsonl';
  
  const spans = fs.readFileSync(traceFile, 'utf8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l))
    .filter(s => s.trace_id === traceId)
    .sort((a, b) => a.start_ms - b.start_ms);
  
  if (spans.length === 0) {
    console.log(`No trace found: ${traceId}`);
    return;
  }
  
  console.log(`\n=== Trace: ${traceId} ===`);
  console.log(`Spans: ${spans.length}`);
  console.log(`Duration: ${spans[spans.length - 1].end_ms - spans[0].start_ms}ms`);
  console.log(`Status: ${spans.some(s => s.status === 'error') ? '❌ FAILED' : '✅ SUCCESS'}\n`);
  
  // 打印时序
  const baseTime = spans[0].start_ms;
  for (const span of spans) {
    const offset = span.start_ms - baseTime;
    const indent = span.parent_span_id ? '  └── ' : '';
    const status = span.status === 'error' ? '❌' : '✅';
    console.log(`[${offset}ms] ${indent}${status} ${span.operation} (${span.duration_ms}ms) → ${span.event_type || ''}`);
    if (span.error) console.log(`         ERROR: ${span.error}`);
  }
}
```

---

## 第八·九部分：消息钩子精确集成方案 ★v4.2新增

> **v4.1遗留**：消息钩子代码示例清晰（20行），但"加在哪个文件"未回答。本节给出三种可行方案和优先级。

### 8.9.1 方案A：OpenClaw Extension机制（推荐）

OpenClaw支持`/usr/lib/node_modules/openclaw/extensions/`目录下的扩展。消息钩子可以作为extension实现。

```
文件位置: /usr/lib/node_modules/openclaw/extensions/message-hook/
├── index.js          # 扩展入口
├── package.json
└── README.md
```

```javascript
// /usr/lib/node_modules/openclaw/extensions/message-hook/index.js

module.exports = function messageHookExtension(openclaw) {
  // 注册消息处理中间件
  openclaw.on('message:received', (message) => {
    const bus = require('/root/.openclaw/workspace/infrastructure/event-bus/bus.js');
    bus.emit('interaction.message.received', {
      role: 'user',
      content_excerpt: message.content?.substring(0, 500) || '',
      content_hash: require('crypto').createHash('md5').update(message.content || '').digest('hex'),
      timestamp: Date.now(),
      session_id: message.session_id || 'unknown',
      channel: message.channel || 'unknown',
      message_id: message.id || `msg_${Date.now()}`
    }, 'message-hook');
  });
  
  openclaw.on('message:sent', (message) => {
    const bus = require('/root/.openclaw/workspace/infrastructure/event-bus/bus.js');
    bus.emit('interaction.message.sent', {
      role: 'agent',
      content_excerpt: message.content?.substring(0, 200) || '',
      timestamp: Date.now(),
      session_id: message.session_id || 'unknown',
      channel: message.channel || 'unknown'
    }, 'message-hook');
  });
};
```

**验证步骤**：
1. 检查OpenClaw是否支持`on('message:received')`事件钩子
2. 如果支持 → 方案A直接可用
3. 如果不支持 → 使用方案B

### 8.9.2 方案B：AGENTS.md指令 + Heartbeat（降级方案）

如果OpenClaw不支持消息中间件扩展，使用Agent自身的行为约束：

**在AGENTS.md中添加指令**：

```markdown
## 消息事件钩子（强制执行）

每次收到用户消息时，在处理消息之前，先执行：
\`\`\`javascript
const bus = require('/root/.openclaw/workspace/infrastructure/event-bus/bus.js');
bus.emit('interaction.message.received', {
  role: 'user',
  content_excerpt: message.content.substring(0, 500),
  timestamp: Date.now(),
  channel: 'feishu'  // 或当前channel
}, 'agent-self-hook');
\`\`\`

这不是可选的。这是L3层CRAS探针的数据源。
```

**局限性**：依赖LLM执行一致性。实测大概率有效（>90%），但不是100%保证。

**补偿机制**：heartbeat每30分钟检查最近消息是否都已emit。如果遗漏，补充emit。

### 8.9.3 方案C：Heartbeat轮询（最弱方案）

每5分钟heartbeat检查是否有新消息（通过sessions_history）。

**局限性**：5分钟延迟，且sessions_history是否对heartbeat可用需要验证。

### 8.9.4 推荐实施顺序

```
1. 先验证方案A（Extension机制）→ 如果可行，最优
   验证命令: ls /usr/lib/node_modules/openclaw/extensions/ && grep -r "on.*message" /usr/lib/node_modules/openclaw/lib/
   
2. 方案A不可行 → 用方案B（AGENTS.md指令）作为过渡
   立即可用，零改动成本
   
3. 方案B执行一致性<80% → 加方案C兜底
   heartbeat补偿遗漏的消息事件
```

---

## 第八·十部分：semanticSimilarity实现方案 ★v4.2新增

> **v4.1遗留**：名词去重中使用了`semanticSimilarity()`但未定义实现。如果用LLM实现，在O(n²)循环中会导致成本爆炸。

### 8.10.1 实现方案：TF-IDF向量余弦相似度（本地计算，零API成本）

```javascript
// infrastructure/event-bus/semantic-similarity.js

/**
 * 基于TF-IDF向量余弦相似度的本地语义相似度计算
 * 零API成本，纯CPU计算，适用于O(n²)循环
 */
class SemanticSimilarity {
  constructor() {
    this._idfCache = null;
  }
  
  /**
   * 计算两个文本描述的语义相似度
   * @param {string} text1 - 第一个文本
   * @param {string} text2 - 第二个文本
   * @returns {number} 相似度 0-1
   */
  similarity(text1, text2) {
    const vec1 = this.tfidfVector(text1);
    const vec2 = this.tfidfVector(text2);
    return this.cosineSimilarity(vec1, vec2);
  }
  
  /**
   * 将文本转为TF-IDF向量
   */
  tfidfVector(text) {
    const words = this.tokenize(text);
    const tf = {};
    for (const w of words) {
      tf[w] = (tf[w] || 0) + 1;
    }
    // 归一化TF
    const maxTf = Math.max(...Object.values(tf));
    const vector = {};
    for (const [word, count] of Object.entries(tf)) {
      vector[word] = (count / maxTf) * this.idf(word);
    }
    return vector;
  }
  
  /**
   * IDF = log(总文档数 / 包含该词的文档数)
   * 这里用全部名词描述作为"文档集"
   */
  idf(word) {
    // 简化：使用默认IDF（所有词权重相同）
    // 在实际使用中，可以预计算全部名词描述的IDF
    return 1.0;
  }
  
  /**
   * 余弦相似度
   */
  cosineSimilarity(vec1, vec2) {
    const allKeys = new Set([...Object.keys(vec1), ...Object.keys(vec2)]);
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (const key of allKeys) {
      const v1 = vec1[key] || 0;
      const v2 = vec2[key] || 0;
      dotProduct += v1 * v2;
      norm1 += v1 * v1;
      norm2 += v2 * v2;
    }
    
    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
  
  /**
   * 分词：中英混合分词
   */
  tokenize(text) {
    // 英文：按空格/标点分割，转小写
    // 中文：按字符（2-gram）
    const tokens = [];
    const cleaned = text.toLowerCase().replace(/[^\w\u4e00-\u9fff]/g, ' ');
    
    // 英文token
    for (const word of cleaned.split(/\s+/)) {
      if (word.length >= 2 && /^[a-z]/.test(word)) {
        tokens.push(word);
      }
    }
    
    // 中文2-gram
    const chinese = cleaned.replace(/[a-z0-9\s_]/g, '');
    for (let i = 0; i < chinese.length - 1; i++) {
      tokens.push(chinese.substring(i, i + 2));
    }
    
    return tokens;
  }
}

// 导出全局单例
const semanticSim = new SemanticSimilarity();

/**
 * 全局函数：计算两个文本的语义相似度
 * 使用场景：名词去重（2.8.2节）
 */
function semanticSimilarity(text1, text2) {
  return semanticSim.similarity(text1, text2);
}

module.exports = { SemanticSimilarity, semanticSimilarity };
```

### 8.10.2 性能分析

| 名词数量 | 比较次数(n²) | 每次计算耗时 | 总耗时 |
|---------|-------------|------------|--------|
| 60 | 1,770 | ~0.1ms | ~0.18s |
| 200 | 19,900 | ~0.1ms | ~2s |
| 500 | 124,750 | ~0.1ms | ~12.5s |
| 1000 | 499,500 | ~0.1ms | ~50s |

**500个名词以内（对应3000条规则）完全可接受**。超过500个名词时，可优化为：
1. 预计算所有描述的TF-IDF向量（O(n)）
2. 余弦相似度计算仍为O(n²)，但向量已缓存
3. 或引入LSH（局部敏感哈希）将O(n²)降为O(n)

### 8.10.3 名词去重代码修正

```javascript
// 2.8.2节的detectDuplicateNouns修正版（引入实现）
const { semanticSimilarity } = require('./semantic-similarity.js');

function detectDuplicateNouns(registry) {
  const duplicates = [];
  const nouns = registry.getAll();
  
  for (let i = 0; i < nouns.length; i++) {
    for (let j = i + 1; j < nouns.length; j++) {
      // 1. 编辑距离检测（Levenshtein distance <= 2）
      if (levenshtein(nouns[i].noun, nouns[j].noun) <= 2) {
        duplicates.push({ a: nouns[i], b: nouns[j], reason: 'similar_name' });
      }
      // 2. 语义相似检测（同domain下含义重叠，使用TF-IDF向量余弦相似度）
      if (nouns[i].noun.split('.')[0] === nouns[j].noun.split('.')[0] &&
          semanticSimilarity(nouns[i].description, nouns[j].description) > 0.8) {
        duplicates.push({ a: nouns[i], b: nouns[j], reason: 'semantic_overlap' });
      }
    }
  }
  return duplicates;
}
```

---

## 第八·十一部分：DTO双写去重 + Subscription迁移 ★v4.2新增

> **v4.1遗留**：(1) 双写阶段重复处理风险未解决 (2) 40+个subscription JSON文件的迁移路径缺失

### 8.11.1 双写阶段去重机制

```javascript
// 双写期间，JSONL bus中的事件携带迁移标记
// 已有的EventEmitter消费者忽略此标记的事件

// infrastructure/event-bus/bus.js — 双写emit
function emitDualWrite(type, payload, source) {
  // 写JSONL bus（新）
  const event = {
    id: generateId(),
    type,
    payload: { ...payload, _migration_phase: 'dual-write' },
    source,
    timestamp: Date.now()
  };
  fs.appendFileSync(EVENTS_FILE, JSON.stringify(event) + '\n');
  
  // 同时写EventEmitter（旧）— 不加_migration_phase标记
  internalEmitter.emit(type, payload);
}

// dto-core/core/event-bus.js — EventEmitter消费者检查
class DTOEventBus {
  on(type, handler) {
    // 包装handler：如果事件来自JSONL双写，跳过
    const wrappedHandler = (payload) => {
      if (payload._migration_phase === 'dual-write') {
        return; // 跳过JSONL桥接过来的事件，避免重复处理
      }
      handler(payload);
    };
    this._emitter.on(type, wrappedHandler);
  }
}
```

### 8.11.2 Subscription JSON → RuntimeBinder迁移

**现状**：`dto-core/subscriptions/`下有40+个静态JSON文件，格式如：

```json
{
  "subscription_id": "sub_isc_rule_created",
  "event_type": "isc.rule.created",
  "handler": "isc-sync-handler",
  "enabled": true
}
```

**迁移策略**：4步渐进迁移

```
Step 1: 生成RuntimeBinder等效配置
  node scripts/migrate-subscriptions.js --dry-run
  → 读取40+个subscription JSON
  → 生成等效的routes.json条目
  → 输出迁移预览（不实际修改）

Step 2: 双重注册
  在routes.json中添加所有subscription的等效路由
  subscription JSON继续保留（双保险）
  RuntimeBinder同时从routes.json和subscription消费

Step 3: 验证
  对比EventEmitter handler和JSONL handler的执行结果
  确认完全一致后，标记subscription为"可删除"

Step 4: 清理
  删除subscription JSON文件
  删除dto-core中的subscription加载逻辑
```

**迁移脚本**：

```javascript
// scripts/migrate-subscriptions.js

const fs = require('fs');
const path = require('path');

const SUBS_DIR = '/root/.openclaw/workspace/skills/dto-core/subscriptions/';
const ROUTES_FILE = '/root/.openclaw/workspace/infrastructure/dispatcher/routes.json';

function migrate(dryRun = true) {
  const routes = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8'));
  const subFiles = fs.readdirSync(SUBS_DIR).filter(f => f.endsWith('.json'));
  
  const newRoutes = {};
  const conflicts = [];
  
  for (const file of subFiles) {
    const sub = JSON.parse(fs.readFileSync(path.join(SUBS_DIR, file), 'utf8'));
    
    if (!sub.enabled) {
      console.log(`SKIP (disabled): ${file}`);
      continue;
    }
    
    const routeKey = sub.event_type;
    
    // 检查是否与现有路由冲突
    if (routes[routeKey]) {
      conflicts.push({ file, event_type: routeKey, existing: routes[routeKey] });
      continue;
    }
    
    newRoutes[routeKey] = {
      handler: sub.handler,
      agent: sub.agent || 'main',
      priority: sub.priority || 'normal',
      description: `Migrated from subscription: ${file}`,
      _migrated_from: file,
      _migration_date: new Date().toISOString()
    };
  }
  
  console.log(`\nMigration Summary:`);
  console.log(`  Total subscription files: ${subFiles.length}`);
  console.log(`  New routes to add: ${Object.keys(newRoutes).length}`);
  console.log(`  Conflicts (manual review): ${conflicts.length}`);
  
  if (conflicts.length > 0) {
    console.log(`\nConflicts:`);
    for (const c of conflicts) {
      console.log(`  ${c.file}: ${c.event_type} already routed to ${c.existing.handler}`);
    }
  }
  
  if (!dryRun) {
    const merged = { ...routes, ...newRoutes };
    fs.writeFileSync(ROUTES_FILE, JSON.stringify(merged, null, 2));
    console.log(`\nRoutes updated: ${ROUTES_FILE}`);
  } else {
    console.log(`\nDry run complete. Run with --execute to apply.`);
    console.log(`New routes preview:`);
    console.log(JSON.stringify(newRoutes, null, 2));
  }
}

const dryRun = !process.argv.includes('--execute');
migrate(dryRun);
```

---

## 第八·十二部分：事件反馈环防护 ★v4.2新增

> **v4.1遗留**：消息钩子可能引入事件反馈环。用户消息→CRAS检测→handler执行→Agent回复→消息钩子→CRAS再检测→无限循环。

### 8.12.1 三层反馈环防护

```
┌──────────────────────────────────────────────────────────────────────┐
│                     反馈环防护三层                                    │
│                                                                      │
│  Layer 1: 源头过滤                                                   │
│  消息钩子只emit role=user的消息                                      │
│  Agent自己的回复不进入事件总线                                        │
│                                                                      │
│  Layer 2: 事件去重                                                   │
│  同一消息ID在5分钟内不重复emit                                       │
│                                                                      │
│  Layer 3: 深度限制                                                   │
│  事件链深度 > 5 时强制终止                                           │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 8.12.2 实现代码

```javascript
// infrastructure/event-bus/feedback-guard.js

class FeedbackGuard {
  constructor() {
    this._recentMessages = new Map(); // messageId → timestamp
    this.DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5分钟去重窗口
    this.MAX_CHAIN_DEPTH = 5;              // 最大事件链深度
  }
  
  /**
   * 检查消息是否应该被emit到事件总线
   * @param {Object} message - 消息对象
   * @returns {boolean} true=允许emit, false=拦截
   */
  shouldEmit(message) {
    // Layer 1: 只处理用户消息
    if (message.role !== 'user') {
      return false; // Agent回复不进入事件总线
    }
    
    // Layer 2: 消息去重
    const messageId = message.id || message.content_hash;
    if (this._recentMessages.has(messageId)) {
      return false; // 5分钟内已处理过
    }
    this._recentMessages.set(messageId, Date.now());
    
    // 清理过期的去重记录
    this.cleanup();
    
    return true;
  }
  
  /**
   * 检查事件链深度是否超限
   * @param {Object} event - 事件对象
   * @returns {boolean} true=允许继续, false=终止链
   */
  checkChainDepth(event) {
    const depth = event.metadata?.chain_depth || 0;
    if (depth >= this.MAX_CHAIN_DEPTH) {
      console.warn(`Feedback loop protection: chain depth ${depth} >= ${this.MAX_CHAIN_DEPTH}, terminating chain`);
      bus.emit('system.feedback_loop.terminated', {
        chain_depth: depth,
        last_event: event.id,
        event_type: event.type
      }, 'feedback-guard');
      return false;
    }
    return true;
  }
  
  cleanup() {
    const now = Date.now();
    for (const [id, ts] of this._recentMessages) {
      if (now - ts > this.DEDUP_WINDOW_MS) {
        this._recentMessages.delete(id);
      }
    }
  }
}

module.exports = { FeedbackGuard };
```

### 8.12.3 集成到消息钩子

```javascript
// 消息钩子 — 集成反馈环防护
const { FeedbackGuard } = require('./feedback-guard.js');
const guard = new FeedbackGuard();

function messageHook(message, direction) {
  // 只在received方向处理（sent方向不emit到事件总线）
  if (direction !== 'received') return;
  
  // 反馈环防护
  if (!guard.shouldEmit(message)) return;
  
  const bus = require('./infrastructure/event-bus/bus.js');
  bus.emit('interaction.message.received', {
    role: 'user',
    content_excerpt: message.content.substring(0, 500),
    content_hash: require('crypto').createHash('md5').update(message.content).digest('hex'),
    timestamp: Date.now(),
    session_id: message.session_id,
    channel: message.channel,
    message_id: message.id
  }, 'message-hook');
}
```

### 8.12.4 事件链深度传递

```javascript
// dispatcher.js — 传递chain_depth

class Dispatcher {
  async dispatch(event) {
    // 检查链深度
    if (!feedbackGuard.checkChainDepth(event)) return;
    
    const route = this.matchRoute(event.type);
    if (!route) return;
    
    const result = await this.executeHandler(route.handler, event);
    
    // 如果handler产生新事件，增加chain_depth
    if (result?.emittedEvents) {
      for (const newEvent of result.emittedEvents) {
        newEvent.metadata = newEvent.metadata || {};
        newEvent.metadata.chain_depth = (event.metadata?.chain_depth || 0) + 1;
      }
    }
  }
}
```

---

## 附录E：v4.1 → v4.2 变更总结 ★v4.2新增

| 变更 | 来源 | 类型 | 影响 |
|------|------|------|------|
| 修正L2数据矛盾：9.2节52条→38条 | 质量分析师 | 数据修正 | Section 9.2 |
| 修正残留旧命名：第1214行 | 质量分析师 | 文本修正 | Section 5.4 |
| 修正require路径：2处`../infrastructure/`→`../` | 工程师 | Bug修复 | Section 7.2, 8.2 |
| 修正快通道置信度：0.8→0.95 | 质量分析师 | 数值修正 | Section 5.2 |
| 填充10+处空壳函数实现 | 质量分析师 | 实现补齐 | 多处 |
| 新增容灾/降级/回滚设计 | 质量分析师 | 全新章节 | Part 8.6 |
| 新增事件风暴抑制机制 | 质量分析师+工程师 | 全新章节 | Part 8.7 |
| 新增端到端Trace | 质量分析师 | 全新章节 | Part 8.8 |
| 新增消息钩子精确集成 | 工程师 | 全新章节 | Part 8.9 |
| 新增semanticSimilarity实现 | 工程师 | 全新章节 | Part 8.10 |
| 新增DTO双写去重+subscription迁移 | 工程师 | 全新章节 | Part 8.11 |
| 新增事件反馈环防护 | 工程师 | 全新章节 | Part 8.12 |

### v4.2评分预期

| 维度 | v4.1分 | v4.2预期 | 变化理由 |
|------|--------|---------|---------|
| 第一性原理 | 7.0 | 7.5 | 事件风暴抑制 + 反馈环防护体现了对边界条件的深入思考 |
| 可扩展性 | 7.5 | 8.0 | semanticSimilarity的O(n²)有了具体实现和优化路径 |
| 规则事件拆解 | 7.0 | 8.0 | 数据矛盾修复 + 置信度合理化 + 残留命名清理 |
| 闭环完整性 | 7.0 | 8.5 | 端到端Trace + 容灾降级 = 闭环不仅完整而且可观测可恢复 |
| 反熵增 | 7.5 | 8.0 | 事件风暴抑制=防止事件空间的熵增失控 |
| 自驱进化 | 7.0 | 7.5 | 空壳函数填充 = 进化探针从"设计"变为"可执行" |
| 凌霄阁审议 | 7.0 | 7.5 | 降级方案（LLM不可用时退化为人工审批） |
| 用户教学对齐 | 6.5 | 7.5 | 完整trace示例让用户看到从消息到执行的全链路 |

**加权预期总分**：~7.9-8.2

---

## 附录F：v4.2 → v4.3 变更总结 ★v4.3新增

| 变更 | 来源 | 类型 | 影响 |
|------|------|------|------|
| 新增"第零部分：分层架构原则"（感知/认知/执行三层解耦） | 用户明确指定 | **架构元原则** | Part 0 |
| 全子系统三层归属总览表（5层×3层+核心子系统） | 架构分析 | 核心标注 | 0.3 |
| 意图系统三层详解（感知=CRAS快通道，认知=LLM+注册表，执行=AEO治理） | 用户明确指定 | 核心标注 | 0.3.3 |
| 三层归属检查清单（新设计准入门禁） | 架构设计 | 治理机制 | 0.4 |
| 三层与五层正交关系说明 | 架构分析 | 认知对齐 | 0.5 |
| 新增"第五·一部分：意图-事件识别与映射体系" | 用户明确指定 | 全新章节 | Part 5A |
| 五类意图收敛模型（IC1-IC5）+ MECE证明 | 用户明确指定 | 核心设计 | 5A.2 |
| intent-registry.json 意图注册表完整Schema | 架构设计 | 核心设计 | 5A.3 |
| CRAS IntentScanner识别引擎（LLM=引擎） | 用户明确指定 | 核心实现 | 5A.4 |
| AEO未知意图发现流程（向量聚类→LLM→MECE→注册） | 用户明确指定 | 核心实现 | 5A.5 |
| AEO意图治理handler（DBSCAN+MECE校验+注册） | 架构设计 | 完整实现 | 5A.5.3 |
| 反熵增意图生命周期状态机 | 用户明确指定 | 治理机制 | 5A.6 |
| AEO准出三重门禁（黄金评测集+准确率+Badcase） | 用户明确指定 | 质量门禁 | 5A.7 |
| 架构归属明确：CRAS识别 / AEO治理 | 用户补充指定 | 架构决策 | 5A.1 |
| 推导算法12个判断函数完整实现 | 质量报告P0 | 阻断项修复 | Section 2.6 |
| bus.consume() type_filter/since完整实现 | 质量报告P0 | 阻断项修复 | Section 8.5.2 |
| Dispatcher loadHandler/matchRoute完整实现 | 质量报告P1 | 阻断项修复 | Part 8.13 |
| 路由四级优先级策略（精确>前缀>后缀>全通配） | 架构设计 | 核心实现 | 8.13.1 |
| Handler接口契约 + 约定式加载 | 架构设计 | 核心实现 | 8.13.3 |
| 新增9个设计决策记录（D19-D27） | 多来源 | 决策记录 | 第十二部分 |
| 新增D28三层解耦架构元原则 | 用户明确指定 | 决策记录 | 第十二部分 |

### v4.3评分预期

| 维度 | v4.2分 | v4.3预期 | 变化理由 |
|------|--------|---------|---------|
| 第一性原理 | 7.5 | 8.0 | 五类意图收敛模型+MECE证明体现了穷尽分类的第一性原理思维 |
| 可扩展性 | 8.0 | **8.5** | 推导算法12函数不再黑箱→3000+规则自动推导承诺可兑现 |
| 规则事件拆解 | 7.5 | **8.5** | 推导算法+intent-registry联动→L3事件拆解从人工标注升级为算法驱动 |
| 闭环完整性 | 8.5 | **9.0** | bus.consume()补完+Dispatcher路由引擎→事件从产生到消费的最后一公里打通 |
| 反熵增 | 8.0 | **8.5** | 意图生命周期状态机（active→dormant→deprecated→retired）+MECE治理 |
| 自驱进化 | 7.5 | 8.0 | AEO未知意图发现→意图类型可自主增长（但受MECE约束） |
| 凌霄阁审议 | 7.5 | 7.5 | 不变 |
| 用户教学对齐 | 7.5 | **8.5** | 意图识别体系完全遵循用户五原则（轻量/五类/LLM引擎/AEO治理/不做RAG） |

**加权预期总分**：~8.3-8.5

---

*v4.3.0 — 五层事件认知模型，意图识别体系 + 三阻断项修复 + 分层架构元原则版。*
*v4.3变更内容：分层架构元原则（感知/认知/执行三层解耦，全子系统归属标注，新设计准入门禁）、意图-事件识别与映射体系（CRAS识别+AEO治理，五类收敛+未知意图发现+反熵增治理+AEO准出门禁）、推导算法12个判断函数从黑箱到完整实现、bus.consume() type_filter/since/layer/limit完整支持、Dispatcher四级优先级路由引擎+约定式handler加载。*
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

**文档**: isc-event-dto-binding-design-v4
**生成时间**: 2026-03-06T13:01:12.505Z
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
