# E2E 全链路审计 Batch 14（规则 131-140）

审计时间：2026-03-10  
范围：
- rule.pdca-do-entry-gate-001.json
- rule.pdca-do-exit-gate-001.json
- rule.pdca-plan-entry-gate-001.json
- rule.pdca-plan-exit-gate-001.json
- rule.pipeline-benchmark-analysis-requested-001.json
- rule.pipeline-benchmark-defect-acknowledged-001.json
- rule.pipeline-benchmark-design-document-alignment-001.json
- rule.pipeline-benchmark-design-document-layered-001.json
- rule.pipeline-benchmark-evomap-security-scan-001.json
- rule.pipeline-benchmark-skill-created-alignment-001.json

审计口径（4项）：
1. 意图注册（intent registration）
2. 事件注册（event registration）
3. 感知层探针（probe/trigger source）
4. 执行层 handler（script/implementation）

---

## 131) rule.pdca-do-entry-gate-001
- 规则文件：`skills/isc-core/rules/rule.pdca-do-entry-gate-001.json`
- 执行文件：`scripts/isc-hooks/pdca-do-entry-gate-001.sh`

| 审计项 | 结论 | 证据 |
|---|---|---|
| 意图注册 | ❌ 未见显式 intent.* 注册 | 规则为旧式ISC结构（`trigger: "pdca.phase.do.entry"`），未含 intent 字段 |
| 事件注册 | ✅ 已注册 | `trigger: "pdca.phase.do.entry"` |
| 感知层探针 | ✅ 事件触发型 | 通过 `pdca.phase.do.entry` 事件进入门禁 |
| 执行层handler | ✅ 已落地 | `handler: scripts/isc-hooks/pdca-do-entry-gate-001.sh`，脚本校验 `plan_exit_passed/resources_ready` |

结论：**部分闭环（3/4）**，缺意图层注册映射。

---

## 132) rule.pdca-do-exit-gate-001
- 规则文件：`skills/isc-core/rules/rule.pdca-do-exit-gate-001.json`
- 执行文件：`scripts/isc-hooks/pdca-do-exit-gate-001.sh`

| 审计项 | 结论 | 证据 |
|---|---|---|
| 意图注册 | ❌ 未见显式 intent.* 注册 | 旧式ISC结构，仅 phase trigger |
| 事件注册 | ✅ 已注册 | `trigger: "pdca.phase.do.exit"` |
| 感知层探针 | ✅ 事件触发型 | 依赖 `pdca.phase.do.exit` |
| 执行层handler | ✅ 已落地 | 脚本校验 `deliverables/committed/tests_passed` |

结论：**部分闭环（3/4）**，缺意图层注册映射。

---

## 133) rule.pdca-plan-entry-gate-001
- 规则文件：`skills/isc-core/rules/rule.pdca-plan-entry-gate-001.json`
- 执行文件：`scripts/isc-hooks/pdca-plan-entry-gate-001.sh`

| 审计项 | 结论 | 证据 |
|---|---|---|
| 意图注册 | ❌ 未见显式 intent.* 注册 | 规则为 `trigger: "pdca.phase.plan.entry"` |
| 事件注册 | ✅ 已注册 | `trigger: "pdca.phase.plan.entry"` |
| 感知层探针 | ✅ 事件触发型 | phase entry 事件触发 |
| 执行层handler | ✅ 已落地 | 脚本校验 `source/requirements/goal` |

结论：**部分闭环（3/4）**。

---

## 134) rule.pdca-plan-exit-gate-001
- 规则文件：`skills/isc-core/rules/rule.pdca-plan-exit-gate-001.json`
- 执行文件：`scripts/isc-hooks/pdca-plan-exit-gate-001.sh`

| 审计项 | 结论 | 证据 |
|---|---|---|
| 意图注册 | ❌ 未见显式 intent.* 注册 | 规则仅 phase exit trigger |
| 事件注册 | ✅ 已注册 | `trigger: "pdca.phase.plan.exit"` |
| 感知层探针 | ✅ 事件触发型 | phase exit 事件触发 |
| 执行层handler | ✅ 已落地 | 脚本校验 `goal/deadline/cost_boundary/acceptance_criteria/review_passed` |

结论：**部分闭环（3/4）**。

---

## 135) rule.pipeline-benchmark-analysis-requested-001
- 规则文件：`skills/isc-core/rules/rule.pipeline-benchmark-analysis-requested-001.json`
- 执行文件：`scripts/isc-hooks/rule.pipeline-benchmark-analysis-requested-001.sh`

| 审计项 | 结论 | 证据 |
|---|---|---|
| 意图注册 | ❌ 未见 intent.* 直连 | 仅事件触发 `analysis.requested` |
| 事件注册 | ✅ 已注册 | `trigger.events: ["analysis.requested"]` |
| 感知层探针 | ⚠️ 弱探针/占位 | 仅声明事件兼容；脚本为目录扫描型 skeleton |
| 执行层handler | ⚠️ 已接线但语义弱 | 脚本输出 `pass` + `TODO: bind to event bus` |

结论：**名义闭环，实质弱执行（2.5/4）**。

---

## 136) rule.pipeline-benchmark-defect-acknowledged-001
- 规则文件：`skills/isc-core/rules/rule.pipeline-benchmark-defect-acknowledged-001.json`
- 执行文件：`scripts/isc-hooks/rule.pipeline-benchmark-defect-acknowledged-001.sh`

| 审计项 | 结论 | 证据 |
|---|---|---|
| 意图注册 | ❌ 未见 intent.* 直连 | 仅 `agent.behavior.defect_acknowledged` 事件 |
| 事件注册 | ✅ 已注册 | `trigger.events: ["agent.behavior.defect_acknowledged"]` |
| 感知层探针 | ⚠️ 弱探针/占位 | 脚本仅 find defect 文件 |
| 执行层handler | ⚠️ 已接线但语义弱 | 返回 `pass`，含 `TODO: bind to event bus` |

结论：**名义闭环，实质弱执行（2.5/4）**。

---

## 137) rule.pipeline-benchmark-design-document-alignment-001
- 规则文件：`skills/isc-core/rules/rule.pipeline-benchmark-design-document-alignment-001.json`
- 执行文件：`scripts/isc-hooks/rule.pipeline-benchmark-design-document-alignment-001.sh`

| 审计项 | 结论 | 证据 |
|---|---|---|
| 意图注册 | ❌ 未见 intent.* 直连 | 事件型治理规则 |
| 事件注册 | ✅ 已注册 | `design.document.created/modified` |
| 感知层探针 | ⚠️ 弱探针 | 通过文件名扫描 design/architecture 文档 |
| 执行层handler | ⚠️ 已接线但未做实质约束 | 输出 `TODO: validate governance annotations` |

结论：**名义闭环，执行语义不足（2.5/4）**。

---

## 138) rule.pipeline-benchmark-design-document-layered-001
- 规则文件：`skills/isc-core/rules/rule.pipeline-benchmark-design-document-layered-001.json`
- 执行文件：`scripts/isc-hooks/rule.pipeline-benchmark-design-document-layered-001.sh`

| 审计项 | 结论 | 证据 |
|---|---|---|
| 意图注册 | ❌ 未见 intent.* 直连 | 仅事件定义 |
| 事件注册 | ✅ 已注册 | `design.document.created/modified` |
| 感知层探针 | ⚠️ 弱探针 | 仅检查 rule 文件存在及 action 字段 |
| 执行层handler | ⚠️ skeleton | `DETAIL="skeleton check passed"`，含 TODO 语义 |

结论：**形式闭环，执行层空心化（2/4）**。

---

## 139) rule.pipeline-benchmark-evomap-security-scan-001
- 规则文件：`skills/isc-core/rules/rule.pipeline-benchmark-evomap-security-scan-001.json`
- 执行文件：`scripts/isc-hooks/rule.pipeline-benchmark-evomap-security-scan-001.sh`

| 审计项 | 结论 | 证据 |
|---|---|---|
| 意图注册 | ❌ 未见 intent.* 直连 | 仅 `evomap.sync.request` 事件 |
| 事件注册 | ✅ 已注册 | `trigger.events: ["evomap.sync.request"]` |
| 感知层探针 | ⚠️ 弱探针 | 未见真实安全扫描调用，仅 rule 文件字段检查 |
| 执行层handler | ⚠️ skeleton | 输出 `skeleton check passed` |

结论：**高风险伪闭环（2/4）**。

---

## 140) rule.pipeline-benchmark-skill-created-alignment-001
- 规则文件：`skills/isc-core/rules/rule.pipeline-benchmark-skill-created-alignment-001.json`
- 执行文件：`scripts/isc-hooks/rule.pipeline-benchmark-skill-created-alignment-001.sh`

| 审计项 | 结论 | 证据 |
|---|---|---|
| 意图注册 | ❌ 未见 intent.* 直连 | 仅 `skill.created` 事件触发 |
| 事件注册 | ✅ 已注册 | `trigger.events: ["skill.created"]` |
| 感知层探针 | ⚠️ 弱探针 | 仅存在性/字段级检查 |
| 执行层handler | ⚠️ skeleton | 输出 `skeleton check passed` |

结论：**形式闭环，治理能力待实装（2/4）**。

---

## Batch 14 汇总

- 完整闭环（4/4）：**0/10**
- 部分闭环（3/4）：**4/10**（PDCA 四条）
- 弱/伪闭环（≤2.5/4）：**6/10**（pipeline benchmark 六条）

关键共性问题：
1. **意图注册缺失**：10条均未体现 intent registration 映射（均为事件直驱）。
2. **benchmark链路大量 skeleton handler**：多条脚本仅做文件存在性或关键词扫描，且直接 `status=pass`。
3. **感知层探针弱**：缺少对真实事件载荷字段、上下文、前置状态的严校验。
4. **执行层“有脚本不等于有治理”**：多数处理器未执行实质策略，仅占位。

建议优先级：
- P0：为 139/140/138 补齐真实语义校验与失败分支，移除无条件 pass。
- P1：为 135-137 建立事件总线参数校验（schema + required fields）与审计落盘。
- P1：建立 intent->event 映射注册，补齐“意图注册”环。
