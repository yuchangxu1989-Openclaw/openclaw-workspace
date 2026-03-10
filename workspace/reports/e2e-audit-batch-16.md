# E2E 全链路审计 Batch 16（规则 151-160）

> 审计时间：2026-03-10  
> 审计方法：jq 提取 + reference-data 交叉验证  
> 审计项：意图注册 / 事件注册 / 感知层探针 / 执行层 handler

---

## 151. rule.public-skill-quality-gate-001

| 审计项 | 状态 | 详情 |
|--------|------|------|
| 意图注册 | ❌ 未注册 | intent 字段为 null |
| 事件注册 | ⚠️ 未在总线 | trigger_events: `skill.public.pre_publish`, `skill.public.modified`, `git.commit.skills_public` — 均不在 reference-data 已注册事件中 |
| 感知层探针 | ⚠️ 缺失 | 无独立探针，依赖外部触发 |
| 执行层 handler | ✅ 存在 | `scripts/isc-hooks/rule.public-skill-quality-gate-001.sh` |

## 152. rule.quality-over-efficiency-over-cost-001

| 审计项 | 状态 | 详情 |
|--------|------|------|
| 意图注册 | ❌ 未注册 | intent 字段为 null |
| 事件注册 | ⚠️ 未在总线 | trigger_events 为嵌套结构(L1/L2)，含 `architecture.decision.*` 系列 — 均不在 reference-data 已注册事件中 |
| 感知层探针 | ⚠️ 缺失 | 无独立探针 |
| 执行层 handler | ✅ 存在 | `scripts/isc-hooks/rule.quality-over-efficiency-over-cost-001.sh` |

**注意**：id 字段为 null，规则标识缺失。trigger_events 使用非标准嵌套格式。

## 153. rule.quality-skill-no-placeholder-001

| 审计项 | 状态 | 详情 |
|--------|------|------|
| 意图注册 | ❌ 未注册 | intent 字段为 null |
| 事件注册 | ⚠️ 通用事件 | trigger_events: `isc.rule.matched`, `isc.category.matched` — 非领域专属，依赖 ISC 框架路由 |
| 感知层探针 | ⚠️ 缺失 | 无独立探针 |
| 执行层 handler | ✅ 存在 | `scripts/isc-hooks/ISC-SKILL-QUALITY-001.sh`（handler 在 reference-data HANDLER_FILES 中已确认） |

**注意**：id 为 `ISC-SKILL-QUALITY-001`，与文件名不一致。handler 路径使用绝对路径。

## 154. rule.report-readability-001

| 审计项 | 状态 | 详情 |
|--------|------|------|
| 意图注册 | ❌ 未注册 | intent 字段为 null |
| 事件注册 | ⚠️ 未在总线 | trigger_events: `report.created`, `report.modified`, `document.report.created`, `document.report.modified` — 均不在 reference-data 已注册事件中 |
| 感知层探针 | ⚠️ 缺失 | 无独立探针 |
| 执行层 handler | ✅ 存在 | `scripts/isc-hooks/rule.report-readability-001.sh`（绝对路径） |

## 155. rule.report-snapshot-lock-001

| 审计项 | 状态 | 详情 |
|--------|------|------|
| 意图注册 | ❌ 未注册 | intent 字段为 null |
| 事件注册 | ⚠️ 未在总线 | trigger_events: `evaluation.benchmark.completed` — 不在 reference-data 已注册事件中 |
| 感知层探针 | ⚠️ 缺失 | 无独立探针 |
| 执行层 handler | ✅ 存在 | `scripts/isc-hooks/rule.report-snapshot-lock-001.sh` |

## 156. rule.scenario-acceptance-gate-001

| 审计项 | 状态 | 详情 |
|--------|------|------|
| 意图注册 | ❌ 未注册 | intent 字段为 null |
| 事件注册 | ⚠️ 未在总线 | trigger_events: `quality.general.created`, `aeo.general.completed`, `skill.general.completed` — 均不在 reference-data 已注册事件中 |
| 感知层探针 | ⚠️ 缺失 | 无独立探针 |
| 执行层 handler | ✅ 存在 | `scripts/isc-hooks/rule.scenario-acceptance-gate-001.sh` |

## 157. rule.seef-skill-registered-001

| 审计项 | 状态 | 详情 |
|--------|------|------|
| 意图注册 | ❌ 未注册 | intent 字段为 null |
| 事件注册 | ⚠️ 未在总线 | trigger_events: `skill.general.created`, `skill.general.updated` — 均不在 reference-data 已注册事件中 |
| 感知层探针 | ⚠️ 缺失 | 无独立探针 |
| 执行层 handler | ✅ 存在 | `scripts/isc-hooks/rule.seef-skill-registered-001.sh` |

## 158. rule.seef-subskill-orchestration-001

| 审计项 | 状态 | 详情 |
|--------|------|------|
| 意图注册 | ❌ 未注册 | intent 字段为 null |
| 事件注册 | ⚠️ 通用事件 | trigger_events: `isc.rule.matched`, `isc.category.matched` — 非领域专属，依赖 ISC 框架路由 |
| 感知层探针 | ⚠️ 缺失 | 无独立探针 |
| 执行层 handler | ✅ 存在 | `scripts/isc-hooks/rule.seef-subskill-orchestration-001.sh` |

## 159. rule.self-correction-to-rule-001

| 审计项 | 状态 | 详情 |
|--------|------|------|
| 意图注册 | ❌ 未注册 | intent 字段为 null |
| 事件注册 | ⚠️ 未在总线 | trigger_events: `system.behavior.defect_acknowledged` — 不在 reference-data 已注册事件中 |
| 感知层探针 | ⚠️ 缺失 | 无独立探针 |
| 执行层 handler | ✅ 存在 | `scripts/isc-hooks/rule.self-correction-to-rule-001.sh` |

## 160. rule.semantic-intent-event-001

| 审计项 | 状态 | 详情 |
|--------|------|------|
| 意图注册 | ❌ 未注册 | intent 字段为 null |
| 事件注册 | ⚠️ 未在总线 | trigger_events: `intent.detected` — 不在 reference-data 已注册事件中（注：`intent.directive`/`intent.query` 等已注册，但 `intent.detected` 未注册） |
| 感知层探针 | ⚠️ 缺失 | 无独立探针 |
| 执行层 handler | ✅ 存在 | `scripts/isc-hooks/rule.semantic-intent-event-001.sh` |

---

## 汇总统计

| 审计项 | ✅ 通过 | ⚠️ 部分 | ❌ 缺失 |
|--------|---------|---------|---------|
| 意图注册 | 0 | 0 | **10** |
| 事件注册 | 0 | **10** | 0 |
| 感知层探针 | 0 | **10** | 0 |
| 执行层 handler | **10** | 0 | 0 |

### 关键发现

1. **意图注册全缺失**：10/10 规则均无 intent 字段，无法被意图路由系统识别
2. **事件未在总线注册**：8/10 规则的 trigger_events 不在 reference-data 已注册事件列表中；2 条（#153, #158）使用通用 `isc.rule.matched` 事件
3. **感知层探针全缺失**：10/10 规则无独立感知探针
4. **执行层 handler 完整**：10/10 handler 脚本文件均存在
5. **规范问题**：#152 id 为 null；#153 id 与文件名不一致；#152 trigger_events 使用非标准嵌套格式；#153/#154 使用绝对路径
