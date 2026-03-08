# L3 Pipeline 迁移方案：现有工作流 → L3 意图识别层

> **版本**: v1.0.0
> **日期**: 2026-03-05
> **状态**: Day 2 设计输出物
> **前置**: l3-architecture/DESIGN.md（Day 1 完成）

---

## TL;DR

系统当前有 **5 类工作流**（Heartbeat、16个Cron任务、手动技能调用、DTO编排、ISC规则触发），全部绕过 L3 意图识别层直接执行。迁移目标是让 L3 Pipeline 成为统一的事件观测+智能路由层。采用 4 阶段渐进迁移，Phase 1 先做旁路监听不影响现有系统。

---

## 第一部分：现有工作流完整盘点

### 1.1 工作流分类

| # | 工作流类型 | 触发方式 | 执行路径 | 事件总线集成 | 数量 |
|---|-----------|---------|---------|-------------|------|
| **WF1** | Heartbeat | OpenClaw轮询（~30min） | 主Session → HEARTBEAT.md → 脚本执行 | ❌ 无 | 1 |
| **WF2** | Cron任务（高频） | openclaw cron（5-30min） | cron-worker → isolated session → 脚本 | ⚠️ 部分（event-bridge产生事件） | 3 |
| **WF3** | Cron任务（低频） | openclaw cron（1h-每日） | cron-worker → isolated session → 脚本 | ❌ 无 | 13 |
| **WF4** | 手动技能调用 | 用户飞书消息 | 主Agent → 读SKILL.md → 调用工具 | ❌ 无 | N/A |
| **WF5** | DTO声明式编排 | 事件/cron/手动触发 | 本地任务编排 engine → DAG执行 → 回调 | ✅ 旧bus.js | 1套 |
| **WF6** | ISC规则触发 | 事件桥接 + cron检测 | ISC bridge → 旧bus.js → Dispatcher路由 | ✅ 旧bus.js | 30+规则 |
| **WF7** | 事件驱动链 | bus.js事件 | 5个event-bridge → Dispatcher → handlers | ✅ 旧bus.js | 12条路由 |

### 1.2 Cron任务详细清单（16个启用）

| 频率 | 任务名 | 执行内容 | 事件总线关系 | 迁移难度 |
|------|--------|---------|-------------|---------|
| ***/5** | event-dispatcher | 运行Dispatcher消费bus事件 | ✅ 核心消费者 | 🟢 低 |
| ***/15** | ISC变更检测 | 运行isc-core/event-bridge.js | ✅ 核心生产者 | 🟢 低 |
| ***/30** | 全局自主决策流水线 | Git跟踪+版本bump+同步 | ❌ 独立运行 | 🟡 中 |
| **0 \*** | 系统监控-综合 | system-monitor + gateway-monitor | ❌ 独立运行 | 🟡 中 |
| **0 \*** | 本地任务编排-AEO流水线 | DTO编排器 + AEO桥接 | ⚠️ 检查.lto-signals | 🟡 中 |
| **5 \*/4** | 能力同步与PDCA | PDCA引擎 | ❌ 独立运行 | 🟡 中 |
| **10 \*/4** | 系统状态与流水线监控 | 流水线状态检查 | ❌ 独立运行 | 🟡 中 |
| **0 \*/6** | 记忆摘要 | 聚合daily notes → MEMORY.md | ❌ 独立运行 | 🔴 高 |
| **35 \*/6** | 运维辅助-清理与向量化 | 日志清理+向量化 | ❌ 独立运行 | 🟡 中 |
| **0 7,19** | 自动备份 | 全量备份 | ❌ 独立运行 | 🟢 低 |
| **0 9** | CRAS-A 主动学习 | AI进展搜索+学习 | ❌ 独立运行 | 🟡 中 |
| **0 9** | LEP韧性日报 | 韧性报告 | ❌ 独立运行 | 🟡 中 |
| **0 10** | CRAS-D 战略调研 | 行业调研 | ❌ 独立运行 | 🟡 中 |
| **0 20** | ISC技能质量管理 | 质量评估 | ❌ 独立运行 | 🟡 中 |
| **0 2** | CRAS-E 自主进化 | 知识进化 | ❌ 独立运行 | 🟡 中 |
| **0 2** | 系统维护-每日清理 | 文件清理 | ❌ 独立运行 | 🟢 低 |

### 1.3 事件驱动链路现状

```
ISC rules/*.json 变更
    │  (每15min cron检测)
    ▼
isc-core/event-bridge.js ──emit──► bus.js
    │                                 │
    │                                 ▼
    │                        events.jsonl
    │                                 │
    │              (每5min cron dispatcher消费)
    │                                 │
    │                                 ▼
    │                        Dispatcher ──► routes.json ──► handlers/
    │
    ├── lto-core/event-bridge.js (consume isc.rule.* → emit lto.sync.*)
    ├── seef/event-bridge.js    (consume lto.sync.* → emit seef.skill.*)
    ├── aeo/event-bridge.js     (consume seef.skill.* → emit aeo.assessment.*)
    └── cras/event-bridge.js    (consume aeo.assessment.* → emit cras.insight.*)
```

**L3 Pipeline 当前位置**：
```
bus-adapter.js (Day 1已建) ──consume──► L3Pipeline (每5min cron)
                                            │
                                            ▼
                                    RuleMatcher → IntentScanner → Dispatcher v2
                                    （模块已创建但未集成到主事件流）
```

---

## 第二部分：迁移目标态

### 2.1 目标架构

```
所有工作流 ──事件──► EventBus (bus-adapter.js)
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
    旧路径            L3 Pipeline      观测层
  (不变，fallback)   (智能路由)       (metrics)
        │                │
        ▼                ▼
    handlers/        intent-dispatch
  (静态路由)         (智能路由)
```

### 2.2 迁移不等于替换

**关键原则**：L3 不是替换现有系统，而是在现有系统之上增加一层智能观测和路由能力。

- **Phase 1-2**：L3 是旁路观察者（shadow mode），不影响任何现有执行
- **Phase 3**：L3 开始参与路由决策，现有路径作为 fallback
- **Phase 4**：验证充分后才移除冗余路径

---

## 第三部分：逐工作流迁移方案

### WF1: Heartbeat → L3

| 阶段 | 动作 | 风险 |
|------|------|------|
| **Phase 1** | Heartbeat执行完成后emit `heartbeat.check.completed` 事件到EventBus；L3旁路记录 | 🟢 零 |
| **Phase 2** | L3分析heartbeat历史，提出优化建议（如合并低频检查） | 🟢 低 |
| **Phase 3** | L3根据系统状态动态调整heartbeat检查项（跳过无变化的检查） | 🟡 中 |
| **Phase 4** | Heartbeat简化为事件触发器，L3编排具体检查逻辑 | 🟡 中 |

**决策：延后迁移。** Heartbeat在主Session运行，注入事件需要改AGENTS.md行为，侵入性高。

### WF2: 高频Cron（event-dispatcher / ISC变更 / 决策流水线） → L3

#### WF2a: event-dispatcher（每5分钟）

| 阶段 | 动作 | 风险 |
|------|------|------|
| **Phase 1** | 在Dispatcher执行前/后emit `cron.dispatch.started/completed` 事件；L3旁路消费并记录 | 🟢 零 |
| **Phase 2** | L3 Pipeline 的 Dispatcher v2 同时路由同批事件，对比结果差异 | 🟡 低 |
| **Phase 3** | L3 Dispatcher v2 成为主路由，旧Dispatcher降级为验证器 | 🟡 中 |
| **Phase 4** | 移除旧Dispatcher cron，L3 Pipeline cron统一调度 | 🟡 中 |

**决策：优先级第1。** Dispatcher已经是L3 Pipeline的一部分，天然适合迁移。

#### WF2b: ISC变更检测（每15分钟）

| 阶段 | 动作 | 风险 |
|------|------|------|
| **Phase 1** | ISC event-bridge.js 执行后emit `cron.isc_detect.completed` 摘要事件；L3旁路消费 | 🟢 零 |
| **Phase 2** | L3 RuleMatcher 实时分析ISC规则变更事件，与bridge检测结果对比 | 🟡 低 |
| **Phase 3** | L3 RuleMatcher 成为主检测路径，cron bridge降频到每小时作为补偿扫描 | 🟡 中 |
| **Phase 4** | 移除15分钟cron，L3实时检测完全替代 | 🟡 中 |

**决策：优先级第2。** ISC bridge已经emit事件，L3可以直接消费。

#### WF2c: 全局自主决策流水线（每30分钟）

| 阶段 | 动作 | 风险 |
|------|------|------|
| **Phase 1** | 流水线执行完成后emit `cron.git_pipeline.completed` 包含变更摘要 | 🟢 零 |
| **Phase 2** | L3观测Git变更模式，分析是否存在无效bump | 🟡 低 |
| **Phase 3** | 不迁移——此流水线本质是Git操作，不适合L3语义路由 | — |
| **Phase 4** | 保持独立cron，仅通过事件与L3联动 | — |

**决策：仅做Phase 1事件化，不完全迁移。**

### WF3: 低频Cron → L3

| 阶段 | 动作 | 风险 |
|------|------|------|
| **Phase 1** | 统一为所有cron任务添加执行生命周期事件（started/completed/failed） | 🟢 零 |
| **Phase 2** | L3分析cron执行模式（成功率、耗时趋势、错误模式） | 🟢 低 |
| **Phase 3** | L3建议调度优化（合并冗余任务、调整频率） | 🟡 中 |
| **Phase 4** | 部分cron任务转为事件驱动（L3触发替代固定cron） | 🟡 中 |

**决策：Phase 1统一覆盖，后续按需推进。**

### WF4: 手动技能调用 → L3

| 阶段 | 动作 | 风险 |
|------|------|------|
| **Phase 1** | 不迁移 | — |
| **Phase 2** | 用户消息经过IntentScanner识别意图后，辅助主Agent做技能选择 | 🟡 中 |
| **Phase 3** | IntentScanner结果直接参与路由决策 | 🔴 高 |
| **Phase 4** | 完全由L3编排技能调用链 | 🔴 高 |

**决策：延后。** 侵入主Session执行流程，风险最高，收益不明确。

### WF5: DTO声明式编排 → L3

| 阶段 | 动作 | 风险 |
|------|------|------|
| **Phase 1** | 本地任务编排 event-bridge 已集成旧bus.js，L3通过bus-adapter.js旁路消费DTO事件 | 🟢 零 |
| **Phase 2** | L3分析DTO任务链执行效率，提供优化建议 | 🟢 低 |
| **Phase 3** | L3 IntentScanner 解析用户意图后直接触发DTO任务定义 | 🟡 中 |
| **Phase 4** | DTO成为L3的执行后端，L3做意图→任务映射 | 🟡 中 |

**决策：Phase 1已自然完成（bus-adapter.js），Phase 2可以开始。**

### WF6-7: ISC规则触发 + 事件驱动链 → L3

| 阶段 | 动作 | 风险 |
|------|------|------|
| **Phase 1** | 已完成——bus-adapter.js 已统一事件总线，L3 Pipeline 可以消费全量事件 | ✅ 已完成 |
| **Phase 2** | L3 RuleMatcher 对事件做智能分类，与Dispatcher静态路由对比 | 🟡 低 |
| **Phase 3** | L3 RuleMatcher 参与路由决策 | 🟡 中 |
| **Phase 4** | 不完全替换——ISC规则体系保留，L3增强而非替代 | — |

**决策：Phase 1已完成，Phase 2是下一步重点。**

---

## 第四部分：迁移优先级排序

### 4.1 评估矩阵

| 工作流 | 收益 | 风险 | 复杂度 | 依赖 | 优先级 |
|--------|------|------|--------|------|--------|
| **WF2a event-dispatcher** | 🟢 高（统一路由入口） | 🟢 低 | 🟢 低 | bus-adapter.js ✅ | **P0 — 立即迁移** |
| **WF2b ISC变更检测** | 🟢 高（实时化） | 🟢 低 | 🟢 低 | bus-adapter.js ✅ | **P0 — 立即迁移** |
| **WF6-7 事件驱动链** | 🟡 中（智能路由） | 🟢 低 | 🟡 中 | RuleMatcher | **P1 — Phase 2一起做** |
| **WF5 DTO编排** | 🟡 中（意图→任务映射） | 🟡 中 | 🟡 中 | IntentScanner | **P1 — Phase 2** |
| **WF3 低频Cron** | 🟡 中（统一观测） | 🟢 低 | 🟢 低 | 无 | **P2 — Phase 1批量覆盖** |
| **WF2c 决策流水线** | 🟢 低（仅观测） | 🟢 低 | 🟢 低 | 无 | **P2 — 仅事件化** |
| **WF1 Heartbeat** | 🟢 低 | 🟡 中 | 🟡 中 | 主Session改造 | **P3 — 延后** |
| **WF4 手动调用** | 🟡 中 | 🔴 高 | 🔴 高 | IntentEngine成熟 | **P3 — 延后** |

### 4.2 迁移路线图

```
Week 1 (Day 2-3)
├── P0: event-dispatcher L3旁路监听 ← 今天实现
├── P0: ISC变更检测 L3旁路监听 ← 今天实现
└── P2: 所有Cron任务 Phase 1 事件化包装器 ← 今天实现

Week 2
├── P1: L3 RuleMatcher 接入ISC事件流 (Phase 2)
├── P1: L3 Dispatcher v2 与旧Dispatcher结果对比
└── P1: DTO事件 L3分析

Week 3-4
├── Phase 3: L3 Dispatcher v2 成为主路由
├── Phase 3: ISC cron降频
└── 评估 Phase 4 可行性
```

### 4.3 不迁移清单

以下工作流明确**不纳入L3迁移**：

| 工作流 | 原因 |
|--------|------|
| OpenClaw自动备份 | 纯运维操作，L3无增值 |
| 系统维护-每日清理 | 纯运维操作 |
| 记忆摘要 | 在主Session语境中运行更合适 |
| 飞书会话备份（已禁用） | 已禁用 |
| ClawHub安装（已禁用） | 已禁用 |

---

## 第五部分：Phase 1 实现——旁路监听

### 5.1 设计原则

1. **零侵入**：不修改任何现有工作流代码
2. **纯追加**：只增加事件emit，不改变执行逻辑
3. **可观测**：所有旁路监听结果写入 `infrastructure/event-bus/data/l3-shadow-log.jsonl`
4. **可关闭**：环境变量 `L3_SHADOW_MODE=false` 一键禁用

### 5.2 实现方案：Cron生命周期事件包装器

创建 `infrastructure/pipeline/cron-lifecycle-emitter.js`，在cron任务执行前后自动emit事件：

```
cron任务启动 → emit cron.job.started
cron任务完成 → emit cron.job.completed { duration, result }
cron任务失败 → emit cron.job.failed { error }
```

### 5.3 实现方案：L3 Shadow Observer

创建 `infrastructure/pipeline/l3-shadow-observer.js`，消费事件并记录L3"如果做了"会怎样：

```
EventBus.consume(events) → L3Pipeline.dryRun(events) → 记录shadow结果
对比: shadow结果 vs 实际Dispatcher结果 → 写入差异报告
```

### 5.4 部署方式

不修改现有cron配置。创建一个新的cron任务 `l3-shadow-observer` 每5分钟运行一次，与event-dispatcher交替执行。

---

## 第六部分：回滚方案

| 阶段 | 回滚操作 | 时间 |
|------|---------|------|
| Phase 1 | 禁用 l3-shadow-observer cron，删除shadow-log | 1分钟 |
| Phase 2 | 设置 `L3_PIPELINE_ENABLED=false`，旧Dispatcher继续工作 | 1分钟 |
| Phase 3 | 恢复旧Dispatcher为主路径，L3降为旁路 | 5分钟 |
| Phase 4 | 从git恢复被删除的旧代码 | 10分钟 |

---

## 附录：决策记录

### 为什么event-dispatcher是P0？

event-dispatcher cron每5分钟运行Dispatcher，消费bus事件并路由到handlers。L3 Pipeline包含一个Dispatcher v2，两者功能重叠。让L3旁路监听dispatcher的事件，可以：
1. 验证L3路由决策与旧Dispatcher是否一致
2. 发现旧Dispatcher遗漏的事件模式
3. 为Phase 2灰度切换积累数据

### 为什么手动调用延后？

手动调用流程：用户消息 → 主Agent LLM推理 → 技能选择 → 执行。要在这个链路中插入L3意图识别，需要：
1. 修改主Agent的消息处理流程（高侵入）
2. IntentScanner的准确率必须足够高（当前未验证）
3. 延迟增加对用户体验影响大

等L3在事件驱动场景验证成熟后再推进。

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

**文档**: l3-migration-plan
**生成时间**: 2026-03-06T13:01:12.508Z
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
