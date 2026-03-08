# 架构师全面审计报告：ISC-事件-本地任务编排-意图-执行链 端到端体检

**日期**: 2026-03-06  
**审计人**: 系统架构师（自动化审计）  
**审计范围**: 规则×事件×意图×执行链 五维度深度分析  

---

## 1. 执行摘要（TL;DR）

108条ISC规则中107条结构完整，但165种引用事件类型中仅38种（23%）有实际代码发射点。事件总线、规则匹配引擎、意图识别器、Dispatcher v2及15个Handler均已实现且代码可运行，但**守护进程未启动**——整个L3闭环流水线停在"代码存在但没人拉闸"的状态。DTO有95个ISC订阅但无自动执行链路，AEO/CRAS/LEP均为手动触发。**系统具备50%的自主运转能力，但另外50%的连接胶水和调度器缺失，导致端到端闭环断裂。**

---

## 2. 五维度详细分析

### 第一维：规则→事件绑定完整性

#### 2.1.1 规则结构统计

| 指标 | 数量 |
|------|------|
| 规则总数 | 108 |
| 结构完整（events+actions齐全）| 107 |
| 结构缺失 | 1（rule-bundle-intent-system-001.json，文件格式非dict） |
| 引用的唯一事件类型 | 165 |
| 引用的唯一action类型 | 43 |

#### 2.1.2 事件发射点实况（核心发现）

通过`grep`全量扫描infrastructure/和skills/目录的`.emit(`调用，实际有代码发射的事件类型：

| 事件类型 | 发射点 | 频率 |
|----------|--------|------|
| `isc.rule.created/updated/deleted` | git-scanner, isc-rules-watcher | git变更触发 |
| `isc.rule.changed` | isc-rules-watcher (fs.watch) | 文件变更即时 |
| `session.message.received` | message-hook | 每条消息 |
| `user.intent.detected` | message-hook (关键词匹配) | 每条含关键词消息 |
| `intent.detected` | IntentScanner (LLM/regex) | 主动调用时 |
| `file.changed` / `file.changed.*` | git-change-watcher | 文件变更+1min扫描 |
| `aeo.assessment.completed/failed/batch` | AEO event-bridge | 手动调用 |
| `aeo.evaluation.completed` | AEO event-bridge | 手动调用 |
| `cras.insight.generated` | CRAS event-bridge | 手动调用 |
| `cras.knowledge.learned` | CRAS event-bridge | 手动调用 |
| `lto.task.created/completed` | 本地任务编排 EventPublisher | 任务注册时 |
| `lto.sync.completed` | 本地任务编排 | 同步完成时 |
| `lto.signal.created` | lto-signals-watcher | 信号文件创建 |
| `seef.skill.evaluated/optimized/published` | SEEF模块 | 手动调用 |
| `knowledge.discovery.actionable` | knowledge-discovery-probe | 主动扫描时 |
| `skill.lifecycle.created/modified` | git-scanner | git变更触发 |
| `system.infrastructure.modified` | git-scanner | git变更触发 |
| `system.error` | 错误处理器 | 异常时 |
| `system.capability.degraded` | IntentScanner | LLM不可用时 |
| `day.started` | day-transition | 日切换时 |
| `isc.rule.triggered` | intent-dispatch handler | 意图分发时 |

**实际有发射点的事件类型：约38种（23%）**

#### 2.1.3 ABC分类

| 分类 | 定义 | 数量 | 百分比 |
|------|------|------|--------|
| **A类**（真正活的） | events+actions完整，事件有发射点，handler存在 | **~15条** | 14% |
| **B类**（纸面规则） | events+actions完整，但事件无发射点或无handler | **~92条** | 85% |
| **C类**（半成品） | 缺events或actions | **1条** | 1% |

**A类规则**（有实际闭环能力）主要集中在：
- `isc.rule.*` 事件触发的规则（~8条）→ 有git-scanner/watcher发射
- `session.message.received` 触发的规则（~3条）→ 有message-hook发射
- `file.changed` 触发的规则（~2条）→ 有git-change-watcher发射
- `aeo.assessment.*` / `cras.insight.*` 触发的规则（~2条）→ 有event-bridge发射（但需手动触发上游）

**B类规则引用的典型"幽灵事件"**（无人emit）：
- `architecture.decision.completed` — 无代码在架构决策完成时emit
- `orchestration.task.created` — 无任务编排器在创建任务时emit
- `quality.benchmark.completed` — 无基准测试完成emit
- `system.recurring.threshold_exceeded` — 无阈值监控代码
- `user.teaching.received` — 无教学识别emit
- `skill.performance.degraded` — 无性能退化检测
- 还有约120+种类似事件

---

### 第二维：事件识别机制审计

#### 2.2.1 L1 对象生命周期事件

**判定：部分实现（30%覆盖）**

| 组件 | 实现状态 | 能力 |
|------|---------|------|
| git-scanner.js | ✅ 代码完整 | 监听git diff，emit 4类事件（isc.rule.*, skill.lifecycle.*, system.infrastructure.*, test.suite.*） |
| isc-rules-watcher.js | ✅ 代码完整 | fs.watch监听rules/目录，即时emit `isc.rule.changed` |
| git-change-watcher.js | ✅ 代码完整 | 监听6个目录的文件变更，分类emit `file.changed.*` |
| lto-signals-watcher.js | ✅ 代码完整 | 监听.lto-signals/目录，emit `lto.signal.created` |

**关键缺失**：
- ❌ **运行时对象创建**无监控（如技能实例化、任务队列变更）
- ❌ **配置变更**只覆盖rules/目录，未覆盖其他配置
- ❌ **守护进程未运行**——所有watcher代码存在但没有启动

#### 2.2.2 L2 量化阈值事件

**判定：未实现（0%）**

全量grep结果：**没有任何代码在做计数器累积、阈值监控或自动emit阈值事件**。

以下事件在规则中被引用但**纯粹是纸面声明**：
- `aeo_issue_frequency_threshold_exceeded`
- `orchestration.efficiency.throughput_below_expected`
- `system.recurring.threshold_exceeded`
- `isc.enforcement_rate.threshold_crossed`

需要的但不存在的组件：**ThresholdMonitor**（定期扫描metrics.jsonl，检测阈值突破并emit事件）

#### 2.2.3 L3 语义意图事件

**判定：已实现，但未激活**

| 组件 | 状态 | 详情 |
|------|------|------|
| IntentScanner | ✅ 代码完整 | GLM-5 LLM主路 + regex降级双路径 |
| intent-registry.json | ✅ v4.3 | 5类17个具体意图，MECE |
| message-hook | ✅ 代码完整 | 关键词级意图检测（command/question/feedback） |
| L3 Pipeline | ✅ 代码完整 | EventBus→RuleMatcher→IntentScanner→Dispatcher闭环 |
| L3 Gateway | ✅ 代码完整 | 可拦截bus-adapter.emit()实时路由 |

**核心问题**：IntentScanner被描述为"CRAS快通道5分钟增量扫描"，但**没有定时器或调度器**实际每5分钟调用`scan()`。它是一个**被动方法**，等待调用者主动传入conversation slice。

#### 2.2.4 L4 知识发现事件

**判定：最小化实现（10%）**

KnowledgeDiscoveryProbe存在，但能力极其有限：
- 只做**6个固定关键词**的文本匹配（学习/发现/原则/learning/discovery/principle）
- 只扫描MEMORY.md和memory/*.md
- 无NLP、无聚类、无语义理解
- 判断"已覆盖"的逻辑仅为字符串包含匹配

**这不是知识发现，是关键词grep。**

#### 2.2.5 L5 系统性模式事件

**判定：未实现（0%）**

没有任何代码在做：
- 故障模式检测/关联分析
- 系统行为趋势分析
- 异常模式自动识别
- 跨模块问题传播追踪

---

### 第三维：意图识别体系审计

#### 2.3.1 分类体系完整性

| 分类 | 名称 | 意图数 | 状态 |
|------|------|--------|------|
| IC1 | 情绪意图 | 3 | ✅ 完整 |
| IC2 | 规则触发意图 | 5 | ✅ 完整 |
| IC3 | 复杂意图 | 3 | ✅ 完整 |
| IC4 | 隐含意图 | 4 | ✅ 完整 |
| IC5 | 多意图（复合）| 2 | ✅ 完整 |

**MECE评估**：分类设计合理。IC1-IC4按确定性递减排列，IC5处理复合场景。**有一个潜在遗漏**：纯信息查询类意图（"XX是什么？"）没有明确归入任何分类，可能被IC3或IC4模糊吸收。

#### 2.3.2 意图识别实时性

**不是实时的。** IntentScanner.scan()是被动方法。

- **LLM路径**：调用GLM-5，temperature=0.1，timeout=30s，有2次重试
- **Regex降级路径**：仅覆盖IC1、IC2（情绪关键词+规则关键词），IC3-IC5在regex模式下标记为"unresolved"
- **无自动调度**：没有setInterval/cron/watcher来周期性调用scan()

#### 2.3.3 自动发现未知意图

**不存在。** 没有：
- 聚类算法
- 异常检测
- 意图漂移检测
- 新意图提议机制

#### 2.3.4 CRAS双通道

| 通道 | 设计 | 实际 |
|------|------|------|
| 快通道（5min增量扫描）| IntentScanner | ❌ 无调度器启动5分钟循环 |
| 慢通道（daily深度分析）| CRAS event-bridge | ❌ 无daily cron/scheduler |

**判定：双通道是设计文档，不是实现。**

#### 2.3.5 Benchmark

意图识别有测试基准数据：
- `intent-benchmark-dataset.json` — 基础意图识别测试
- `real-conversation-samples.json` — 真实对话样本
- `multi-turn-eval-dataset.json` — 多轮对话评估
- 对应的benchmark runner脚本（LLM和非LLM版本）

**这是少数做得好的部分**——有benchmark数据和运行器，可以量化评估意图识别质量。

---

### 第四维：执行层对齐审计

#### 2.4.1 DTO覆盖率

| 指标 | 数量 |
|------|------|
| DTO任务定义 | 6个（3个YAML + 3个JSON） |
| ISC规则订阅 | 95个（自动生成，auto_alignment） |
| ISC规则总数 | 108 |
| 订阅覆盖率 | 88%（95/108） |

**但这个88%是虚假的。** 95个subscription文件只是声明`"auto_execute": true`的JSON，**没有任何代码读取这些subscription并在规则触发时自动执行DTO任务**。

本地任务编排 Platform有完整的TaskRegistry、DAGEngine、LinearEngine、AdaptiveEngine，但它的`initialize()`从不被自动调用。6个任务定义中：
- `auto-response-pipeline.yaml` — 依赖`evolver.insight.detected`事件，无人emit
- `skill-evolution.yaml` — 依赖cron `0 2 * * *`和`isc.standard.verified`事件，无cron执行
- `system-monitor-health.yaml` — 依赖cron `0 * * * *`，无cron执行

#### 2.4.2 AEO自动触发

**不能自动触发。**

AEO event-bridge.js提供了`onAssessmentComplete(result)`和`publishBatchResults(results)`接口，它们会将结果发布到事件总线。但**谁来调用这些函数？** 没有自动触发机制。

Dispatcher routes.json将AEO事件路由到`skill-cras-handler`，这条路径是通的：
```
AEO完成 → event-bridge发布事件 → EventBus → RuleMatcher → Dispatcher → skill-cras-handler → CRAS分析
```
但**第一步"AEO完成"需要人工触发**。

#### 2.4.3 CRAS连接性

**部分连接。**

CRAS event-bridge.js使用bus-adapter.consume()消费事件，这是**唯一一个真正实现了事件消费模式的模块**。它可以处理：
- `aeo.assessment.*` → 评测分析
- `lto.sync.completed` → 同步跟踪  
- `system.error` → 错误模式分析

生成洞察后发布`cras.insight.generated`到事件总线。

**问题**：`processAssessments()`必须被手动调用（CLI模式：`node event-bridge.js`）。无daemon/scheduler。

#### 2.4.4 LEP规则驱动

**不能被规则驱动。**

LEP Executor提供了`executeRule(ruleId, context)`接口，支持N016/N017/N018三条规则。但：
- 它不监听事件总线
- 不被Dispatcher调用
- 必须手动CLI调用：`node index.js execute-rule N016`

LEP复用了parallel-subagent的CircuitBreaker和RetryPolicy，**韧性机制本身是实现了的**。

#### 2.4.5 数据流断点

```
事件总线(bus) ──→ ISCRuleMatcher ──→ Dispatcher v2 ──→ Handlers
     │                                                      │
     │                                                      ├─→ skill-cras-handler (调用CRAS)
     │                                                      ├─→ skill-lto-handler (调用DTO) 
     │                                                      ├─→ skill-isc-handler (调用ISC)
     │                                                      └─→ intent-dispatch (路由意图)
     │
     └── 断点1: 无人启动daemon/pipeline
     
本地任务编排 Platform ──(断点2: subscription不触发执行)──→ TaskRegistry ──→ DAGEngine
                                                                        │
                                                                   断点3: 无skill执行器
                                                                        │
AEO ──(断点4: 无自动触发)                                                 ▼
                                                                   (执行结果无处反馈)
CRAS ──(断点5: 无调度器)                                                    │
                                                                   断点6: 无反馈循环生成新事件
LEP ──(断点7: 未连接事件总线)
```

**识别到7个数据流断点。**

---

### 第五维：全局自主决策能力

#### 2.5.1 闭环链路分析

| 环节 | 状态 | 自动/手动 | 说明 |
|------|------|----------|------|
| 1. 事件发射 | ✅ 代码存在 | ⚠️ 需启动daemon | git-watcher等4个watcher代码完整 |
| 2. 事件写入总线 | ✅ 工作正常 | ✅ 自动 | bus.emit()同步写入events.jsonl |
| 3. 规则匹配 | ✅ 代码完整 | ✅ 自动 | ISCRuleMatcher.process()支持四级匹配 |
| 4. 条件评估 | ✅ 代码完整 | ✅ 自动 | evaluateCondition()支持比较/逻辑/嵌套 |
| 5. Action派发 | ✅ 代码完整 | ✅ 自动 | Dispatcher v2 + 15个Handler |
| 6. DTO调度 | ⚠️ 框架存在 | ❌ 手动 | subscription无自动执行 |
| 7. 技能执行 | ❌ 不存在 | ❌ 手动 | 无通用skill executor |
| 8. 结果反馈 | ❌ 不存在 | ❌ N/A | 无执行结果→新事件的闭环 |

#### 2.5.2 自主决策能力评估

```
┌──────────────────────────────────────────────────┐
│            自主运转能力热力图                       │
├──────────┬──────────┬──────────┬──────────────────┤
│  感知层   │  认知层   │  决策层   │  执行层          │
│  40%     │  70%     │  60%     │  10%             │
│          │          │          │                  │
│ 事件发射  │ 规则匹配  │ 条件评估  │ DTO调度          │
│ 部分实现  │ 完整实现  │ 完整实现  │ 框架存在         │
│          │          │          │                  │
│ 意图识别  │ 意图分类  │ Dispatch │ 技能执行          │
│ 代码存在  │ MECE完整  │ 15个handler│ 不存在          │
│ 未激活   │          │          │                  │
│          │          │          │ 反馈循环          │
│          │          │          │ 不存在            │
└──────────┴──────────┴──────────┴──────────────────┘
```

#### 2.5.3 关键判断

**系统不能自主发现问题、自主决策、自主修复。** 原因：

1. **感知层缺口**：事件守护进程未运行，77%的事件类型无发射点
2. **认知层完整但休眠**：ISCRuleMatcher+IntentScanner代码完整但无人激活
3. **执行层断裂**：即使事件被感知、规则被匹配，最终动作也无法自动执行

**最讽刺的事实**：L3 Pipeline的代码质量很高——EventBus消费→RuleMatcher匹配→IntentScanner识别→Dispatcher分发→Handler执行，这个链条的每个环节代码都写好了、测试都通过了，但**没有一个入口点（main函数/daemon/cron）来启动这个链条**。

---

## 3. 关键缺口清单

### P0（阻断性 —— 不修则系统无法自主运转）

| # | 缺口 | 影响 | 修复路径 |
|---|------|------|---------|
| P0-1 | **Event Watcher Daemon未运行** | 事件感知层完全瘫痪 | 将`event-watcher-daemon.js`注册为systemd service或OpenClaw cron |
| P0-2 | **L3 Pipeline无启动入口** | 认知-决策闭环不转 | 创建cron adapter或daemon入口，每5分钟调用`l3-pipeline.run()` |
| P0-3 | **77%事件类型无发射点** | 85%规则为纸面规则 | 分优先级为高频事件创建emit点；低频事件考虑删除或降级 |

### P1（严重 —— 限制系统核心能力）

| # | 缺口 | 影响 | 修复路径 |
|---|------|------|---------|
| P1-1 | **DTO订阅无执行链路** | 95个subscription纯摆设 | 在Dispatcher handler中增加DTO task trigger逻辑 |
| P1-2 | **CRAS双通道未调度** | 意图识别不主动运行 | 创建CRAS调度器：5min快通道调IntentScanner，daily慢通道调深度分析 |
| P1-3 | **L2阈值事件完全缺失** | 量化监控盲区 | 创建ThresholdMonitor，读取metrics.jsonl做阈值检测 |
| P1-4 | **LEP未接入事件总线** | 韧性执行孤立 | LEP注册为Dispatcher handler，接收rule action调用 |

### P2（重要 —— 影响系统成熟度）

| # | 缺口 | 影响 | 修复路径 |
|---|------|------|---------|
| P2-1 | **L5系统模式检测为零** | 无法发现系统性故障 | 基于decision-log做模式分析，创建PatternDetector |
| P2-2 | **L4知识发现极简** | 只是关键词grep | 升级为语义检索+LLM摘要 |
| P2-3 | **执行结果无反馈循环** | 无法闭环学习 | Handler执行完成后emit result事件 |
| P2-4 | **AEO无自动触发** | 质量评测靠人工 | 创建AEO调度器，监听skill.lifecycle事件触发评测 |
| P2-5 | **意图漂移检测缺失** | 无法发现新意图类型 | 在IntentScanner中增加low-confidence聚类 |

---

## 4. 架构师建议

### 第一步：点燃引擎（1天）

**目标**：让已有的代码跑起来。

1. **启动Event Watcher Daemon** — `node event-watcher-daemon.js` 注册为systemd service
2. **启动L3 Pipeline调度** — 创建cron adapter每5分钟调用`l3-pipeline.run()`
3. **验证闭环** — 修改一个ISC rule文件 → 确认isc-rules-watcher检测到 → event写入总线 → RuleMatcher匹配 → Dispatcher分发到handler

**成功标准**：一次文件变更能自动触发完整的事件→规则→分发→handler链条。

### 第二步：连接执行层（3天）

**目标**：让action能执行，不只是log。

1. **Dispatcher handler增加DTO trigger** — `skill-lto-handler`收到事件后，查找matching subscription并调用DTO.execute()
2. **LEP注册为handler** — 在routes.json中增加LEP路由，让resilience-related action走LEP
3. **CRAS调度器** — 创建一个简单的setInterval(processAssessments, 5*60*1000)
4. **Handler执行后emit result事件** — 每个handler返回结果后，bus.emit('handler.result.*')

### 第三步：补全感知层（5天）

**目标**：让更多事件有实际发射点。

1. **按优先级创建事件发射器**：
   - `architecture.decision.*` — 在CRAS分析输出时emit
   - `quality.benchmark.completed` — 在AEO评测完成时emit（AEO event-bridge已做了一半）
   - `skill.performance.degraded` — 基于metrics.jsonl的异常检测
   - `system.recurring.threshold_exceeded` — ThresholdMonitor
2. **清理幽灵事件** — 对半年内无人emit的事件类型，从规则中移除或标记为`planned`

### 第四步：闭环进化（持续）

**目标**：系统能自主学习和改进。

1. **反馈循环** — 执行结果写入事件总线，CRAS消费并生成洞察
2. **意图漂移检测** — IntentScanner增加low-confidence日志分析
3. **L5模式检测** — 基于decision-log的故障模式关联分析
4. **自愈机制** — CRAS洞察→ISC规则自动创建/更新→DTO自动调度

---

## 附录：事件总线运行时状态快照

```json
{
  "totalEvents": 92,
  "consumers": 1,
  "eventsByType": {
    "isc.rule.created": 3,
    "isc.rule.updated": 89
  },
  "daemon": "NOT RUNNING",
  "watchers": "ALL STOPPED",
  "rule_matcher_stats": {
    "totalRules": 108,
    "exactPatterns": 165,
    "prefixPatterns": 0,
    "suffixPatterns": 0,
    "wildcardRules": 0,
    "rulesWithNoEvents": 12
  }
}
```

**注**：事件总线中仅有92条事件（全部是isc.rule类型），说明系统几乎没有在自动运转——这些事件应该是之前手动操作或DTO sync脚本产生的。

---

*报告完毕。所有判断基于代码实际实现，非规则声明。*
