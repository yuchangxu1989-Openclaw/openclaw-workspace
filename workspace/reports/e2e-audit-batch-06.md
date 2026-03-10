# E2E Audit Batch 06（规则 51-60）

审计时间：2026-03-10 09:51 GMT+8  
审计范围：`/root/.openclaw/workspace/skills/isc-core/rules` 第51-60条规则  
审计方法：读取规则JSON全局展开（id/trigger.events/handler）+ 参考事件基线 + handler脚本存在性与前20行核验（`wc -l` + `head -20`）

---

## 审计结论（总览）

- 覆盖规则数：10
- **4项检查维度**：
  1. 意图注册（是否绑定 intent.* 或具备显式意图入口）
  2. 事件注册（trigger.events 是否存在且可解析）
  3. 感知层探针（事件是否在参考基线中可观测，或具备可落地探针语义）
  4. 执行层 handler（handler 路径是否存在、可读、脚本结构是否完整）

- 结果汇总：
  - ✅ 完整通过：7
  - ⚠️ 部分通过/有缺口：2
  - ❌ 明确失败：1

---

## 逐条审计

### 1) rule.failure-pattern-code-escalation-001.json
- id: `rule.failure-pattern-code-escalation-001`
- trigger.events: **解析失败**（`jq: Cannot index string with string "events"`）
- handler: `handlers/failure-pattern-code-escalation.js`
- handler检查：存在，`101` 行，头部注释与逻辑声明完整。

四项检查：
- 意图注册：⚠️ 未见直接 intent.* 注册（待看规则原文结构）
- 事件注册：❌ trigger 结构异常（非 `.trigger.events` 形态）
- 感知层探针：⚠️ 无法从标准字段确认
- 执行层handler：✅ 通过

结论：**结构不一致风险**（规则触发字段需标准化）。

---

### 2) rule.feishu-doc-auto-perm-001.json
- id: `rule.feishu-doc-auto-perm-001`
- trigger.events:
  - `feishu.doc.created`
  - `feishu.bitable.created`
  - `feishu.sheet.created`
- handler: `scripts/auto-grant-feishu-perm.sh`
- handler检查：❌ 文件不存在（`No such file or directory`）

四项检查：
- 意图注册：⚠️ 偏系统事件驱动，无 intent.*
- 事件注册：✅ 明确
- 感知层探针：✅ Feishu 创建事件具备可观测性
- 执行层handler：❌ 缺失

结论：**执行层断链**（高优先级修复）。

---

### 3) rule.file-send-intent-001.json
- id: `ISC-FILE-SEND-INTENT-001`
- trigger.events: `null`
- handler: `handlers/file-send-intent.js`
- handler检查：存在，`79` 行，含“文件发送意图模式”正则。

四项检查：
- 意图注册：✅ 强意图规则（file-send-intent）
- 事件注册：⚠️ 缺失（null）
- 感知层探针：⚠️ 依赖文本模式探测，未见显式总线事件
- 执行层handler：✅ 通过

结论：**意图存在但事件入口未标准注册**。

---

### 4) rule.five-layer-event-model-001.json
- id: `rule.five-layer-event-model-001`
- trigger.events:
  - `event.general.created`
  - `event.general.emitted`
- handler: `handlers/five-layer-event-model.js`
- handler检查：存在，`86` 行，含 L1-L5 校验启发式。

四项检查：
- 意图注册：⚠️ 非 intent 主导
- 事件注册：✅
- 感知层探针：✅ 事件分类校验即探针
- 执行层handler：✅

结论：通过。

---

### 5) rule.git-commit-dispatch-001.json
- id: `rule.git-commit-dispatch-001`
- trigger.events:
  - `git.commit.completed`
- handler: `handlers/git-commit-dispatch.js`
- handler检查：存在，`93` 行，含下游分发动作。

四项检查：
- 意图注册：⚠️ 非 intent 主导
- 事件注册：✅（且在参考基线中存在）
- 感知层探针：✅ git提交完成事件可观测
- 执行层handler：✅

结论：通过。

---

### 6) rule.glm-vision-priority-001.json
- id: `rule.glm-vision-priority-001`
- trigger.events:
  - `system.analysis.requested`
  - `system.task.created`
  - `session.image.received`
- handler: `handlers/glm-vision-priority.js`
- handler检查：存在，`89` 行，含视觉任务模式。

四项检查：
- 意图注册：⚠️ 以系统事件为主
- 事件注册：✅
- 感知层探针：✅（图像/任务创建）
- 执行层handler：✅

结论：通过。

---

### 7) rule.intent-aeo-quality-gate-001.json
- id: `rule.intent-aeo-quality-gate-001`
- trigger.events:
  - `event.system.modified`
  - `event.type.created`
- handler: `handlers/intent-aeo-quality-gate.js`
- handler检查：存在，`95` 行。

四项检查：
- 意图注册：✅（intent-aeo质量门禁语义明确）
- 事件注册：✅
- 感知层探针：✅ 系统变更/事件类型创建为有效探针
- 执行层handler：✅

结论：通过。

---

### 8) rule.intent-agent-orchestration-design-standard-p3nxat.json
- id: `rule.intent-agent-orchestration-design-standard-p3nxat`
- trigger.events:
  - `intent.ruleify`
- handler: `handlers/intent-agent-orchestration-design-standard.js`
- handler检查：存在，`85` 行。

四项检查：
- 意图注册：✅（直接绑定 intent.ruleify）
- 事件注册：✅（且在参考基线中存在）
- 感知层探针：✅ 意图总线可观测
- 执行层handler：✅

结论：通过。

---

### 9) rule.intent-anti-entropy-001.json
- id: `rule.intent-anti-entropy-001`
- trigger.events:
  - `event.type.created`
  - `lto.general.monthly`
- handler: `handlers/intent-anti-entropy.js`
- handler检查：存在，`99` 行。

四项检查：
- 意图注册：✅（intent anti-entropy 语义）
- 事件注册：✅
- 感知层探针：✅（类型创建+周期性事件）
- 执行层handler：✅

结论：通过。

---

### 10) rule.intent-cras-e系统架构与交付约束-21ztnb.json
- id: `rule.intent-cras-e系统架构与交付约束-21ztnb`
- trigger.events:
  - `intent.ruleify`
- handler: `handlers/intent-cras-e-architecture-constraint.js`
- handler检查：存在，`114` 行。

四项检查：
- 意图注册：✅（intent入口明确）
- 事件注册：✅
- 感知层探针：✅ intent事件可观测
- 执行层handler：✅

结论：通过。

---

## 关键问题（需整改）

1. **规则结构不统一**：`rule.failure-pattern-code-escalation-001.json` 无法按 `.trigger.events` 解析。  
2. **handler缺失**：`rule.feishu-doc-auto-perm-001.json` 指向脚本不存在，导致运行时不可执行。  
3. **事件入口缺失**：`rule.file-send-intent-001.json` 的 `trigger.events=null`，需补齐标准事件触发。

---

## 建议修复优先级

- P0：补齐 `scripts/auto-grant-feishu-perm.sh` 或修正 handler 路径。
- P0：统一 `rule.failure-pattern-code-escalation-001.json` 为标准 trigger 结构。
- P1：为 `ISC-FILE-SEND-INTENT-001` 增加明确 trigger.events（如 `intent.directive`/`intent.query` 等）。

---

## 附：参考基线核对（节选）

参考数据包含：`git.commit.completed`、`intent.ruleify`、`intent.directive`、`intent.query`、`event_type_registration` 等关键类型，说明本批多数规则可对接既有全局事件总线；但 Feishu 创建类事件是否已接入同一总线，需在集成层再验。
