# CRAS-E 持续进化中枢 — 架构设计文档

> **版本**: v1.0.0  
> **日期**: 2026-03-08  
> **作者**: 质量仲裁官（Reviewer Agent / claude-opus-4-6-thinking）  
> **状态**: 架构设计初稿，待裁决殿裁决

---

## 一、现状盘点

### 1.1 CRAS 现有模块清单

| 模块 | 文件 | 职责 | 当前问题 |
|:-----|:-----|:-----|:---------|
| **A: 主动学习引擎** | `index.js` (ActiveLearningEngine) | 定时联网学习、论文追踪 | 定时触发，非持续感知；搜索工具在独立进程不可用 |
| **B: 用户洞察分析** | `insight-enhancer.js`, `cras-b-fixed.js` | 每30min用户交互分析 | 批处理模式，非实时；分析与感知耦合 |
| **C: 知识治理** | `knowledge/`, `knowledge-graph/`, `modules/vectorization-optimized.js` | 向量化、分类、去重 | 无过期淘汰机制；去重靠文件名 |
| **D: 战略行研** | `index.js` (ResearchEngine) | 竞品分析、行业调研 | 手动触发为主 |
| **E: 自主进化** | `rule-suggester.js`, `evolution-links/` | 规则建议、技能进化 | 无闭环验证；建议堆积无消费 |
| **意图提取（快路）** | `intent-extractor-inline.js` | 每条消息实时提取意图 | 已实现但未集成到事件总线闭环 |
| **意图提取（慢路）** | `intent-extractor.js` | 批量增量扫描意图 | cron模式，无5min快通道 |
| **事件桥** | `event-bridge.js` | 消费AEO/本地任务编排/error事件生成洞察 | 仅消费三类事件，覆盖面窄 |
| **规则建议器** | `rule-suggester.js` | 从洞察提取ISC规则建议 | 建议写入后无自动审核流程 |
| **云存储集成** | `cloud-storage/` | 飞书/Notion文档同步 | 功能存在但未与主流程集成 |

### 1.2 核心问题诊断

1. **"定时任务跑一下"模式**：所有模块都是 cron 触发，缺乏事件驱动的持续感知能力
2. **感知-认知-执行未分层**：意图提取（感知）、趋势分析（认知）、规则建议（执行）混在同一模块
3. **知识只进不出**：insights/knowledge 目录不断膨胀（80+ insight文件，30+ knowledge文件），无淘汰机制
4. **进化信号丢失**：对话中的教学/纠偏、系统错误、公网新知等信号未统一采集
5. **缺乏自我评估**：无法衡量自身进化效果，无 Benchmark 追踪

---

## 二、CRAS-E 持续进化架构

### 2.1 架构总览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CRAS-E 持续进化中枢                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     感知层 (Perception)                          │   │
│  │                                                                   │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │   │
│  │  │ 快通道        │  │ 对话流探针    │  │ 系统事件监听器         │  │   │
│  │  │ 5min增量扫描  │  │ 实时意图Hook  │  │ error/aeo/lto/git     │  │   │
│  │  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘  │   │
│  │         │                  │                       │              │   │
│  │         ▼                  ▼                       ▼              │   │
│  │  ┌─────────────────────────────────────────────────────────────┐  │   │
│  │  │              事件总线 (Event Bus)                            │  │   │
│  │  │  intent.*, learning.*, system.error, knowledge.discovery.*  │  │   │
│  │  └─────────────────────────┬───────────────────────────────────┘  │   │
│  └────────────────────────────┼──────────────────────────────────────┘   │
│                               │                                          │
│  ┌────────────────────────────▼──────────────────────────────────────┐   │
│  │                     认知层 (Cognition)                             │   │
│  │                                                                    │   │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐  │   │
│  │  │ 意图趋势分析器    │  │ 自主学习引擎      │  │ 进化评估器      │  │   │
│  │  │ (慢通道/daily)    │  │ 对话+公网+错误    │  │ Benchmark追踪   │  │   │
│  │  └────────┬─────────┘  └────────┬─────────┘  └────────┬───────┘  │   │
│  │           │                      │                      │         │   │
│  │           ▼                      ▼                      ▼         │   │
│  │  ┌──────────────────────────────────────────────────────────────┐ │   │
│  │  │                    知识治理引擎                                │ │   │
│  │  │   去重 → 合并 → 质量评分 → 过期淘汰 → 向量化 → 索引更新      │ │   │
│  │  └──────────────────────────┬───────────────────────────────────┘ │   │
│  └─────────────────────────────┼────────────────────────────────────┘   │
│                                │                                         │
│  ┌─────────────────────────────▼────────────────────────────────────┐   │
│  │                     执行层 (Execution)                            │   │
│  │                                                                    │   │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐  │   │
│  │  │ 规则生成器        │  │ 技能进化器        │  │ 报告分发器      │  │   │
│  │  │ ISC规则CRUD      │  │ SKILL.md更新      │  │ 飞书/事件总线   │  │   │
│  │  └──────────────────┘  └──────────────────┘  └────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 四大子系统详细设计

---

#### 子系统 1：快通道（5min 增量扫描）

**定位**：感知层核心，从对话流中提取原子意图事件，实时 emit 到事件总线。

**与现有代码的关系**：
- 复用 `intent-extractor-inline.js` 的 InlineIntentHook 作为实时路径
- 新增 5min 增量扫描作为补漏路径（捕获 inline hook 漏掉的意图）

**数据流**：

```
消息到达 ──→ InlineIntentHook（同步快路）──→ emit intent.detected.*
                                                    │
每5min ──→ IncrementalScanner ──→ 扫描未处理消息 ──→ emit intent.detected.*
                                                    │
                                          ┌─────────▼──────────┐
                                          │ 意图指纹去重器       │
                                          │ (fingerprint dedup) │
                                          └─────────┬──────────┘
                                                    │
                                          emit intent.confirmed.*
```

**接口定义**：

```typescript
// 快通道输出事件
interface IntentEvent {
  type: 'intent.detected.raw';
  payload: {
    intentId: string;          // 唯一ID
    fingerprint: string;       // 语义指纹，用于去重
    category: 'IC1' | 'IC2' | 'IC3' | 'IC4' | 'IC5';  // 意图复杂度
    intentType: string;        // 如 'rule_intent', 'emotion_negative', 'teaching'
    rawText: string;           // 原始文本
    context: string[];         // 前后文（最多5轮）
    source: 'inline_hook' | 'incremental_scan';
    confidence: number;        // 0-1
    timestamp: number;
  };
}

// 去重后确认事件
interface ConfirmedIntentEvent {
  type: 'intent.confirmed';
  payload: IntentEvent['payload'] & {
    dedupStatus: 'new' | 'merged';  // 新意图 or 合并到已有
    mergedWith?: string;             // 合并目标ID
  };
}
```

**关键设计决策**：
- InlineHook 失败不阻塞消息投递（已有此设计，保留）
- 5min 扫描仅处理上次扫描后的增量消息（基于 offset/checkpoint）
- 去重基于语义指纹（文本向量余弦相似度 > 0.92 视为重复）

---

#### 子系统 2：慢通道（Daily 聚合分析）

**定位**：认知层核心，对快通道产出的原子意图进行趋势分析和模式识别。

**数据流**：

```
每日 02:00 触发
      │
      ▼
┌─────────────────────────────────┐
│ 意图聚合器 (IntentAggregator)    │
│                                   │
│ 1. 读取过去24h的 intent.confirmed │
│ 2. 按 intentType 分组统计        │
│ 3. 计算频次/占比/趋势变化        │
│ 4. 识别新兴意图（首次出现）       │
│ 5. 识别衰退意图（频次下降>50%）   │
└───────────────┬─────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│ 模式检测器 (PatternDetector)     │
│                                   │
│ 1. 重复强调检测（同一意图≥3次/日）│
│ 2. 意图升级检测（IC1→IC3趋势）   │
│ 3. 未覆盖意图检测（无规则匹配）   │
│ 4. 关联意图检测（共现分析）       │
└───────────────┬─────────────────┘
                │
                ▼
emit insight.trend.daily
emit insight.pattern.emerging
emit insight.gap.uncovered
```

**接口定义**：

```typescript
interface DailyTrendReport {
  type: 'insight.trend.daily';
  payload: {
    date: string;                // YYYY-MM-DD
    totalIntents: number;
    distribution: Record<string, {
      count: number;
      percentage: number;
      trend: 'rising' | 'stable' | 'declining' | 'new';
      delta: number;             // vs 前一周期
    }>;
    emergingIntents: string[];   // 新兴意图类型列表
    decliningIntents: string[];  // 衰退意图类型列表
    uncoveredIntents: {          // 无ISC规则覆盖的意图
      intentType: string;
      count: number;
      sampleTexts: string[];
    }[];
  };
}
```

---

#### 子系统 3：自主学习引擎

**定位**：认知层，从三个信号源持续提取进化信号。

**三大信号源**：

```
信号源 A：对话流学习
┌──────────────────────────────────────┐
│ 用户教学/纠偏 → teaching.signal      │
│ 用户不满/重复 → frustration.signal   │
│ 新概念/术语   → concept.signal       │
│ 最佳实践示范  → best_practice.signal │
└──────────────────┬───────────────────┘
                   │
信号源 B：公网学习  │
┌──────────────────┼───────────────────┐
│ arXiv/学术论文   │→ paper.signal      │
│ HN/技术社区      │→ trend.signal      │
│ Agent生态动态    │→ ecosystem.signal  │
└──────────────────┼───────────────────┘
                   │
信号源 C：错误学习  │
┌──────────────────┼───────────────────┐
│ API调用失败      │→ api_error.signal  │
│ 意图识别错误     │→ intent_error.sig  │
│ 规则误触发       │→ rule_error.signal │
└──────────────────┼───────────────────┘
                   │
                   ▼
          ┌────────────────┐
          │ 进化信号融合器   │
          │ (SignalFuser)   │
          │                 │
          │ 1. 信号去噪     │
          │ 2. 优先级排序   │
          │ 3. 可行性评估   │
          │ 4. 生成进化任务 │
          └────────┬───────┘
                   │
                   ▼
          emit evolution.task.proposed
```

**接口定义**：

```typescript
interface EvolutionSignal {
  signalId: string;
  source: 'conversation' | 'web' | 'error';
  signalType: string;           // teaching, frustration, paper, api_error, etc.
  content: string;              // 信号内容摘要
  rawEvidence: string[];        // 原始证据
  actionability: 'high' | 'medium' | 'low';
  suggestedAction: {
    type: 'create_rule' | 'update_skill' | 'add_intent' | 'fix_bug' | 'research';
    target: string;             // 目标模块/规则/技能
    description: string;
  };
  timestamp: number;
}

interface EvolutionTask {
  type: 'evolution.task.proposed';
  payload: {
    taskId: string;
    signals: string[];           // 触发此任务的信号ID列表
    priority: 'P0' | 'P1' | 'P2';
    action: EvolutionSignal['suggestedAction'];
    requiresApproval: boolean;   // P0自动执行，P1/P2需审批
    estimatedImpact: string;
  };
}
```

**关键设计决策**：
- 对话流学习：复用 InlineIntentHook，新增 `teaching` / `frustration` 意图类型
- 公网学习：使用 tavily-search（不是 web_search），每日 09:00 执行
- 错误学习：消费事件总线 `system.error.*` 事件，分析错误模式
- P0 级进化任务自动执行（如：新增意图类型），P1/P2 需用户确认

---

#### 子系统 4：知识治理引擎

**定位**：认知层基础设施，确保知识库反熵增。

**治理流程**：

```
┌─────────────────────────────────────────────────────────────────┐
│                       知识治理流水线                              │
│                                                                   │
│  ① 去重                 ② 合并                 ③ 质量评分         │
│  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐    │
│  │语义指纹比对  │  ──→  │相似知识合并  │  ──→  │多维质量打分  │    │
│  │cosine>0.92  │       │保留最优版本  │       │引用/时效/深度│    │
│  └─────────────┘       └─────────────┘       └──────┬──────┘    │
│                                                       │          │
│  ④ 过期淘汰             ⑤ 向量化更新            ⑥ 索引重建       │
│  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐    │
│  │质量分<阈值   │  ←──  │增量向量化    │  ←──  │知识图谱更新  │    │
│  │>90天未引用   │       │智谱Embedding │       │关系链更新    │    │
│  │标记→归档/删除│       │1024维        │       │             │    │
│  └─────────────┘       └─────────────┘       └─────────────┘    │
│                                                                   │
│  触发条件：                                                       │
│  - 定时：每6小时执行一次增量治理                                   │
│  - 事件：knowledge.item.created → 触发去重检查                    │
│  - 阈值：知识库条目 > 500 → 触发全量淘汰扫描                     │
└─────────────────────────────────────────────────────────────────┘
```

**接口定义**：

```typescript
interface KnowledgeItem {
  id: string;
  fingerprint: string;          // 语义指纹
  category: string;             // 分类
  content: string;
  source: string;               // 来源
  qualityScore: number;         // 0-100
  vector: number[];             // 1024维 embedding
  references: number;           // 被引用次数
  createdAt: number;
  lastAccessedAt: number;
  expiresAt: number | null;     // 过期时间，null=永不过期
  status: 'active' | 'archived' | 'deleted';
}

interface GovernanceReport {
  type: 'knowledge.governance.completed';
  payload: {
    timestamp: number;
    totalItems: number;
    duplicatesRemoved: number;
    itemsMerged: number;
    itemsArchived: number;
    itemsExpired: number;
    newItemsIndexed: number;
    averageQualityScore: number;
    healthTrend: 'improving' | 'stable' | 'degrading';
  };
}
```

**淘汰规则**：
| 条件 | 动作 | 说明 |
|:-----|:-----|:-----|
| qualityScore < 30 | 删除 | 低质量知识直接清除 |
| qualityScore < 50 且 > 90天未引用 | 归档 | 低价值且长期未用 |
| 语义重复（cosine > 0.92） | 合并 | 保留质量分更高的版本 |
| 来源已失效 | 标记待验证 | 下次治理时重新验证 |

---

## 三、全局数据流

```
用户消息 ─→ [InlineIntentHook] ─→ intent.detected.raw ─→ [去重器] ─→ intent.confirmed
                                                                           │
每5min ───→ [IncrementalScanner] ─→ intent.detected.raw ──────────────────┘
                                                                           │
每日02:00 ─→ [IntentAggregator] ←── 读取过去24h intent.confirmed ──────────┘
                  │
                  ├─→ insight.trend.daily ──────→ [规则生成器] ─→ ISC规则CRUD
                  ├─→ insight.pattern.emerging ──→ [技能进化器] ─→ SKILL.md更新
                  └─→ insight.gap.uncovered ────→ [进化任务] ──→ DTO调度
                                                                    │
每日09:00 ─→ [公网学习] ─→ learning.signal ─→ [SignalFuser] ────────┤
事件总线  ─→ [错误学习] ─→ error.signal ───→ [SignalFuser] ────────┤
对话流    ─→ [教学检测] ─→ teaching.signal → [SignalFuser] ────────┘
                                                    │
                                          evolution.task.proposed
                                                    │
                                     ┌──────────────┴──────────────┐
                                     │ P0: 自动执行                 │
                                     │ P1/P2: 用户确认 → DTO调度    │
                                     └─────────────────────────────┘
                                                    
每6h ──────→ [知识治理引擎] ←── 全量知识库扫描
                  │
                  └─→ knowledge.governance.completed ─→ 健康度追踪
```

---

## 四、模块依赖与改造计划

### 4.1 复用现有代码

| 现有文件 | 复用方式 | 改造点 |
|:---------|:---------|:-------|
| `intent-extractor-inline.js` | 快通道实时路径 | 增加 teaching/frustration 意图类型 |
| `event-bridge.js` | 系统事件监听器 | 扩展消费事件类型，增加 error pattern 检测 |
| `rule-suggester.js` | 执行层规则生成器 | 增加自动审核流程，对接裁决殿 |
| `insight-enhancer.js` | 慢通道分析基础 | 重构为 IntentAggregator + PatternDetector |
| `modules/vectorization-optimized.js` | 知识治理向量化 | 增加增量更新和过期检测 |
| `modules/zhipu-embedding.js` | Embedding 服务 | 保持不变 |
| `knowledge-graph/` | 知识图谱存储 | 增加关系类型和索引 |

### 4.2 新增模块

| 模块 | 文件（建议） | 职责 |
|:-----|:-------------|:-----|
| 增量扫描器 | `incremental-scanner.js` | 5min 增量扫描未处理消息 |
| 意图聚合器 | `intent-aggregator.js` | Daily 意图趋势聚合 |
| 模式检测器 | `pattern-detector.js` | 新兴/衰退/未覆盖意图检测 |
| 进化信号融合器 | `signal-fuser.js` | 多源进化信号融合与优先级排序 |
| 知识治理引擎 | `knowledge-governor.js` | 去重/合并/评分/淘汰流水线 |
| 进化评估器 | `evolution-tracker.js` | Benchmark 追踪与效果度量 |

---

## 五、调度策略

| 通道 | 频率 | 触发方式 | 模块 |
|:-----|:-----|:---------|:-----|
| 实时 | 每条消息 | 消息管道 Hook | InlineIntentHook |
| 快通道 | 每 5 分钟 | cron / setInterval | IncrementalScanner |
| 中通道 | 每 6 小时 | cron | KnowledgeGovernor |
| 慢通道 | 每日 02:00 | cron | IntentAggregator + PatternDetector |
| 学习通道 | 每日 09:00 | cron | 公网学习 (tavily-search) |
| 进化通道 | 事件驱动 | 事件总线订阅 | SignalFuser → EvolutionTask |

---

## 六、质量审查意见（仲裁官视角）

### 6.1 必须修改（阻塞项）

1. **【安全】知识淘汰必须有归档而非直接删除**：当前设计中 qualityScore < 30 直接删除，建议改为先归档30天再物理删除，防止误删有价值知识
2. **【正确性】语义去重阈值 0.92 需实测校准**：不同领域语义密度差异大，建议增加领域自适应阈值机制
3. **【安全】P0 自动执行范围必须白名单化**：不是所有 P0 任务都能自动执行，必须明确哪些操作在白名单内（如：新增意图类型=允许，修改ISC规则=需审批）

### 6.2 建议改进（优化项）

1. **增加进化效果度量**：每次进化任务完成后，应有 before/after Benchmark 对比
2. **知识治理报告可视化**：GovernanceReport 应自动生成飞书文档，便于追踪健康趋势
3. **信号融合器应支持权重配置**：不同信号源的可信度不同，应可配置权重

---

## 七、与系统其他组件的接口

```
CRAS-E ←→ 事件总线 (Event Bus)
  emit: intent.*, insight.*, evolution.*, knowledge.governance.*
  consume: system.error.*, aeo.assessment.*, lto.sync.*, user.message.*

CRAS-E ──→ ISC (规则引擎)
  生成/更新 ISC 规则（通过规则生成器）

CRAS-E ──→ 本地任务编排 (任务调度)
  提交进化任务（通过 evolution.task.proposed 事件）

CRAS-E ──→ AEO (评测)
  提交新评测样本（从对话流自动采集）

CRAS-E ←── 裁决殿 (裁决)
  P1/P2 进化任务需裁决殿审议
```

---

## 八、实施路径建议

| 阶段 | 内容 | 预计工期 |
|:-----|:-----|:---------|
| Phase 1 | 快通道改造：IncrementalScanner + 去重器 | 4h |
| Phase 2 | 慢通道改造：IntentAggregator + PatternDetector | 4h |
| Phase 3 | 自主学习引擎：SignalFuser + 三源信号接入 | 6h |
| Phase 4 | 知识治理引擎：KnowledgeGovernor 全流程 | 4h |
| Phase 5 | 集成测试 + Benchmark基线建立 | 4h |

**总计约 22h 开发工作量，建议 3-4 路并行可在 8h 内完成。**
