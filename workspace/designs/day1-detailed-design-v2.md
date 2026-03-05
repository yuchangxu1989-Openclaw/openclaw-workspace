# Day 1 详细设计文档 v2.0 — 执行闭合版

**原始执行日期**: 2026-03-04  
**闭合日期**: 2026-03-05  
**制定者**: 战略家（基于执行记录、债务扫描、QA 评审综合输出）  
**版本**: v2.0 — 不可再修改，作为 Day 2/3 历史基准

---

## TL;DR

Day 1 从零建立了 L3 Pipeline 完整骨架（EventBus → IntentScanner → RuleMatcher → Dispatcher v2 → DecisionLogger），E2E 38/38 通过，凌霄阁有条件通过。但执行过程暴露 **15 条系统性设计债务**，归结为 4 个根因：验收体系无门禁、ISC 只立法不执法、反馈回路开环、工程纪律依赖人而非机制。

---

## 第一部分：背景与原始目标

### 1.1 Day 1 前系统状态（2026-03-03 重构遗产）

138 文件，+13925/-1681 行，已有：
- JSONL 事件总线（bus.js，25/25 单元测试通过）
- ISC 规则库（77 条规则定义，JSON 格式，但零运行时执行）
- DTO 事件桥接、AEO 桥接、CRAS 学习引擎骨架

**核心问题**：三条线（事件总线 / ISC 规则 / DTO 调度）各自独立，无统一处理主路。

### 1.2 Day 1 计划目标

| ID | 目标 | 验收标准 |
|----|------|---------|
| L3-01 | L3 Pipeline 主路（感知→认知→执行）| E2E 至少 1 条真实事件链路走通 |
| L3-02 | IntentScanner（意图识别）| 准确率基准 > 50%，延迟 < 5s |
| L3-03 | RuleMatcher（ISC 规则匹配）| 70+ 条规则正确加载并匹配 |
| L3-04 | Dispatcher v2（四级路由）| 9 条路由规则，100% 分发成功 |
| L3-05 | DecisionLogger（决策日志）| 所有分发结果持久化到 JSONL |
| L3-06 | Feature Flag 体系 | L3_PIPELINE_ENABLED 可控开关 |
| L3-07 | 场景 Benchmark 框架 | 10 个场景 100% 通过 |
| L3-08 | ISC 规则执行绑定审计 | 暴露规则-执行断层 |
| L3-09 | 凌霄阁审议 | 有条件通过 |

---

## 第二部分：实际执行结果

### 2.1 核心交付物

| 交付物 | 文件路径 | 测试 |
|--------|---------|------|
| EventBus 核心模块 | `infrastructure/event-bus/bus.js` | 25/25 ✅ |
| IntentScanner L3 | `infrastructure/intent-engine/intent-scanner.js` | — |
| Intent Registry v1.0 | `infrastructure/intent-engine/intent-registry.json` | 17 条意图 |
| ISC RuleMatcher | `infrastructure/rule-engine/isc-rule-matcher.js` | — |
| Dispatcher v2 | `infrastructure/dispatcher/dispatcher.js` | — |
| DecisionLogger | `infrastructure/decision-log/decision-logger.js` | — |
| bus-adapter.js | `infrastructure/event-bus/bus-adapter.js` | — |
| L3 Pipeline 编排 | `infrastructure/pipeline/l3-pipeline.js` | 38/38 ✅ |
| 场景 Benchmark | `scripts/scenario-benchmark/` 10 个场景 | 10/10（后证实为 mock）|
| L3 接口契约测试 | `designs/l3-interface-contract-v1.md` | 32/32 ✅ |
| ISC 规则精简 | 砍 24 条废弃规则，保留 63 条（22 P0 + 41 P1）| — |

### 2.2 各模块实际产出 vs 计划

#### L3-01：L3 Pipeline 主路 ✅ 完成（旁路模式）

骨架完整，38/38 E2E 通过。实际以"旁路"模式运行——监听事件但不替代旧路径，Feature Flag 控制切换。

**偏差**：入口脚本 `l3-pipeline-cron.js` 存在导出不匹配，QA 独立验收时 `node xxx.js` 直接运行失败（exit 3）。成为 D08 债务。

#### L3-02：IntentScanner ❌ 未达标

| 指标 | 目标 | 实际 |
|------|------|------|
| 整体准确率 | > 50% | **23.8%（19/80）** |
| LLM 延迟均值 | < 5s | **14–93s** |
| IC3/IC4/IC5 覆盖 | — | **0%** |

根因：Regex 路径只覆盖 IC1/IC2；LLM 路径延迟极高大量超时降级到 IC0。

#### L3-03：RuleMatcher ⚠️ 部分达成

实现完成，ISC 规则精简到 63 条。**隐藏问题**：`trigger.events` 字段在规则 JSON 中使用 layered dict 格式（`{"L1":[...]}`），RuleMatcher 期望 flat array，导致 71 个事件全报 `"events is not iterable"`——Day 2 才发现修复。

#### L3-04：Dispatcher v2 ✅ 完成（含隐藏问题）

四级路由（精确 > 精确通配 > 前缀通配 > 全通配），9 条路由规则，10/10 benchmark pass。

**隐藏问题**：routes.json 预注册了 5 个 handler 文件实际不存在（`system-alert.js`、`system-monitor.js`、`memory-archiver.js` 等），对应事件静默写入 `dispatched/` pending 状态，永远不执行。Day 2 才补创建。

#### L3-05：DecisionLogger ✅ 完成

JSONL append 模式，原子写入（文件锁 + buffer），自动 rotation。

#### L3-06：Feature Flag ⚠️ 核心 flag 被关闭

`flags.json` 中 `L3_PIPELINE_ENABLED: false`——核心功能在生产环境被静默禁用。所有 E2E 测试在 Pipeline 实际关闭的环境下进行。成为 D10 债务。

#### L3-07：场景 Benchmark ⚠️ 验收存疑（后证伪）

报告 10/10 通过（100%）。**后来证实**：10 个场景文件全部是手写合成数据，`data_source` 未标注；`runner.js` 模块导入失败时 fallback 到 mock，handler 执行 0 耗时直接 return success。实际通过率 = mock 通过率，非真实系统通过率。成为 D01 债务。

#### L3-08：ISC 规则执行绑定审计 ✅ 完成（发现核心问题）

审计结果：`enforced=0, partial=48, unenforced=39`——**100% 规则无运行时 enforcement**。直接驱动 Day 2 的 D2-01 任务。

#### L3-09：凌霄阁审议 ✅ 有条件通过

5 席有条件通过，2 席通过。条件：ISC enforcement 必须 Day 2 建立运行时层；场景 benchmark 数据来源必须解决；LLM 延迟必须有方案；`L3_PIPELINE_ENABLED` 必须改为 true。

---

## 第三部分：架构决策记录

### ADR-D1-01：L3 Pipeline 以旁路模式启动

旧路径仍是实际执行路径，L3 只做旁路监听和日志记录。Day 2 完成 Gateway 模式切换（D2-08）。

### ADR-D1-02：ISC 规则采用两档制（P0 Gate + P1 Process）

87 条规则精简为 63 条，分 22 条 P0（强制门禁）+ 41 条 P1（流程约束），废弃 24 条无法执行的规则。P0 规则在 Day 2 率先获得 gate_check 实现。

### ADR-D1-03：bus-adapter.js 作为事件总线统一入口

新建 adapter 层兼容 bus.js（旧·cursor 模型）和 event-bus.js（新·时间窗模型），过渡方案。技能的 event-bridge 逐步迁移到 bus-adapter。

### ADR-D1-04：ISC-事件-DTO 绑定设计（v4.3）

五层事件模型（L1 对象生命周期 / L2 量化阈值 / L3 语义意图 / L4 知识发现 / L5 系统性模式 + META 自驱进化），动词封闭集（38 个）× 名词开放层级，支撑 3000+ 条规则仍保持 MECE。设计文件：`designs/isc-event-dto-binding-design-v4.md`（6772 行）。

---

## 第四部分：Day 1 暴露的 15 条设计债务

### 4.1 债务总览

| ID | 债务标题 | 严重度 | 根因 |
|----|---------|--------|------|
| D01 | 场景 Benchmark 全合成数据 | 🔴 P0 | 根因α: 验收无门禁 |
| D02 | ISC 规则零运行时 Enforcement | 🔴 P0 | 根因β: 只立法不执法 |
| D03 | 事件驱动自愈缺失（cron 连续报错 9 次无处理）| 🔴 P0 | 根因γ: 反馈回路开环 |
| D04 | 版本号语义缺失（auto-commit 无条件递增）| 🟡 P1 | 根因δ: 工程纪律靠人 |
| D05 | 任务流转断裂（Day 间 4h 空转）| 🟡 P1 | 根因γ: 反馈回路开环 |
| D06 | 测试/验证流程不查 ISC | 🟡 P1 | 根因β: 只立法不执法 |
| D07 | 意图识别准确率 23.8%，IC3/IC4/IC5 = 0% | 🟡 P1 | 根因α: 验收无门禁 |
| D08 | Pipeline E2E 入口坏了（exit 3）| 🟡 P1 | 根因δ: 工程纪律靠人 |
| D09 | 两套事件总线共存（数据竞争风险）| 🟡 P1 | 根因γ: 反馈回路开环 |
| D10 | L3_PIPELINE_ENABLED=false（核心功能静默关闭）| 🟡 P1 | 根因δ: 工程纪律靠人 |
| D11 | 13 个技能缺失 SKILL.md | 🟢 P2 | 根因β: 只立法不执法 |
| D12 | 技能重叠/功能冗余（3 个视觉技能 + 4 个空壳）| 🟢 P2 | 根因δ: 工程纪律靠人 |
| D13 | Event-Bridge 散落各 Skill（7+ 个碎片）| 🟢 P2 | 根因γ: 反馈回路开环 |
| D14 | Benchmark 数据集质量低（80 条 expected 全为 {}）| 🟢 P2 | 根因α: 验收无门禁 |
| D15 | 自愈模式库极度匮乏（仅 2 个模式）| 🟢 P2 | 根因γ: 反馈回路开环 |

### 4.2 四个系统性根因

**根因α：验收体系"信任链断裂"** — 没有在任何关键节点设计强制门禁，所有验证都是"可选的"。波及：D01、D06、D07、D08、D10、D14。

**根因β：ISC "只立法不执法"** — ISC 被设计为"知识库"而非"执法系统"，79 条规则全是 JSON 文档，enforcement=0%。波及：D02、D06、D11。

**根因γ：反馈回路开环** — 事件发布后无消费确认，cron 报错无人处理，Day 完成后无下一步。波及：D03、D05、D09、D13、D15。

**根因δ：工程纪律依赖人不依赖机制** — 所有"应该"没有自动化检查器。波及：D04、D08、D10、D11、D12。

---

## 第五部分：Day 1 关键数字

| 指标 | 数值 | 备注 |
|------|------|------|
| E2E 测试通过率 | 38/38 (100%) | 旁路模式，L3 实际关闭 |
| 场景 Benchmark | 10/10 (100%) | 后证实为 mock 通过 |
| 接口契约测试 | 32/32 (100%) | L3 模块间 |
| 意图识别准确率 | **23.8%** (19/80) | IC3/IC4/IC5 = 0% |
| ISC 规则总数 | 63 条（精简后）| 22 P0 + 41 P1 |
| ISC 运行时 enforcement | **0%** | 规则即文档，非代码 |
| 技能 SKILL.md 缺失 | 13 个 | — |
| trigger.events 格式错误 | 71 条 | dict 非 array，Day 2 发现 |
| handler 文件不存在 | 5 个 | routes.json 预注册未实现 |
| 凌霄阁审议结果 | 有条件通过 | 5 席有条件 + 2 席通过 |

---

## 第六部分：遗留问题与 Day 2 前置条件

### P0（Day 2 必须首先处理）

| 问题 | Day 2 任务 |
|------|-----------|
| ISC enforcement = 0% | D2-01：建立 3 个 gate_check + pre-commit hook |
| 场景 benchmark 全合成 | D2-02：10 条真实数据 + 来源标注 |
| 事件自愈缺失 | D2-03：cron-healer PoC |
| L3_PIPELINE_ENABLED=false | 快速修复（flags.json 改 true）|
| Pipeline 入口坏了 | D2-05：修复 l3-pipeline-cron.js |

### P1（Day 2 应处理）

版本号空转 → D2-04；意图识别 23.8% → D2-08 + 后续；Day 间流转 → D2-06；Cron 迁移 → D2-07。

---

*Day 1 闭合签章：骨架完整，但骨架只是躯壳。23.8% 的准确率、0% 的 enforcement、全合成的 benchmark——这些不是 Bug，是系统性设计缺口。Day 2 的使命是用真正的执行力填满骨架。*
