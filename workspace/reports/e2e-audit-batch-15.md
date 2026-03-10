# E2E 全链路审计 Batch 15（规则 141-150）

> 审计时间：2026-03-10  
> 审计维度：意图注册 / 事件注册 / 感知层探针 / 执行层 handler  
> 参考数据：`reports/e2e-audit-reference-data.txt`

---

## 141. rule.pipeline-benchmark-skill-publish-security-gate-001

| 维度 | 状态 | 说明 |
|------|------|------|
| 意图注册 | ❌ 未注册 | intent-registry 中无对应意图 |
| 事件注册 | ⚠️ 未在全局事件注册表 | 触发事件 `skill.publish` 未在 reference-data 事件列表中 |
| 感知层探针 | ⚠️ 依赖外部事件 | 需 `skill.publish` 事件源，无独立探针 |
| 执行层 handler | ✅ 存在 | `skills/isc-core/infrastructure/event-bus/handlers/handle-pipeline-benchmark-skill-publish-security-gate-001.sh`（规则声明路径 `infrastructure/event-bus/handlers/...` 相对于 isc-core skill） |

**问题**：handler 路径为 skill 内部相对路径，workspace 根下不存在；`skill.publish` 事件未在全局注册。

---

## 142. rule.pipeline-benchmark-workflow-requested-001

| 维度 | 状态 | 说明 |
|------|------|------|
| 意图注册 | ❌ 未注册 | intent-registry 中无对应意图 |
| 事件注册 | ⚠️ 未在全局事件注册表 | 触发事件 `workflow.requested` 未在 reference-data 事件列表中 |
| 感知层探针 | ⚠️ 依赖外部事件 | 需 `workflow.requested` 事件源 |
| 执行层 handler | ✅ 存在 | `scripts/isc-hooks/rule.pipeline-benchmark-workflow-requested-001.sh` |

**问题**：`workflow.requested` 事件未注册到全局事件总线。

---

## 143. rule.pipeline-report-filter-001

| 维度 | 状态 | 说明 |
|------|------|------|
| 意图注册 | ❌ 未注册 | intent-registry 中无对应意图 |
| 事件注册 | ✅ 已注册 | 触发事件 `isc.rule.matched`, `isc.category.matched` 均为 ISC 内部事件 |
| 感知层探针 | ✅ ISC 内部探针 | 由 ISC 引擎自身触发 |
| 执行层 handler | ⚠️ 路径不匹配 | 规则声明 `handlers/pipeline-report-filter-001.js`，实际文件 `infrastructure/event-bus/handlers/pipeline-report-filter.js`（文件名不一致） |

**问题**：handler 声明路径与实际文件路径/文件名不一致（`-001` 后缀差异）。

---

## 144. rule.planning-time-granularity-037

| 维度 | 状态 | 说明 |
|------|------|------|
| 意图注册 | ❌ 未注册 | intent-registry 中无对应意图 |
| 事件注册 | ✅ 已注册 | 触发事件 `isc.rule.matched`, `isc.category.matched` |
| 感知层探针 | ✅ ISC 内部探针 | 由 ISC 引擎匹配时触发 |
| 执行层 handler | ✅ 存在 | `scripts/isc-hooks/planning-time-granularity-037.sh` |

**状态**：✅ 链路基本完整（ISC 内部事件驱动型规则）。

---

## 145. rule.project-artifact-gate-001

| 维度 | 状态 | 说明 |
|------|------|------|
| 意图注册 | ❌ 未注册 | intent-registry 中无对应意图 |
| 事件注册 | ⚠️ 未在全局事件注册表 | 触发事件 `task.status.completed`, `task.status.done`, `subtask.status.completed`, `sprint.day.completed` 均未在 reference-data 中 |
| 感知层探针 | ⚠️ 依赖外部事件 | 需任务/冲刺生命周期事件源 |
| 执行层 handler | ⚠️ 路径问题 | 声明 `infrastructure/event-bus/handlers/handle-project-artifact-gate-001.sh`，workspace 根下不存在，isc-core skill 内存在 |

**问题**：规则 `id` 为 null（缺少 id 字段）；4 个触发事件均未全局注册；handler 路径为 skill 相对路径。

---

## 146. rule.project-artifact-settlement-001

| 维度 | 状态 | 说明 |
|------|------|------|
| 意图注册 | ❌ 未注册 | intent-registry 中无对应意图 |
| 事件注册 | ⚠️ 未在全局事件注册表 | 触发事件（L2: `subagent.task.completed`, `orchestration.subagent.completed`, `pipeline.stage.completed`; META: `system.day.closure_requested`）均未注册 |
| 感知层探针 | ⚠️ 依赖外部事件 | 多层事件源，无独立探针 |
| 执行层 handler | ❌ 缺失 | `handlers/project-artifact-settlement-001.js` 在 workspace 中未找到 |

**问题**：handler 文件完全缺失；trigger 使用分层结构（L2/META）但事件均未注册。

---

## 147. rule.project-mgmt-lesson-capture-001

| 维度 | 状态 | 说明 |
|------|------|------|
| 意图注册 | ❌ 未注册 | intent-registry 中无对应意图 |
| 事件注册 | ⚠️ 未在全局事件注册表 | 触发事件 `sprint.completed`, `sprint.aborted`, `project.milestone.reached` 等均未在 reference-data 中 |
| 感知层探针 | ⚠️ 依赖外部事件 | 含条件触发器（`review.rejected.count >= 2`, `task.overdue.ratio > 0.5`），需指标采集探针 |
| 执行层 handler | ✅ 存在 | `scripts/isc-hooks/rule.project-mgmt-lesson-capture-001.sh`（使用绝对路径） |

**问题**：规则 `id` 为 null；条件型触发器（阈值判断）缺乏感知层指标采集机制；handler 使用绝对路径。

---

## 148. rule.project-mgmt-startup-checklist-001

| 维度 | 状态 | 说明 |
|------|------|------|
| 意图注册 | ❌ 未注册 | intent-registry 中无对应意图 |
| 事件注册 | ⚠️ 未在全局事件注册表 | 触发事件 `project.started`, `sprint.started`, `task.orchestration.initiated` 均未注册 |
| 感知层探针 | ⚠️ 依赖外部事件 | 需项目/冲刺启动事件源 |
| 执行层 handler | ✅ 存在 | `scripts/isc-hooks/rule.project-mgmt-startup-checklist-001.sh` |

**问题**：规则 `id` 为 null；触发事件均未在全局事件总线注册。

---

## 149. rule.project-tracker-hygiene-001

| 维度 | 状态 | 说明 |
|------|------|------|
| 意图注册 | ❌ 未注册 | intent-registry 中无对应意图 |
| 事件注册 | ⚠️ 未在全局事件注册表 | 触发事件（L2: `task.status.changed`, `task.lifecycle.updated`, `orchestration.task.completed`, `orchestration.task.blocked`; META: `system.day.closure_requested`）均未注册 |
| 感知层探针 | ⚠️ 依赖外部事件 | 多层事件源 |
| 执行层 handler | ✅ 存在 | `scripts/isc-hooks/project-tracker-hygiene-001.sh`（使用绝对路径） |

**问题**：分层触发结构（L2/META）但事件均未全局注册；handler 使用绝对路径。

---

## 150. rule.public-skill-classification-001

| 维度 | 状态 | 说明 |
|------|------|------|
| 意图注册 | ❌ 未注册 | intent-registry 中无对应意图 |
| 事件注册 | ⚠️ 未在全局事件注册表 | 触发事件 `skill.created`, `skill.modified`, `skill.skill_md.updated` 均未在 reference-data 事件列表中 |
| 感知层探针 | ⚠️ 依赖外部事件 | 需 skill 生命周期事件源 |
| 执行层 handler | ✅ 存在 | `scripts/isc-hooks/rule.public-skill-classification-001.sh` |

**问题**：skill 生命周期事件未在全局事件总线注册。

---

## 汇总统计

| 维度 | ✅ 通过 | ⚠️ 部分问题 | ❌ 缺失 |
|------|---------|-------------|---------|
| 意图注册 | 0 | 0 | **10** |
| 事件注册 | 2 | 8 | 0 |
| 感知层探针 | 2 | 8 | 0 |
| 执行层 handler | 7 | 2 | **1** |

### 关键发现

1. **意图注册全部缺失**：10 条规则均未在 intent-registry 中注册意图
2. **3 条规则缺少 id 字段**：#145, #147, #148 的 `id` 为 null
3. **1 条规则 handler 完全缺失**：#146 `project-artifact-settlement-001` 的 handler 文件不存在
4. **2 条规则 handler 路径不匹配**：#141 和 #145 的 handler 在 workspace 根下不存在（仅在 isc-core skill 内部存在）
5. **1 条规则 handler 文件名不一致**：#143 声明 `pipeline-report-filter-001.js` vs 实际 `pipeline-report-filter.js`
6. **大量触发事件未全局注册**：项目管理类事件（task/sprint/project 生命周期）和 skill 生命周期事件均未在事件总线中注册
7. **2 条规则使用分层触发结构**（L2/META）：#146 和 #149，但分层事件路由机制是否实现未知
