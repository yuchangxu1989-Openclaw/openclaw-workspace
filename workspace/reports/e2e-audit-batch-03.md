# E2E Audit Batch 03（规则21-30）

审计时间：2026-03-10 09:50 GMT+8  
审计范围：`skills/isc-core/rules` 第21-30条规则真实全局展开  
审计方法：按要求执行 `jq` 抽取 + `reference-data` 对照 + handler 文件存在性/长度/片段检查（`wc -l` + `head -20`）

## 审计结果总览

| # | 规则文件 | 规则ID | 意图注册（intent） | 事件注册（trigger.events） | 感知层探针（reference event type对照） | 执行层handler | 结论 |
|---|---|---|---|---|---|---|---|
| 21 | rule.batch-completion-auto-push-001.json | rule.batch-completion-auto-push-001 | 未见直接intent字段 | 无（null） | 无法映射到已注册事件类型 | `handlers/batch-completion-auto-push-001.js` 未找到 | ❌ 缺handler/触发不完整 |
| 22 | rule.caijuedian-tribunal-001.json | rule.caijuedian-tribunal-001 | 未见直接intent字段 | 5个事件（含条件表达式） | 参考列表中未见这些type | `infrastructure/event-bus/handlers/caijuedian-tribunal.js` 存在（111行） | ⚠️ 事件注册疑似未落地到全局type表 |
| 23 | rule.capability-anchor-auto-register-001.json | rule.capability-anchor-auto-register-001 | 未见直接intent字段 | 5个skill/system事件 | 参考列表未见这些type | `handlers/capability-anchor-auto-register-001.js` 未找到 | ❌ 缺handler + 事件未见全局注册 |
| 24 | rule.capability-anchor-lifecycle-sync-001.json | rule.capability-anchor-lifecycle-sync-001 | 未见直接intent字段 | 2个lifecycle事件 | 参考列表未见这些type | `scripts/isc-hooks/rule.capability-anchor-lifecycle-sync-001.sh` 存在（13行） | ⚠️ handler在，但事件注册证据不足 |
| 25 | rule.capability-gap-auto-learn-001.json | rule.capability-gap-auto-learn-001 | 未见直接intent字段 | 4个agent能力缺口事件 | 参考列表未见这些type | `handlers/capability-gap-auto-learn-001.js` 未找到 | ❌ 缺handler + 事件未见全局注册 |
| 26 | rule.coding-quality-thinking-001.json | rule.coding-quality-thinking-001 | 未见直接intent字段 | 1个事件 | 参考列表未见该type | `scripts/isc-hooks/rule.coding-quality-thinking-001.sh` 存在（15行） | ⚠️ 触发事件全局注册证据不足 |
| 27 | rule.completion-handler-001.json | ISC-COMPLETION-HANDLER-001 | 未见直接intent字段 | 无（null） | 无法映射事件 | `scripts/isc-hooks/ISC-COMPLETION-HANDLER-001.sh` 存在（13行） | ⚠️ 无事件触发声明（可能依赖外部机制） |
| 28 | rule.cras-daily-report-001.json | rule.cras-daily-report-001 | 未见直接intent字段 | `cron.cras-daily-report` | 参考列表未见该type | `scripts/isc-hooks/rule.cras-daily-report-001.sh` 存在（3行） | ⚠️ 事件注册证据不足，handler极简 |
| 29 | rule.cras-dual-channel-001.json | rule.cras-dual-channel-001 | 未见直接intent字段 | 2个cras事件 | 参考列表未见这两个type | `handlers/cras-dual-channel.js` 存在（93行） | ⚠️ 事件全局注册证据不足 |
| 30 | rule.cron-task-model-requirement-001.json | rule.cron-task-model-requirement-001 | 未见直接intent字段 | 3个lto事件 | 参考列表未见这些type | `handlers/cron-task-model-requirement.js` 存在（92行） | ⚠️ 事件全局注册证据不足 |

---

## 分项检查明细（4项）

### 1) 意图注册（Intent Registration）
- 本批10条规则的 `jq` 输出均未显示独立 `intent` 字段；以事件触发/钩子为主。
- `reference-data` 中存在通用 intent 相关 type（如 `intent.directive/query/reflect/ruleify`），但与本批规则ID未形成直接一一映射证据。
- 结论：**本批规则意图注册证据弱，偏事件驱动。**

### 2) 事件注册（Event Registration）
- 规则JSON中定义了大量 trigger events（如 `architecture.decision.major`、`skill.lifecycle.modified`、`cron.cras-daily-report` 等）。
- 但 `e2e-audit-reference-data.txt` 的事件type清单中未见上述多数事件字符串。
- 结论：**规则层声明了触发事件，但全局事件type登记证据不足/不一致。**

### 3) 感知层探针（Perception Probe）
- 以 reference data 的 `- 以 reference data 的 `type` 列表作为探针落地证据，发现本批规则触发事件与探针清单重合度低。
- 结论：**感知层对本批规则的事件探针覆盖不足，可能存在“规则已写、探针未接”断层。**

### 4) 执行层 Handler
- 存在且可读（5条）：
  - `infrastructure/event-bus/handlers/caijuedian-tribunal.js`（111）
  - `scripts/isc-hooks/rule.capability-anchor-lifecycle-sync-001.sh`（13）
  - `scripts/isc-hooks/rule.coding-quality-thinking-001.sh`（15）
  - `scripts/isc-hooks/ISC-COMPLETION-HANDLER-001.sh`（13）
  - `scripts/isc-hooks/rule.cras-daily-report-001.sh`（3）
  - `skills/isc-core/handlers/cras-dual-channel.js`（93）
  - `skills/isc-core/handlers/cron-task-model-requirement.js`（92）
- 未找到（3条）：
  - `handlers/batch-completion-auto-push-001.js`
  - `handlers/capability-anchor-auto-register-001.js`
  - `handlers/capability-gap-auto-learn-001.js`
- 结论：**执行层有明显缺口（3/10 直接缺handler）。**

---

## 关键发现
1. **缺失handler（高优先级）**：21/23/25条规则存在“声明路径但文件缺失”。
2. **事件注册漂移**：规则内 `trigger.events` 与 reference `type` 清单不对齐。
3. **触发为空规则**：21、27为 `trigger_events: null`，需确认是否依赖框架内置触发器（否则不可达）。
4. **部分hook为“存在性检查”而非业务执行**：如 lifecycle-sync / completion-handler / daily-report，执行语义偏轻量守卫。

## 建议修复
- 先补齐缺失handler文件或修正规则中的handler路径（21/23/25）。
- 为本批规则 `trigger.events` 在全局事件注册表补充标准type（或建立映射层）。
- 对 `trigger_events: null` 的规则补充触发来源文档与测试用例（证明可达性）。
- 为轻量shell hook增加可观测输出（统一日志topic + 失败告警）。

## 审计结论
- 本批10条规则“端到端全链路可执行性”整体为：**部分通过（7条有handler，3条缺失）+ 事件注册证据普遍不足**。
- 若按严格E2E标准（规则声明→全局事件注册→探针可观测→handler可执行），当前批次建议判定：**未完全通过**。
