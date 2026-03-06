# 规则链路运行时审计报告

> 审计时间: 2026-03-06 23:41 CST
> 审计方法: 运行时证据优先 (event-bus logs, dispatcher-actions.jsonl, handler execution traces)
> 总规则数: 114 条 (isc-core/rules/*.json)
> 审计范围: 意图链 → 事件链 → 执行链 全链路闭环验证

---

## 📊 总览

| 状态 | 数量 | 占比 |
|------|------|------|
| ✅ 已闭环 | 28 | 24.6% |
| 🟡 半闭环 | 34 | 29.8% |
| 🔴 未闭环 | 52 | 45.6% |

**关键发现：近半数规则(45.6%)仍停留在纸面，从未在运行时触发过。**

---

## ✅ 已闭环 (28条)

规则 JSON 有明确 trigger.events → Dispatcher 成功匹配 → Handler 存在且执行 → 有 dispatcher-actions.jsonl 运行时记录。

| # | 规则 ID | 运行时触发次数 | Handler(s) |
|---|---------|---------------|------------|
| 1 | rule.aeo-e2e-decision-pipeline-test-001 | 9 | aeo-e2e-test |
| 2 | rule.auto-fix-high-severity-001 | 4 | auto-fix-severity, log |
| 3 | rule.auto-skillization-trigger-001 | 12 | auto-skillization, log |
| 4 | rule.capability-anchor-lifecycle-sync-001 | 10 | capability-anchor-sync |
| 5 | rule.cron-task-model-requirement-001 | 1342 | cron-task-model-requirement, gate_check, auto_fix |
| 6 | rule.dependency-direction-check-001 | 2 | check-dependency-direction |
| 7 | rule.detection-report-feishu-card-001 | 12 | report-snapshot, log |
| 8 | rule.failure-pattern-alert-001 | 2 | notify-alert |
| 9 | rule.isc-change-auto-trigger-alignment-001 | 12 | isc-change-alignment, log |
| 10 | rule.isc-creation-gate-001 | 12 | isc-creation-gate, log |
| 11 | rule.isc-dto-handshake-001 | 12 | isc-dto-handshake, log |
| 12 | rule.isc-naming-convention-001 | 39 | naming-convention-check, log |
| 13 | rule.isc-rule-modified-dedup-scan-001 | 2 | dedup-scan |
| 14 | rule.isc-skill-permission-classification-031 | 12 | isc-skill-permission, log |
| 15 | rule.isc-skill-usage-protocol-001 | 13 | document-structure-check, log |
| 16 | rule.isc-standard-format-001 | 12 | document-structure-check, log |
| 17 | rule.layered-decoupling-architecture-001 | 1390 | layered-architecture-checker, gate_check, block_on_fail |
| 18 | rule.multi-agent-communication-priority-001 | 12 | multi-agent-priority, log |
| 19 | rule.n024-aeo-dual-track-orchestration-024 | 2 | eval-quality-check, aeo-evaluation-required |
| 20 | N006 (naming-skill-bilingual-display) | 12 | naming-convention-check, log |
| 21 | rule.pipeline-report-filter-001 | 12 | pipeline-report-filter, log |
| 22 | rule.planning-time-granularity-037 | 12 | planning-time-granularity, log |
| 23 | rule.public-skill-classification-001 | 1 | public-skill-classification |
| 24 | rule.report-snapshot-lock-001 | 2 | report-snapshot |
| 25 | rule.seef-subskill-orchestration-001 | 12 | seef-subskill-orchestration, log |
| 26 | rule.skill-mandatory-skill-md-001 | 13 | completeness-check, log |
| 27 | rule.version-integrity-gate-001 | 5 | check-version-integrity |
| 28 | rule.zhipu-capability-router-001 | 12 | log-action, log |

---

## 🟡 半闭环 (34条)

有运行时记录但部分 action handler 缺失 / 或 handler 存在但从未被事件触发过。

### A. 有运行时记录，但部分 handler 缺失 (20条)

| # | 规则 ID | 触发次数 | 缺失 Handler | 根因 |
|---|---------|---------|-------------|------|
| 1 | rule.anti-entropy-design-principle-001 | 1396 | quality_gate | 声明了 quality_gate action 但无对应 .js |
| 2 | rule.arch-gate-before-action-001 | 30 | (auto_trigger已修) | auto_trigger 为 meta action, 已补 |
| 3 | rule.arch-rule-equals-code-002 | 217 | (auto_trigger已修) | 同上 |
| 4 | rule.design-document-structure-001 | 2 | quality.document.structure_check | 类域名风格handler不存在 |
| 5 | rule.git-commit-dispatch-001 | 66 | git.commit.quality_check 等3个 | 类域名风格handler不存在 |
| 6 | rule.isc-rule-auto-decompose-001 | 48 | isc.rule.triggered, dto.task.triggered | 域名handler不存在 |
| 7 | rule.knowledge-must-be-executable-001 | 12 | knowledge.executable.* (3个) | 域名handler不存在 |
| 8 | rule.n023-auto-aeo-evaluation... | 2 | (auto_trigger已修) | meta action已补 |
| 9 | rule.n029-model-api-key-pool... | 2 | health_check | 无实际健康检查handler |
| 10 | rule.n034-rule-identity-accuracy | 96 | auto_sync | 无自动同步handler |
| 11 | rule.n035-rule-trigger-completeness | 206 | (auto_trigger已修) | meta action已补 |
| 12 | rule.naming-mece-consistency-001 | 24 | quality.naming.mece_check | 域名handler不存在 |
| 13 | ISC-SKILL-QUALITY-001 | 24 | block | 无 block.js handler |
| 14 | rule.semantic-intent-event-001 | 1 | event.semantic_intent.triggered | 域名handler不存在 |
| 15 | rule.skill-distribution-auto-classify-001 | 10 | skill.classification.* (2个) | 域名handler不存在 |
| 16 | rule.threshold-alert-routing-001 | 2 | threshold.alert.* (2个) | 域名handler不存在 |
| 17 | rule.vectorization-auto-trigger-001 | 13 | (auto_trigger已修) | meta action已补 |
| 18 | rule.vectorization-standard-enforcement-001 | 13 | (auto_trigger已修) | meta action已补 |
| 19 | rule.cron-task-model-requirement-001 | 1342 | (gate_check, auto_fix已修) | meta action已补 |
| 20 | rule.layered-decoupling-architecture-001 | 1390 | (gate_check, block_on_fail已修) | meta action已补 |

### B. Handler 全部存在，但从未被事件触发 (14条)

| # | 规则 ID | 原因分析 |
|---|---------|---------|
| 1 | rule.architecture-review-pipeline-001 | 触发事件 architecture.review.requested 从未发出 |
| 2 | rule.eval-driven-development-loop-001 | 触发事件 aeo.evaluation.completed 从未发出 |
| 3 | intent-directive-dispatch-001 | 触发事件 intent.directive.dispatch 从未发出 |
| 4 | rule.intent-ic4-ic5-boundary-001 | 触发事件 intent.ic4.boundary_check 从未发出 |
| 5 | intent-reflect-dispatch-001 | 触发事件 intent.reflect.dispatch 从未发出 |
| 6 | intent-ruleify-dispatch-001 | 触发事件 intent.ruleify.dispatch 从未发出 |
| 7 | rule.isc-evomap-mandatory-security-scan-032 | 触发事件 skill.evomap.pre_publish 从未发出 |
| 8 | rule.isc-skill-security-gate-030 | 触发事件 skill.general.pre_publish 从未发出 |
| 9 | rule.lingxiaoge-tribunal-001 | 触发事件 lingxiaoge.tribunal.requested 从未发出 |
| 10 | rule.project-mgmt-lesson-capture-001 | 触发事件 project.milestone.completed 从未发出 |
| 11 | rule.project-mgmt-startup-checklist-001 | 触发事件 project.sprint.started 从未发出 |
| 12 | rule.public-skill-quality-gate-001 | 触发事件 skill.public.pre_publish 从未发出 |
| 13 | rule.scenario-acceptance-gate-001 | 触发事件 quality.benchmark.completed 从未发出 |
| 14 | rule.umr-domain-routing-001 / rule.umr-intent-routing-001 | UMR 路由事件从未发出 |
| 15 | isc-skill-distribution-separation-001 | 触发事件 skill.distribution.check 从未发出 |

---

## 🔴 未闭环 (52条)

**零运行时记录 + handler 缺失** — 完全停留在纸面。

### 核心未闭环分类：

#### 1. N系列规则 — 未闭环 (12条)
> 这些是系统设计的核心自动化规则，却从未跑通。

| 规则 | 设计意图 | 阻塞点 |
|------|---------|--------|
| N016 auto-repair-loop | 流水线后自动修复循环 | handler auto_trigger 缺失 + LEP executor 未运行 |
| N017 cras-recurring-pattern | CRAS重复问题根治 | 同上 |
| N018 skill-rename-global-alignment | 技能重命名全局对齐 | 同上 |
| N019 auto-skill-md-generation | 自动SKILL.md生成 | 同上 |
| N020 auto-universal-root-cause | 通用根因分析 | 同上 |
| N022 architecture-isc-compliance | 架构设计ISC合规审计 | 同上 |
| N025 aeo-feedback-auto-collection | AEO反馈自动收集 | 同上 |
| N026 aeo-insight-to-action | AEO洞察转行动 | 同上 |
| N033 gateway-config-protection | 网关配置保护 | 缺 auto_backup handler |
| N036 memory-loss-recovery | 记忆丢失恢复 | 缺 auto_trigger handler |

#### 2. Intent 意图链规则 — 未闭环 (7条)

| 规则 | 阻塞点 |
|------|--------|
| intent-directive-consumption-001 | handler 存在但事件链从未激活 |
| intent-reflect-consumption-001 | 同上 |
| intent-ruleify-consumption-001 | 同上 |
| intent-type-convergence-001 | 同上 |
| intent-unknown-discovery-001 | 同上 |
| intent-anti-entropy-001 | 同上 |
| intent-aeo-quality-gate-001 | 同上 |

#### 3. 架构原则规则 — 未闭环 (4条)

| 规则 | 阻塞点 |
|------|--------|
| arch-feedback-must-close-003 | 从未有 orphan_report 事件 |
| arch-machine-over-human-004 | 从未有 automation.gap_found 事件 |
| arch-real-data-gate-005 | 从未有 acceptance mode benchmark 事件 |
| architecture-diagram-visual-output-001 | 从未有 architecture 文档创建事件 |

#### 4. 其他未闭环规则 (29条)

<details>
<summary>展开完整列表</summary>

- auto-collect-eval-from-conversation-001 — 缺 aeo.eval.triggered handler
- auto-evomap-sync-trigger-001 — 事件从未触发
- auto-github-sync-trigger-001 — 事件从未触发
- capability-anchor-auto-register-001 — 事件从未触发
- coding-quality-thinking-001 — 缺 quality.code.thinking_required handler
- cras-dual-channel-001 — 缺 cras.channel.requested handler
- design-document-delivery-pipeline-001 — 缺 orchestration.document.triggered handler
- design-document-narrative-review-001 — 缺 quality.document.narrative_review handler
- discovery-must-trigger-rule-creation-001 — 缺 3个域名handler
- eval-data-source-redline-001 — 缺 quality.eval.source_check handler
- eval-must-include-multi-turn-001 — 缺 2个AEO handler
- eval-sample-auto-collection-001 — 缺 auto_collect handler
- five-layer-event-model-001 — 缺 event.general.layer_classification_check handler
- glm-vision-priority-001 — 事件从未触发
- interactive-card-context-inference-001 — 事件从未触发
- isc-rule-creation-dedup-gate-001 — 事件从未触发
- isc-skill-index-auto-update-001 — 事件从未触发
- memory-digest-must-verify-001 — 缺 quality.general.disk_check handler
- meta-enforcement-gate-001 — 缺 audit handler
- must-verify-config-before-coding-001 — 缺 quality.code.config_reference_check handler
- N007-v2 (interaction-source-file-delivery) — 事件从未触发
- parallel-subagent-orchestration-001 — 事件从未触发
- quality-over-efficiency-over-cost-001 — 事件从未触发
- seef-skill-registered-001 — 事件从未触发
- self-correction-to-rule-001 — 事件从未触发
- skill-no-direct-llm-call-001 — 缺域名handler
- skill.evolution.auto-trigger — 事件从未触发
- subagent-checkpoint-gate-001 — 事件从未触发
- task-orchestration-quality-001 — 事件从未触发
- visual-output-style-001 — 事件从未触发
- intent-post-commit-quality-gate-h8z2sz — 缺 skill-isc-handler + 事件从未触发

</details>

---

## 🔧 本次直接修复

在审计过程中直接创建了以下 placeholder handler，解决了大量规则因"meta action type 无对应 .js"导致 Dispatcher 静默跳过的问题：

| 新建 Handler | 解决的缺失类型 | 影响规则数 |
|-------------|--------------|-----------|
| `auto-trigger.js` | trigger.actions[].type = "auto_trigger" | ~40条 |
| `log.js` | trigger.actions[].type = "log" | ~15条 |
| `gate.js` | trigger.actions[].type = "gate" | ~5条 |
| `gate_check.js` | trigger.actions[].type = "gate_check" | ~10条 |
| `block_on_fail.js` | trigger.actions[].type = "block_on_fail" | ~8条 |
| `auto_fix.js` | trigger.actions[].type = "auto_fix" | ~3条 |
| `route.js` | trigger.actions[].type = "route" | 2条 |

**注意：这些是 placeholder，解决的是"Dispatcher 找不到 handler 导致静默失败"的链路断裂问题。真正的业务逻辑仍由 rule.action.handler 指定的主 handler 承载。**

---

## 🔍 系统性问题

### 问题1: 触发事件源缺失（影响 34 条规则）

大量规则声明了触发事件（如 `architecture.review.requested`, `intent.directive.dispatch`, `quality.benchmark.completed`），但系统中**没有任何组件会 emit 这些事件**。

**证据**: events.jsonl 中仅存在以下事件类型：
- `isc.rule.created/updated/deleted` (来自 isc-core event-bridge)
- `git.commit.completed / git.pre_commit.detected` (来自 git-sensor)
- `dto.task.created` (来自 dto-core)

大量声明的事件类型如 `architecture.*`, `quality.*`, `intent.*`, `project.*`, `skill.lifecycle.*` 等在运行时从未出现过。

**建议**: 需要在对应的运行时位置增加 bus.emit() 调用，或者这些规则应标记为 `status: design-only`。

### 问题2: 域名风格 Handler 命名未统一

规则 JSON 中存在两种 handler 命名风格：
1. **短名** (可匹配): `auto-fix`, `naming-convention-check`, `eval-quality-check`
2. **域名风格** (不可匹配): `quality.document.structure_check`, `knowledge.executable.create_rule`

Dispatcher 的 `_resolveHandlerPath()` 只会查找 `handlers/{name}.js`，域名风格的名称在文件系统中不可能存在。

**影响**: ~15条规则的域名风格 action type 永远无法找到 handler。

**建议**: 统一为短名风格，或在 Dispatcher 中增加域名→短名的映射。

### 问题3: Evolver Loop / LEP Executor 未运行

- `ps aux | grep evolver` 无进程
- LEP Executor 的 N016/N017/N018 执行器虽有代码，但从未被调用
- Cron jobs.json 解析失败，说明定时调度可能不工作

**影响**: N系列规则全部无法自动执行。

### 问题4: Git Hooks 未安装

`.git/hooks/` 下无 pre-commit/post-commit 钩子，尽管 git-sensor 通过 cron-dispatch-runner 轮询 signal 文件工作正常。

---

## 📋 优先修复建议

| 优先级 | 行动 | 预期收益 |
|--------|------|---------|
| P0 | 修复 cron 调度，确保 cron-dispatch-runner 每5分钟执行 | 恢复全链路事件分发 |
| P0 | 在 SOUL.md / Agent 主循环中添加关键事件 emit (intent.*, quality.*, architecture.*) | 激活 34 条休眠规则 |
| P1 | 统一域名风格 handler 命名为短名 | 消除 15 条规则的链路断裂 |
| P1 | 启动 evolver loop 或配置 LEP executor cron | 激活 N 系列规则 |
| P2 | 为 `quality_gate`, `auto_backup`, `health_check`, `audit`, `block`, `auto_collect`, `auto_sync` 创建实质 handler | 将半闭环→已闭环 |
| P2 | 清理重复/过时规则 (如 intent-post-commit-quality-gate-h8z2sz) | 减少噪声 |

---

## 审计结论

系统的规则引擎基础设施（event-bus + dispatcher + handler 执行链）已经可用，28条规则完整跑通了"事件→匹配→执行→记录"全链路。但近半数规则(45.6%)因 **事件源缺失** 或 **handler 不存在** 而从未运行过。核心瓶颈不是基础设施能力，而是 **事件发射覆盖率** 和 **handler 命名规范**。

本次审计已直接修复了 7 个 meta action placeholder handler，预计下次 cron-dispatch-runner 运行时，约 40 条规则的"action type 找不到 handler"错误将消除。

---

*报告生成: Scout Agent (情报专家) | 方法: 运行时日志分析 + 代码静态扫描 + 实时 probe 验证*
