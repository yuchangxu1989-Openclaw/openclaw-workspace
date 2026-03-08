# Day 1/2 设计债务完整复盘

**作者**: 系统架构师  
**日期**: 2026-03-05  
**范围**: Day 1/2 全部设计缺陷盘点 + 系统性补齐方案  
**方法论**: 反熵增——找到系统性根因，一次性解决一类问题

---

## TL;DR

Day 1/2 暴露的 15+ 个设计缺陷归结为 **4 个系统性根因**：

1. **验收体系形同虚设** — 合成数据、mock handler、0耗时通过验收，无"真实数据门禁"
2. **规则与执行完全脱耦** — 79条ISC规则全是JSON文档，运行时enforcement=0%
3. **反馈回路断裂** — 事件总线只管发，不管收；cron报错无人处理；Day间不自动流转
4. **工程纪律缺失** — 版本号空转递增、Pipeline入口坏了、13个技能缺SKILL.md、L3_PIPELINE_ENABLED=false

修复不是逐条打补丁，而是建立 **4 个系统级机制**：
- 🔒 **Validation Gate Protocol** — 消灭一切无门禁的通道
- ⚡ **ISC Runtime Enforcement Layer** — 规则即代码，代码即拦截
- 🔄 **Closed-Loop Feedback Architecture** — 事件→检测→修复→验证闭环
- 📐 **Engineering Discipline Automation** — 自动化消灭人为遗漏

---

## 第一部分：完整缺陷盘点

### D01: 场景Benchmark全合成数据 🔴 Critical

| 维度 | 详情 |
|------|------|
| **严重度** | 🔴 P0 Critical — 直接导致虚假验收 |
| **根因** | 10个场景文件(scenario-*.json)全部是手写合成数据，数据来源无标注(data_source=NOT SET)。runner.js中对真实模块导入失败会fallback到mock：`EventBus = createMockEventBus()`。handler执行0耗时直接return success |
| **应在哪个阶段发现** | Day 0设计阶段。Benchmark设计文档应包含"数据来源分类"和"真实数据门禁" |
| **为什么没发现** | 场景benchmark的验收标准只看"通过率"(10/10 = 100%)，不看"数据来源"和"执行路径"。用mock通过=自欺欺人 |
| **证据** | `scripts/scenario-benchmark/scenarios/` 10个文件全部无`data_source`字段。`runner.js` L25-30: 模块导入失败时fallback到mock |

**影响链**: 场景benchmark 10/10通过 → 用户以为质量过关 → Day 1 closure报告宣称"100%通过" → 实际0%真实通过

---

### D02: ISC规则零运行时Enforcement 🔴 Critical

| 维度 | 详情 |
|------|------|
| **严重度** | 🔴 P0 Critical — 79条规则写了等于没写 |
| **根因** | ISC设计时只考虑了"标准定义"(JSON schema + SKILL.md描述)，完全没有规划enforcement层。Day 1执行绑定审计结果：`enforced=0, partial=48, unenforced=39` |
| **应在哪个阶段发现** | ISC v3.0设计阶段。任何规则系统设计的第一天就该问"规则如何执行？谁来拦截违规？" |
| **为什么没发现** | ISC的定位被错误设计为"标准管理中心"而非"标准执行中心"。SKILL.md中只有`registerStandard()`和`check()`接口，没有`enforce()`和`block()`接口 |
| **证据** | `isc-core/SKILL.md` 全文无"enforce/block/reject/gate"关键词。Day 2才补建`infrastructure/enforcement/`目录，仅3个gate-check脚本 |

**影响链**: 规则零执行 → 违规代码自由提交 → 合成数据benchmark无人拦截 → 系统质量失控

---

### D03: 事件驱动自愈缺失 🔴 Critical

| 维度 | 详情 |
|------|------|
| **严重度** | 🔴 P0 Critical — cron连续报错9次无自动处理 |
| **根因** | EventBus设计时只有"事件发布-消费"模型，没有"事件→诊断→修复→验证"的自愈事件域。`bus.js`只实现了`emit/consume/ack`三个原语，没有`watch/alert/heal` |
| **应在哪个阶段发现** | EventBus设计阶段。任何事件系统都应在v1.0就设计error域和health域 |
| **为什么没发现** | 事件总线被设计为"消息传递管道"而非"系统神经系统"。缺少对故障模式的系统思考 |
| **证据** | 22个cron job中5个处于error状态。Day 2才补建`infrastructure/self-healing/cron-healer.js`，但只有2个已知错误模式。`bus.js`中无任何health/alert相关代码 |

---

### D04: 版本号语义缺失 🟡 High

| 维度 | 详情 |
|------|------|
| **严重度** | 🟡 P1 High — 制造虚假进展感，掩盖实际问题 |
| **根因** | auto-commit机制无条件递增版本号。Git log中出现`[AUTO] infrastructure v1.0.34` ~ `v1.0.41` 连续7个自动提交，内容可能只是日志文件变更 |
| **应在哪个阶段发现** | 本地任务编排 v3.0设计阶段。自动提交机制应设计"变更分类→语义判断→版本决策"流程 |
| **为什么没发现** | 本地任务编排 auto-commit设计时追求"全覆盖"(commit一切变更)，没考虑"变更是否有意义" |
| **证据** | `git log --oneline` 前30条中有10条`[AUTO]`提交，版本号从v1.0.34到v1.0.41单调递增。Day 2新增`5a62072 fix version inflation`说明问题已被识别但修复较晚 |

---

### D05: 任务流转断裂 🟡 High

| 维度 | 详情 |
|------|------|
| **严重度** | 🟡 P1 High — Day间4小时空转 |
| **根因** | 缺少`day.completed`事件。Day 1完成后系统不知道该做什么，直到人工介入才启动Day 2。Day 2新建了`infrastructure/task-flow/day-transition.js`(335行)，但依赖`reports/dayN-closure-conditions.md`文件存在才能触发 |
| **应在哪个阶段发现** | 项目计划阶段。多Day迭代的流转机制应在Day 0就设计好 |
| **为什么没发现** | Day 1设计时只关注"Day 1交什么"，没考虑"Day 1结束后怎么办" |
| **证据** | Day 1 closure后4小时空转。`day-transition.js`是Day 2紧急产物，非设计阶段规划 |

---

### D06: 测试/验证流程不查ISC 🟡 High

| 维度 | 详情 |
|------|------|
| **严重度** | 🟡 P1 High — 执行流程中无"先查ISC"强制步骤 |
| **根因** | ISC与DTO/SEEF/AEO的集成是"松耦合事件驱动"模式，但事件是可跳过的。benchmark runner、pipeline cron、场景测试中都没有`isc.check()`调用 |
| **应在哪个阶段发现** | ISC-DTO对接设计阶段。应设计"ISC检查点前置"的硬约束 |
| **为什么没发现** | ISC-DTO边界设计时强调"ISC只提供规范，DTO自由组合"，但DTO没有义务调用ISC检查点 |
| **证据** | `scripts/l3-pipeline-cron.js`中0次ISC调用。`scripts/scenario-benchmark/runner.js`中0次ISC调用。`infrastructure/pipeline/l3-pipeline.js`中0次ISC调用 |

---

### D07: 意图识别准确率极低 🟡 High

| 维度 | 详情 |
|------|------|
| **严重度** | 🟡 P1 High — 23.8% baseline，IC3-IC5=0% |
| **根因** | Intent Registry仅17条意图定义(5类IC1-IC5)。正则降级路径只覆盖IC1(情绪)和IC2(规则触发)，IC3(复杂意图)、IC4(隐含意图)、IC5(复合意图)完全无正则模式。LLM路径(GLM-5)延迟极高(14s-93s)导致大量超时降级 |
| **应在哪个阶段发现** | IntentScanner设计阶段。意图识别系统应设计baseline+增量扩展机制 |
| **为什么没发现** | 设计时假设"LLM能覆盖所有意图类型"，但LLM路径不稳定(超时率高)，正则降级路径又只覆盖2/5类别 |
| **证据** | `intent-registry.json`: 17条意图，5类。`intent-scanner.js`: `FALLBACK_REGEX`只有IC1和IC2两个key。Day 1 benchmark: 19/80 = 23.8% |

---

### D08: Pipeline E2E不可独立运行 🟡 High

| 维度 | 详情 |
|------|------|
| **严重度** | 🟡 P1 High — l3-pipeline-cron.js入口坏了 |
| **根因** | `l3-pipeline-cron.js`依赖`../infrastructure/pipeline/l3-pipeline`的导出，但该模块导出的接口与cron脚本期望不匹配。QA验收时`node scripts/l3-pipeline-cron.js`直接exit 3(模块未就绪) |
| **应在哪个阶段发现** | L3 Pipeline实现完成时。应有"入口可运行性"冒烟测试 |
| **为什么没发现** | 开发时从E2E test script验证pipeline，没从cron入口验证。两条路径的导出期望不同 |
| **证据** | Day 1 QA独立验收报告: "l3-pipeline-cron.js → 失败（模块无callable run方法）"。cron脚本期望`pipeline.run/execute/runOnce`，实际模块用不同导出方式 |

---

### D09: 两套事件总线共存 🟡 High（新发现）

| 维度 | 详情 |
|------|------|
| **严重度** | 🟡 P1 High — 数据竞争风险 + 架构分裂 |
| **根因** | `infrastructure/event-bus/`目录下存在3个总线实现：`bus.js`(旧·cursor模型)、`event-bus.js`(新·时间窗模型)、`bus-adapter.js`(适配层)。它们共享同一个`events.jsonl`文件。架构设计文档承认"两套总线API完全不兼容" |
| **应在哪个阶段发现** | L3模块设计阶段。应一开始就决定用哪套总线 |
| **为什么没发现** | L3模块在独立开发时使用了新event-bus.js，而现有7个event-bridge模块使用旧bus.js。直到集成时才发现不兼容 |
| **证据** | `designs/l3-architecture/DESIGN.md`明确记录"两套总线"问题。5个skills各有独立`event-bridge.js`(ISC/本地任务编排/CRAS/SEEF/AEO) |

---

### D10: L3_PIPELINE_ENABLED=false 🟡 High（新发现）

| 维度 | 详情 |
|------|------|
| **严重度** | 🟡 P1 High — 核心功能被静默禁用 |
| **根因** | `infrastructure/config/flags.json`中`L3_PIPELINE_ENABLED: false`。这意味着L3 Pipeline的主循环在生产环境是关闭的。所有E2E测试和benchmark都在不经过Pipeline的环境下运行 |
| **应在哪个阶段发现** | Day 1验收阶段。验收应包含"特性开关状态审计" |
| **为什么没发现** | Feature flag设计时没有"默认值审计"机制。关键功能的flag被设为false，系统不告警 |
| **证据** | `infrastructure/config/flags.json` 第2行: `"L3_PIPELINE_ENABLED": false` |

---

### D11: 13个技能缺失SKILL.md 🟢 Medium（新发现）

| 维度 | 详情 |
|------|------|
| **严重度** | 🟢 P2 Medium — 技能治理缺口 |
| **根因** | 51个技能目录中13个缺少SKILL.md。ISC规则`rule.skill-mandatory-skill-md-001`存在但未在提交流程中强制执行 |
| **应在哪个阶段发现** | 技能创建时。应有pre-commit hook强制检查 |
| **为什么没发现** | enforcement层不存在(见D02)，规则写了但没人拦截 |
| **证据** | 缺失列表: agent-mode-enforcer, api-aggregator, cogvideo, cogview, evomap-uploader, file-downloader, github-api, glm-4v, glm-image, glm-ocr, glm-tts, glm-video, glm-vision, shared |

---

### D12: 技能重叠/功能冗余 🟢 Medium（新发现）

| 维度 | 详情 |
|------|------|
| **严重度** | 🟢 P2 Medium — 增加维护成本和意图路由混淆 |
| **根因** | 视觉相关技能存在3个: `glm-vision`, `zhipu-vision`, `glm-4v`，功能高度重叠。cras-generated-* 有4个自动生成的技能，无人清理 |
| **应在哪个阶段发现** | 技能注册时。应有去重检查 |
| **为什么没发现** | 技能创建流程缺少"已有技能相似度检查"步骤 |
| **证据** | `skills/` 目录下3个视觉技能 + 4个cras-generated-*技能 |

---

### D13: Event-Bridge散落在各Skill中 🟢 Medium（新发现）

| 维度 | 详情 |
|------|------|
| **严重度** | 🟢 P2 Medium — 事件路由逻辑碎片化 |
| **根因** | ISC/本地任务编排/CRAS/SEEF/AEO各自维护独立的`event-bridge.js`，加上`infrastructure/event-bus/bus-adapter.js`和L3 Dispatcher，事件路由逻辑分散在7+个文件中。没有统一的事件路由拓扑图 |
| **应在哪个阶段发现** | 事件架构设计阶段。应有统一的事件路由注册中心 |
| **为什么没发现** | 各子系统独立开发，事件桥接按需添加，缺少全局视角 |
| **证据** | 5个`event-bridge.js` + `bus-adapter.js` + `dispatcher` + `routes.json` = 事件路由碎片化 |

---

### D14: Benchmark数据集质量低 🟢 Medium（新发现）

| 维度 | 详情 |
|------|------|
| **严重度** | 🟢 P2 Medium — 80条intent样本中大量低质量样本 |
| **根因** | `intent-benchmark-dataset.json`有80条样本，但expected字段全是空对象`{}`。这意味着benchmark只测"不报错"，不测"识别对不对" |
| **应在哪个阶段发现** | Benchmark数据集设计阶段 |
| **为什么没发现** | 数据集生成时只关注样本多样性，忽略了golden label标注 |
| **证据** | 80条样本的`expected`字段全是`{}` |

---

### D15: 自愈模式库极度匮乏 🟢 Medium（新发现）

| 维度 | 详情 |
|------|------|
| **严重度** | 🟢 P2 Medium — cron-healer只有2个已知模式 |
| **根因** | `cron-healer.js`的`KNOWN_PATTERNS`数组只有2个模式(delivery-target-to-to和delivery-missing-to)。22个cron job × N种故障模式，2个pattern覆盖率极低 |
| **应在哪个阶段发现** | 自愈PoC设计时应规划模式增长路径 |
| **为什么没发现** | Day 2时间压力下做了最小可行PoC，没设计模式自动学习机制 |
| **证据** | `cron-healer.js` L20-40: 仅2个pattern对象 |

---

## 第二部分：系统性根因分析

### 根因α: 验证体系的"信任链断裂"

```
设计断裂点：
  数据 → [无门禁] → Benchmark → [无门禁] → 报告 → [无门禁] → Closure
  
应有信任链：
  真实数据 →「来源gate」→ Benchmark →「ISC gate」→ 报告 →「独立QA gate」→ Closure
```

**波及的缺陷**: D01(合成数据), D06(不查ISC), D08(入口坏了), D10(功能禁用), D14(数据集质量低)

**一句话根因**: 没有在任何关键节点设计强制门禁(gate)。所有验证都是"可选的"、"松耦合的"、"可跳过的"。

### 根因β: ISC "只立法不执法"

```
当前状态：
  ISC规则(79条JSON文件) → [文档] → 无人读 → 无人执行
  
应有状态：
  ISC规则 → [编译为gate-check] → pre-commit hook拦截 → CI/CD拦截 → 运行时拦截
```

**波及的缺陷**: D02(零enforcement), D06(不查ISC), D11(缺SKILL.md)

**一句话根因**: ISC被设计为"知识库"而非"执法系统"。79条规则的正确类比不是"百科全书"，而是"法律+警察+法院"三位一体。

### 根因γ: 反馈回路开环

```
当前状态：
  事件发布 → EventBus → 消费者(可能不在线) → [断裂]
  cron报错 → 日志 → [无人看] → [断裂]
  Day完成 → 报告 → [无下一步] → [断裂]

应有状态：
  事件发布 → 消费 → 处理结果 → 反馈事件 → 验证 → 闭环
  cron报错 → 检测 → 诊断 → 修复 → 验证 → 通知
  Day完成 → 流转 → 生成下一Day → 自动开始
```

**波及的缺陷**: D03(自愈缺失), D04(版本空转), D05(流转断裂), D09(双总线), D13(event-bridge碎片), D15(模式库匮乏)

**一句话根因**: 事件总线被设计为"管道"而非"神经系统"。缺少反馈回路(feedback loop)的概念。

### 根因δ: 工程纪律依赖人不依赖机制

```
当前状态：
  "应该写SKILL.md" → 没人检查 → 13个漏了
  "版本号应该有语义" → auto-commit不管 → 空转递增
  "入口应该能跑" → 没人试 → 入口坏了
  "feature flag应该开着" → 没人审计 → 核心功能关闭

应有状态：
  每一条"应该"都有一个自动化检查器 → 不过检查 → 不让提交/部署
```

**波及的缺陷**: D04(版本号), D08(入口坏了), D10(flag=false), D11(缺SKILL.md), D12(重叠技能)

**一句话根因**: 所有工程约束都依赖"人记得去做"而非"机器不让你不做"。

---

## 第三部分：系统级补齐方案

### 方案1: Validation Gate Protocol（消灭根因α）

**目标**: 在每个关键节点建立强制门禁，不通过不放行。

```
┌──────────────────────────────────────────────────────────┐
│  Validation Gate Protocol                                  │
│                                                            │
│  Gate 1: Data Source Gate                                   │
│    - 每条benchmark数据必须有data_source标注                   │
│    - synthetic/mock/fake → 自动BLOCK                        │
│    - 执行: gate-check-benchmark-data.js (已有,需强制集成)      │
│                                                            │
│  Gate 2: ISC Compliance Gate                                │
│    - 每次提交前必须通过ISC检查点                               │
│    - pre-commit hook调用enforce.js                          │
│    - 执行: isc-pre-commit-check.js + git hooks              │
│                                                            │
│  Gate 3: Entry Point Smoke Gate                             │
│    - 每个注册入口(cron script, CLI)必须通过冒烟测试             │
│    - `node <entry> --smoke` 必须exit 0                     │
│    - 执行: 新建 smoke-test-all-entries.js                    │
│                                                            │
│  Gate 4: Feature Flag Audit Gate                            │
│    - 核心功能(L3_PIPELINE等)的flag必须标注expected_value        │
│    - flag与expected不一致 → 告警                              │
│    - 执行: 扩展feature-flags.js，增加audit()方法              │
│                                                            │
│  Gate 5: Report Integrity Gate                              │
│    - 报告中声称的数字必须可溯源                                │
│    - "10/10通过"必须附带run_id和执行日志                       │
│    - 执行: gate-check-report-validation.js (已有,需强化)      │
│                                                            │
│  Gate 6: Independent QA Gate                                │
│    - Day closure必须经过独立QA从零验证                         │
│    - QA脚本必须可一键运行                                     │
│    - 执行: 新建 qa-closure-runner.sh                         │
│                                                            │
│  集成方式: 所有Gate注册到enforce.js统一入口                     │
│  触发方式: pre-commit + cron + 手动                          │
└──────────────────────────────────────────────────────────┘
```

**预估工作量**: 2-3天
**优先级**: P0 — 不建立门禁一切验收结果不可信

---

### 方案2: ISC Runtime Enforcement Layer（消灭根因β）

**目标**: 将ISC从"知识库"升级为"执法系统"。

```
当前: ISC = JSON文件 + SKILL.md文档
目标: ISC = JSON定义 + check_fn实现 + enforce()运行时拦截 + 违规日志

架构改造:
  
  isc-core/
  ├── rules/                     # 规则定义 (已有)
  ├── enforcement/               # 【新增】规则执行层
  │   ├── engine.js              # 统一enforcement引擎
  │   ├── gates/                 # 门禁实现(从infrastructure/enforcement/迁入)
  │   │   ├── data-source.js
  │   │   ├── skill-md.js
  │   │   ├── report-validation.js
  │   │   └── ...                # 每条P0规则一个gate
  │   ├── hooks/                 # Git hooks集成
  │   │   ├── pre-commit.sh
  │   │   └── pre-push.sh
  │   └── audit-log.jsonl        # 执法日志
  ├── runtime/                   # 【新增】运行时检查
  │   ├── middleware.js           # 可插入任何执行流的中间件
  │   └── interceptors/          # 拦截器
  └── metrics/                   # 【新增】enforcement指标
      └── compliance-dashboard.js
```

**关键设计原则**:
1. 每条P0规则必须有对应的gate实现(code, not doc)
2. gate返回`{pass: true}` 或 `{pass: false, reason: string, rule_id: string}`
3. 所有gate执行结果写入audit-log
4. 提供`isc.enforce(ruleId, target)`统一API

**预估工作量**: 3-4天
**优先级**: P0 — ISC不执法等于不存在

---

### 方案3: Closed-Loop Feedback Architecture（消灭根因γ）

**目标**: 所有反馈回路必须闭环。

```
┌─────────────────────────────────────────────────────────┐
│  Closed-Loop Feedback Architecture                       │
│                                                          │
│  Layer 1: Event Health Domain (事件健康域)                 │
│    bus.js 增加:                                           │
│    - emit() 后验证至少1个消费者ACK                          │
│    - 超时未ACK → emit('system.event.orphaned')            │
│    - 连续N条同类型事件无消费 → emit('system.event.dead')     │
│                                                          │
│  Layer 2: Cron Self-Healing Loop (cron自愈闭环)            │
│    cron-healer.js 增加:                                    │
│    - 模式学习: 未匹配的错误 → 记录到unknown-patterns.jsonl    │
│    - 模式聚类: 每日分析unknown patterns → 生成新pattern建议   │
│    - 验证闭环: 修复后重跑任务 → 验证修复有效                  │
│    - 上报通知: escalated项发送到飞书                         │
│                                                          │
│  Layer 3: Day Flow Engine (Day流转引擎)                    │
│    day-transition.js 增加:                                 │
│    - 定时检测(cron): 每30min检查当前Day是否完成               │
│    - 自动触发: 检测到完成 → 自动生成scope → emit事件          │
│    - 通知: Day流转结果发送到飞书                              │
│                                                          │
│  Layer 4: Version Semantic Guard (版本语义守卫)             │
│    auto-commit 增加:                                       │
│    - 变更分类: code_change/doc_change/log_change/config     │
│    - 语义判断: log_change → 不递增; code_change → minor++    │
│    - 冷静期: 同一目录5min内多次变更 → 合并为一次commit         │
│                                                          │
│  Layer 5: Event Bus Unification (事件总线统一)              │
│    Phase 1: bus-adapter.js作为统一入口(已完成)               │
│    Phase 2: 所有event-bridge迁入dispatcher统一路由            │
│    Phase 3: 废弃event-bus.js和独立event-bridge              │
│    Timeline: Phase 2在Day 3, Phase 3在Day 5                │
└─────────────────────────────────────────────────────────┘
```

**预估工作量**: 4-5天（分Phase交付）
**优先级**: P1 — 反馈闭环是系统自进化的基础

---

### 方案4: Engineering Discipline Automation（消灭根因δ）

**目标**: 所有"应该"自动化为"必须"。

```
自动化清单:

1. SKILL.md 强制检查 (覆盖D11)
   - pre-commit hook: 新增/修改skills/*/下的文件时，检查SKILL.md存在
   - 违反 → commit被reject
   - 实现: 扩展isc-pre-commit-check.js

2. 入口冒烟测试 (覆盖D08)
   - cron注册时: 自动运行 `node <script> --smoke`
   - 运行时: cron每次执行前冒烟测试
   - 失败 → disable cron job + 告警
   - 实现: 扩展cron job注册逻辑

3. Feature Flag审计 (覆盖D10)
   - flags.json增加 `_expected` 字段:
     ```json
     { "L3_PIPELINE_ENABLED": false, "_L3_PIPELINE_ENABLED_expected": true }
     ```
   - 每日审计: 实际值≠期望值 → 告警
   - 实现: 新增flag-auditor.js

4. 技能去重检查 (覆盖D12)
   - 技能注册时: 检查description与已有技能的相似度
   - 相似度>0.8 → 提示可能重复
   - 实现: 利用已有向量服务做语义相似度

5. 数据集质量检查 (覆盖D14)
   - benchmark数据集必须有golden label
   - expected字段为空{} → benchmark结果标记为"无标签,仅测冒烟"
   - 实现: 扩展gate-check-benchmark-data.js

6. Intent Registry增长路径 (覆盖D07)
   - 每次LLM识别结果 → 自动提取新意图候选
   - 新候选 → ISC审议 → 合格加入Registry
   - 目标: 17条→100条(Day 5), 100条→500条(Day 10)
   - 正则降级覆盖: IC3-IC5补充正则模式
   - 实现: 扩展intent-scanner.js的学习路径
```

**预估工作量**: 3-4天
**优先级**: P1 — 人不可靠，机器可靠

---

## 第四部分：执行优先级与路线图

### 优先级矩阵

| 方案 | 覆盖缺陷 | 优先级 | 工时 | 建议Day |
|------|---------|--------|------|---------|
| 方案1: Validation Gate Protocol | D01,D06,D08,D10,D14 | P0 | 2-3d | Day 3 |
| 方案2: ISC Runtime Enforcement | D02,D06,D11 | P0 | 3-4d | Day 3-4 |
| 方案3: Closed-Loop Feedback | D03,D04,D05,D09,D13,D15 | P1 | 4-5d | Day 4-5 |
| 方案4: Engineering Discipline | D07,D08,D10,D11,D12,D14 | P1 | 3-4d | Day 4-5 |

### Day 3 建议Scope

1. **方案1的Gate 1-3**: Data Source Gate + ISC Compliance Gate + Entry Point Smoke Gate
2. **方案2的P0规则enforcement**: 至少10条P0规则有可执行gate
3. **方案3的Layer 2**: Cron Self-Healing Loop完善
4. **D10快速修复**: L3_PIPELINE_ENABLED → true (5分钟)

### Day 3 关闭条件

1. 所有benchmark数据标注data_source，合成数据被自动拦截
2. ≥10条P0 ISC规则有运行时enforcement
3. cron-healer模式库≥5个，覆盖当前5个error状态job
4. L3_PIPELINE_ENABLED=true，Pipeline E2E可独立运行
5. Intent Registry ≥30条意图定义

---

## 第五部分：架构原则提炼

从Day 1/2的教训中，提炼出以下永久性架构原则，纳入ISC规则库：

### AP-001: Gate Before Action（行动前必有门禁）
> 任何影响系统状态的操作（提交代码、发布技能、生成报告、关闭Day）必须通过至少一个自动化Gate检查。无Gate的操作路径视为安全漏洞。

### AP-002: Rule = Code（规则即代码）
> ISC规则定义(JSON)与规则执行(gate-check代码)必须1:1配对。只有JSON定义无代码实现的规则，在合规审计中视为"不存在"。

### AP-003: Feedback Must Close（反馈必须闭环）
> 任何事件发布后必须有明确的消费确认。任何错误检测后必须有诊断→修复→验证的完整闭环。开环=失控。

### AP-004: Machine Over Human（机器约束优于人的纪律）
> 所有"应该做"的事项必须自动化为"必须做"。依赖人记忆和纪律的约束，在概率上等于没有约束。

### AP-005: Real Data Gate（真实数据门禁）
> 任何benchmark、测试、验收的数据来源必须标注且可溯源。合成数据可用于开发调试，不可用于验收。验收使用合成数据=验收无效。

---

*本文档是Day 1/2的完整复盘产物。所有方案均遵循反熵增原则——不是逐条修补，而是建立机制消灭一类问题。*

## 目标

> TODO: 请补充目标内容

## 风险

> TODO: 请补充风险内容

## 验收

> TODO: 请补充验收内容

---

## 📋 架构评审清单 (自动生成)

**文档**: day1-2-design-debt-review
**生成时间**: 2026-03-06T13:01:12.501Z
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
