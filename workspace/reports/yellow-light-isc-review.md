# ISC 规则"黄灯"审查报告

**审查时间：** 2026-03-06  
**审查范围：** `/root/.openclaw/workspace/skills/isc-core/rules/` 下全部规则  
**审查人：** 洞察分析师（子Agent）  

---

## 执行摘要

| 项目 | 数量 |
|------|------|
| 规则总数 | 100 条 |
| ✅ 绿灯（有对应实现代码） | 25 条 |
| 🟡 黄灯（有价值但缺少执行代码） | **47 条** |
| 🔴 红灯（低价值/纯文档/建议降级） | 28 条 |

**核心发现：** 已实现的 handler 文件只有 5 个（`handlers/` 下）+ 少量 `scripts/`，覆盖的规则不到 1/4。47 条黄灯规则中，包含 **22 条 P0_gate 级别**的关键治理规则，这些规则按设计应"阻断"不合规行为，但实际上无任何代码执行。

> ⚠️ **最大讽刺：** `rule.arch-rule-equals-code-002`（规则即代码）和 `rule.meta-enforcement-gate-001`（规则必须有执行机制）自身均无实现代码，其 handler 均不存在于文件系统中。

---

## 黄灯规则清单

### 🔴 一类黄灯：P0_gate + 无 handler（最高优先级补码）

这些规则声称是系统门禁（P0_gate），却完全没有执行代码，等同于"无门的门禁"。

---

#### 1. `rule.arch-rule-equals-code-002` — 规则即代码

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 10/10 |
| **handler** | `enforcement-audit`（文件不存在） |
| **感知层** | ❌ 无 |
| **认知层** | ❌ 无 |
| **执行层** | ❌ 无 |
| **建议** | 🔧 **保留并补代码**（最高优先级）|

**说明：** 这是整个 ISC 体系的元治理规则，规定"每条规则 JSON 必须对应一个 gate 实现"。它自身没有实现代码，导致本次审查发现的所有黄灯规则实际上从未被系统自动检测过。建议实现为：定期扫描 `rules/` 目录，检查每个 JSON 的 `action.handler` 字段是否对应真实文件，若不存在则告警。

---

#### 2. `rule.meta-enforcement-gate-001` — 规则必须有强制执行机制

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 9/10 |
| **handler** | NONE |
| **感知层** | ❌ 无 |
| **认知层** | ❌ 无 |
| **执行层** | ❌ 无 |
| **建议** | 🔧 **保留并补代码**（可与 rule-002 合并实现） |

**说明：** 与上条规则高度协同——"写了但没挂执行的规则等于废纸"。两条规则可共用同一个扫描器实现，定期输出黄灯规则清单。

---

#### 3. `rule.arch-gate-before-action-001` — 任何操作必须通过 Gate

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 9/10 |
| **handler** | `enforcement-engine`（文件不存在） |
| **感知层** | ❌ 无 |
| **认知层** | ❌ 无 |
| **执行层** | ❌ 无 |
| **建议** | 🔧 **保留并补代码** |

**说明：** "任何影响系统状态的操作必须通过至少一个自动化 Gate 检查"。这是架构安全的核心原则，但没有代码就无法在 CI/CD 或事件总线中拦截操作。建议在 `handlers/` 中增加 `enforcement-engine.js`，接受操作事件并检查是否有注册的 Gate 规则。

---

#### 4. `rule.five-layer-event-model-001` — 五层事件模型

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 9/10 |
| **handler** | NONE |
| **感知层** | ❌ 无 |
| **认知层** | ❌ 无 |
| **执行层** | ❌ 无 |
| **建议** | 🔧 **保留并补代码** |

**说明：** 定义了 L1-L5 五层事件分类体系，是整个事件总线的基础架构。没有 validator 就无法校验事件是否符合分层规范。建议实现事件 schema 验证器，在事件 emit 时校验分层合规性。

---

#### 5. `rule.layered-decoupling-architecture-001` — 感知/认知/执行三层解耦

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 9/10 |
| **handler** | NONE |
| **感知层** | ❌ 无（无架构扫描探针） |
| **认知层** | ❌ 无（无合规判断引擎） |
| **执行层** | ❌ 无（无拦截动作） |
| **建议** | 🔧 **保留并补代码** |

**说明：** 规定所有规则/任务/技能必须明确三层归属。本报告的审查框架（感知层/认知层/执行层）即基于此规则。建议在规则 JSON schema 中强制要求填写三层归属字段，并在 `isc-validator.js` 中加入校验。

---

#### 6. `rule.isc-skill-security-gate-030` — 技能发布安全门禁

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 9/10 |
| **handler** | NONE |
| **感知层** | ❌ 无 |
| **认知层** | ❌ 无 |
| **执行层** | ❌ 无 |
| **建议** | 🔧 **保留并补代码** |

**说明：** 声称基于 Snyk 8 类威胁检测进行技能发布前置门禁，但完全没有实现。这是供应链安全的核心。建议至少实现基础版：扫描技能代码中的 hardcode 密钥、危险 API 调用（`exec`、`rm -rf` 等），阻断明显高危技能发布。

---

#### 7. `rule.n033-gateway-config-protection` — 禁止自动修改 Gateway 配置

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 8/10 |
| **handler** | NONE |
| **感知层** | ❌ 无 |
| **认知层** | ❌ 无 |
| **执行层** | ❌ 无 |
| **建议** | 🔧 **保留并补代码** |

**说明：** "所有 Gateway/飞书/Agent/模型配置修改必须用户人工确认"。这是防止 AI 意外损坏核心配置的关键护栏，但没有任何 hook 监听配置文件变更。建议监听 `openclaw.json`、`config/` 等文件变更事件，触发人工确认流程。

---

#### 8. `rule.self-correction-to-rule-001` — 自我纠偏固化为规则

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 8/10 |
| **handler** | NONE |
| **感知层** | ❌ 无意图检测 |
| **认知层** | ❌ 无 |
| **执行层** | ❌ 无 |
| **建议** | 🔧 **保留并补代码** |

**说明：** "Agent 承认行为缺陷时必须立即固化为规则"。这是 ISC 的自进化机制，没有感知层就无法捕获"承认缺陷"语义意图。建议在对话后处理流水线中添加语义意图分类，识别 `agent.self_correction` 事件。

---

#### 9. `rule.architecture-review-pipeline-001` — 架构评审流水线

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 8/10 |
| **handler** | NONE |
| **感知层** | ❌ 无 |
| **认知层** | ❌ 无 |
| **执行层** | ❌ 无 |
| **建议** | 🔧 **保留并补代码** |

**说明：** 规定架构方案必须经过标准化评审流水线（架构师→工程师→质量分析师→裁决殿终审→用户裁决）。建议实现为一个 checklist 驱动的状态机，在设计文档提交时触发，追踪各环节审批状态。

---

#### 10. `rule.umr-intent-routing-001` — 意图路由

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 8/10 |
| **handler** | NONE |
| **感知层** | ❌ 无 |
| **认知层** | ❌ 无 |
| **执行层** | ❌ 无 |
| **建议** | 🔧 **保留并补代码** |

**说明：** "基于 IntentScanner 意图分类（IC1-IC5）将 user.message 路由到对应处理器"。这是整个意图路由系统的核心规则，但没有实现。建议在 `bin/` 中增加 `umr-intent-router.js`。

---

#### 11. `rule.isc-skill-permission-classification-031` — 权限分类

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 8/10 |
| **handler** | NONE |
| **感知层** | ❌ 无 |
| **认知层** | ❌ 无 |
| **执行层** | ❌ 无 |
| **建议** | 🔧 **保留并补代码** |

**说明：** Filesystem/Network/Shell/Credential 四维度权限标注，实现最小权限原则。建议在技能创建时扫描代码，自动分类权限级别，拒绝未声明权限的危险调用。

---

#### 12. `rule.scenario-acceptance-gate-001` — 场景化验收门禁

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 8/10 |
| **handler** | NONE |
| **建议** | 🔧 **保留并补代码** |

**说明：** "功能测试通过不代表系统合格，必须有端到端场景测试"。建议实现为验收报告模板校验，拒绝缺少场景测试覆盖率数据的报告。

---

#### 13. `rule.subagent-checkpoint-gate-001` — 子 Agent 分段检查点

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 8/10 |
| **handler** | `subagent-checkpoint-gate`（文件不存在） |
| **建议** | 🔧 **保留并补代码** |

**说明：** "禁止单次长程任务（>5min 或 >20k tokens）不产出中间结果"。建议在子 Agent spawn 时注入 token/时间限制，超限自动触发检查点回调。

---

#### 14. `rule.isc-rule-auto-decompose-001` — 规则自动拆解

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 7/10 |
| **handler** | NONE |
| **建议** | 🔧 **保留并补代码** |

**说明：** "规则创建后自动拆解事件绑定、DTO关联、三层归属验证"。这是规则质量的前置保障，建议在 `isc-smart-creator.js` 中增加创建后自动校验流程。

---

#### 15. `rule.isc-creation-gate-001` — 规则创建闸门

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 7/10 |
| **handler** | NONE |
| **建议** | 🔧 **保留并补代码** |

**说明：** "创建时强制验证，拒绝不符合标准的规则"。与 `isc-standard-format-001` 协同，建议在 `isc-smart-creator.js` 中集中实现创建门禁。

---

#### 16. `rule.isc-standard-format-001` — 规则格式标准

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 7/10 |
| **handler** | NONE |
| **建议** | 🔧 **合并到 `isc-creation-gate-001` 实现** |

---

#### 17. `rule.skill-distribution-separation-001` — 技能发布合规检查

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 7/10 |
| **handler** | NONE |
| **建议** | 🔧 **保留并补代码** |

**说明：** "发布到 EvoMap 前检查 distribution 标记、权限声明、密钥泄露"。建议合并到 `isc-skill-security-gate-030` 的实现中。

---

#### 18. `rule.n034-rule-identity-accuracy` — 规则身份准确性

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 7/10 |
| **handler** | NONE |
| **建议** | 🔧 **保留并补代码** |

**说明：** "强制从文件系统实际计数规则，禁止推断或缓存"。建议在规则查询 API 中添加实时文件系统扫描，禁止使用缓存计数。

---

#### 19. `rule.n029-model-api-key-pool-management-029` — API Key 池管理

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 7/10 |
| **handler** | NONE |
| **建议** | 🔧 **保留并补代码** |

**说明：** "多 Key 并行调度、失效自动切换、负载均衡"。是系统可用性的关键保障，建议实现为 `bin/api-key-pool-manager.js`。

---

#### 20. `rule.interactive-card-context-inference-001` — 卡片上下文推断

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 7/10 |
| **handler** | NONE |
| **建议** | 🔧 **保留并补代码** |

**说明：** "收到 Interactive Card 回复时，不得询问用户卡片内容，必须根据上下文推断"。建议在消息处理中间件中添加卡片引用识别逻辑。

---

#### 21. `rule.planning-time-granularity-037` — 计划时间粒度

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 6/10 |
| **handler** | NONE，但 `enforcement: strict` |
| **建议** | 🔧 **保留并补代码** |

**说明：** "禁止按日/周/月列计划，必须以分钟/小时为单位"。建议在计划生成模板中增加时间粒度校验。

---

#### 22. `rule.cron-task-model-requirement-001` — 定时任务模型规范

| 维度 | 评估 |
|------|------|
| **规则价值** | ⭐ 6/10 |
| **handler** | NONE |
| **建议** | 🔧 **保留并补代码** |

---

### 🟡 二类黄灯：有名字的 handler 但文件不存在（半实现规则）

这些规则已命名 handler，说明曾有实现意图，但代码从未落地或已丢失。

| 规则 ID | Handler 名 | 价值评分 | 建议 |
|---------|-----------|----------|------|
| `rule.arch-feedback-must-close-003` | `event-health-monitor` | 7 | 补代码：事件消费确认监控 |
| `rule.arch-machine-over-human-004` | `automation-gap-scanner` | 7 | 补代码：自动化缺口扫描 |
| `rule.dependency-direction-check-001` | `check-dependency-direction` | 7 | 补代码：依赖方向检查 |
| `rule.version-integrity-gate-001` | `check-version-integrity` | 7 | 补代码：版本号合规检查 |
| `rule.isc-rule-modified-dedup-scan-001` | `dedup-scan` | 6 | 合并到 `scripts/check-rule-dedup.js` |
| `rule.failure-pattern-alert-001` | `notify-alert` | 6 | 补代码：告警通知 handler |
| `rule.report-snapshot-lock-001` | `report-snapshot` | 6 | 补代码：报告快照锁定 |
| `rule.skill-distribution-auto-classify-001` | `classify-skill-distribution` | 6 | 补代码：自动分类逻辑 |
| `rule.vectorization-standard-enforcement-001` | `vectorization-standard-enforcement` | 6 | 补代码：向量化合规检查 |
| `rule.capability-anchor-lifecycle-sync-001` | `capability-anchor-sync` | 5 | 补代码：能力锚点同步 |

---

### 🟡 三类黄灯：P1 流程级别，有明确运营价值但缺代码

这些规则业务价值中等（5-7分），但有明确的感知/执行语义，值得补实现或合并。

| 规则 ID | 价值 | 建议 |
|---------|------|------|
| `rule.cras-dual-channel-001` | 7 | 补代码：快慢双通道意图捕获 |
| `rule.intent-unknown-discovery-001` | 6 | 补代码：周期向量聚类未知意图 |
| `rule.semantic-intent-event-001` | 6 | 补代码：情感/意图信号事件 emit |
| `rule.n016-decision-auto-repair-loop-post-pipeline-016` | 6 | 补代码：流水线后自动修复循环 |
| `rule.n017-detection-cras-recurring-pattern-auto-resolve-017` | 6 | 补代码：重复模式自动解决 |
| `rule.n020-auto-universal-root-cause-analysis-020` | 6 | 补代码：通用根因分析 |
| `rule.n022-detection-architecture-design-isc-compliance-audit-022` | 6 | 合并到架构评审流水线 |
| `rule.n036-memory-loss-recovery` | 5 | 补代码：MEMORY.md 丢失重建 |
| `rule.capability-anchor-auto-register-001` | 7 | 补代码：能力注册自动写入 |
| `rule.isc-skill-index-auto-update-001` | 5 | 合并到 `capability-anchor-auto-register` |
| `rule.isc-change-auto-trigger-alignment-001` | 5 | 补代码：变更后自动对齐检查 |
| `rule.skill-no-direct-llm-call-001` | 5 | 补代码：静态分析检测直接 LLM 调用 |
| `rule.multi-agent-communication-priority-001` | 5 | 补代码：主 Agent 沟通优先 |
| `rule.must-verify-config-before-coding-001` | 5 | 补代码：代码提交前配置校验 |
| `rule.memory-digest-must-verify-001` | 5 | 补代码：记录后磁盘存在性验证 |
| `rule.isc-lto-handshake-001` | 4 | 降级为指南 |
| `rule.parallel-subagent-orchestration-001` | 5 | 补代码：并行子 Agent 编排监控 |

---

## 建议降级为指南的规则（从黄灯移出）

以下规则内容为操作习惯/风格指南，不适合实现为代码 Gate，建议直接降级记录在 SKILL.md 或设计文档中：

| 规则 ID | 原因 |
|---------|------|
| `rule.caijuedian-tribunal-001` | 描述产品功能，不是可执行规则 |
| `rule.glm-vision-priority-001` | 模型选择偏好，应写入配置，不写代码 |
| `rule.naming-skill-bilingual-display-006` | 展示规范，无法 Gate 强制 |
| `rule.detection-report-feishu-card-001` | 格式偏好，应写入报告模板 |
| `rule.visual-output-style-001` | 视觉风格，写入 UI 规范文档 |
| `rule.pipeline-report-filter-001` | 通知过滤，写入报告配置 |
| `rule.project-mgmt-lesson-capture-001` | 项目管理习惯，写入流程文档 |
| `rule.project-mgmt-startup-checklist-001` | 启动检查清单，写入 SKILL.md |
| `rule.intent-ic4-ic5-boundary-001` | 定义文档，非执行规则 |

---

## 优先补码路线图

### 第一批（P0，影响系统可信度）

1. **规则自检扫描器**（合并实现 rule-002 + meta-enforcement-gate-001）
   - 每次 `isc-validator.js` 运行时检查所有规则的 handler 是否存在
   - 输出黄灯报告，数量可追踪

2. **安全门禁**（合并实现 rule-030 + rule-031 + skill-distribution-separation）
   - 技能发布前扫描：密钥检测、危险调用、权限声明
   - 实现 `handlers/security-gate.js`

3. **架构三层验证器**（rule-001 layered-decoupling + rule-005 five-layer-event）
   - 扩展 `isc-validator.js`：校验规则 JSON 中是否声明三层归属

### 第二批（P1，补齐关键流程）

4. **意图路由**（umr-intent-routing + cras-dual-channel）
5. **配置保护 hook**（n033 gateway-config-protection）
6. **子 Agent 检查点**（subagent-checkpoint-gate）
7. **依赖方向检查**（dependency-direction-check）
8. **版本号合规**（version-integrity-gate）

### 第三批（P2，自动化进化能力）

9. **未知意图发现**（intent-unknown-discovery + cras-dual-channel）
10. **能力锚点自动注册**（capability-anchor-auto-register）
11. **自我纠偏→规则**（self-correction-to-rule）

---

## 结论

ISC 规则体系在**定义层面相当完善**，但在**执行层严重空洞**：100 条规则中仅 ~25 条有真实代码支撑，47 条黄灯规则停留在"意图层"而非"执行层"。

核心矛盾在于：体系的核心规则（rules = code、meta-enforcement）自身违反了自己所规定的标准，形成"规则监管真空"——既没有扫描器检测黄灯规则，也没有门禁阻止黄灯规则通过审核。

**建议以"规则自检扫描器"作为第一个落地实现**，使系统具备自我感知黄灯规则的能力，然后基于持续输出的报告，按优先级逐批补齐执行代码。
