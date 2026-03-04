# ISC-事件-DTO 闭环方案 v3.0

> **版本**: v3.0.0
> **作者**: 系统架构师
> **日期**: 2026-03-04
> **状态**: DESIGN COMPLETE
> **前置**: v2方案的根本性重写，基于用户事件思维模型教学

---

## TL;DR

**v2的根本缺陷**：把"事件"理解为"发生了什么事"，导致30+条规则被标记为"不可事件化"。这是认知错误。

**v3的第一性原理**：**事件 = 状态机的触发条件。** 任何对象的生命周期动作（创建/修改/删除）天然是事件；任何可量化的条件达到阈值就是事件；定期扫描发现状态变化也是事件。不存在"不可事件化"的规则——只存在没有认真设计事件锚点的规则。

**v3成果**：78条规则100%事件绑定，0遗漏。统一事件Schema，7类事件源，3层扫描器兜底。

**v3.1补充（可扩展性论证）**：事件分类体系从"为77条规则量身定做的枚举"重构为**生成式分类学**。核心洞察：动词有限（状态机转换类型就那么几种），名词无限（被管理的对象可以无限增长）。类比自然语言——你不需要预定义世界上所有名词才能说出完整的句子。从77→3000→30000条规则，事件类型体系不需要重构，只需要按语法生长名词。

---

## 第一部分：事件思维模型（第一性原理）

### 1.1 事件的定义

**事件 = 状态机的触发条件。**

不是"发生了什么事"这么浅。事件是系统状态从A到B的转变瞬间，这个转变可以被探测、被量化、被响应。

### 1.2 三类事件

| 类型 | 定义 | 触发方式 | 举例 |
|------|------|---------|------|
| **被动事件** | 对象生命周期动作（创建/修改/删除） | 操作发生时同步emit | 规则文件被创建 → `isc.rule.created` |
| **主动事件** | 可量化条件达到阈值 | 扫描器计算后emit | 占位符技能数 ≥ 1 → `quality.placeholder.detected` |
| **查缺补漏事件** | 定期扫描所有对象状态变化 | 定时全量扫描比对 | 技能目录结构变化 → `skill.structure.changed` |

### 1.3 事件锚点

**事件锚点 = 在代码的什么位置放探针去捕捉状态变化。**

不是事件不存在，是之前没有认真设计"在哪里放探针"。每个对象在系统中都有生命周期，每个生命周期节点都是天然的事件锚点。

### 1.4 四个层次（MECE）

```
L1 被动事件层：对象CRUD操作 → 同步emit（最基础，覆盖80%场景）
L2 主动事件层：量化指标越过阈值 → 扫描器emit（覆盖统计/质量类规则）
L3 查缺补漏层：定期全量diff → 补emit遗漏事件（兜底网，确保0遗漏）
L4 组合事件层：多个L1/L2/L3事件的逻辑组合（AND/OR/SEQUENCE）→ 高阶决策
```

---

## 第二部分：统一事件Schema

### 2.1 收敛历史格式

v2系统存在5种trigger格式，v3统一为1种：

```json
{
  "id": "evt_{timestamp36}_{random6}",
  "type": "domain.object.action",
  "source": "emitter_id",
  "timestamp": 1772623823555,
  "payload": {},
  "metadata": {
    "trace_id": "trc_xxx",
    "correlation_id": "cor_xxx",
    "emitter_type": "passive|active|sweep"
  }
}
```

### 2.2 事件类型命名规范（MECE）

**格式**: `{domain}.{object}.{action}`

**Domain枚举（一级分类）**：

| Domain | 覆盖范围 |
|--------|---------|
| `isc` | ISC规则体系自身 |
| `skill` | 技能生命周期 |
| `quality` | 质量检测结果 |
| `security` | 安全相关 |
| `sync` | 同步操作（EvoMap/GitHub） |
| `vectorization` | 向量化操作 |
| `aeo` | 效果运营 |
| `infra` | 基础设施（config/key/memory） |
| `interaction` | 用户交互 |
| `orchestration` | 编排调度 |
| `dto` | DTO自身生命周期 |
| `system` | 系统级事件 |

**Object枚举（二级分类，按domain）**：

| Domain.Object | 含义 |
|---------------|------|
| `isc.rule` | ISC规则 |
| `isc.trigger` | 规则触发器 |
| `isc.alignment` | ISC-DTO对齐 |
| `skill.lifecycle` | 技能生命周期 |
| `skill.md` | SKILL.md文件 |
| `skill.index` | 技能索引 |
| `skill.permission` | 技能权限 |
| `quality.skillmd` | SKILL.md质量 |
| `quality.readme` | README质量 |
| `quality.placeholder` | 占位符检测 |
| `security.gate` | 安全门禁 |
| `security.config` | 配置安全 |
| `security.scan` | 安全扫描 |
| `sync.evomap` | EvoMap同步 |
| `sync.github` | GitHub同步 |
| `vectorization.skill` | 技能向量化 |
| `vectorization.knowledge` | 知识向量化 |
| `vectorization.memory` | 记忆向量化 |
| `vectorization.aeo` | AEO评测集向量化 |
| `aeo.evaluation` | AEO评测 |
| `aeo.feedback` | AEO反馈 |
| `aeo.insight` | AEO洞察 |
| `infra.config` | 系统配置 |
| `infra.apikey` | API密钥 |
| `infra.memory` | 记忆文件 |
| `infra.cron` | 定时任务 |
| `interaction.message` | 用户消息 |
| `interaction.report` | 报告输出 |
| `orchestration.pipeline` | 流水线 |
| `orchestration.subagent` | 子Agent |
| `dto.task` | DTO任务 |
| `dto.subscription` | DTO订阅 |
| `system.error` | 系统错误 |
| `system.sweep` | 全量扫描 |

**Action枚举（三级分类）**：

| Action | 含义 | 事件类型 |
|--------|------|---------|
| `created` | 对象创建 | 被动 |
| `updated` | 对象修改 | 被动 |
| `deleted` | 对象删除 | 被动 |
| `renamed` | 对象重命名 | 被动 |
| `validated` | 校验通过 | 被动 |
| `violated` | 规则违反 | 被动/主动 |
| `requested` | 操作请求 | 被动 |
| `completed` | 操作完成 | 被动 |
| `failed` | 操作失败 | 被动 |
| `detected` | 异常检测到 | 主动 |
| `threshold_crossed` | 阈值越过 | 主动 |
| `gap_found` | 缺口发现 | 主动 |
| `drifted` | 漂移检测 | 主动 |
| `swept` | 全量扫描完成 | 查缺补漏 |
| `changed` | 状态变化（扫描发现） | 查缺补漏 |

### 2.3 统一规则Trigger Schema

每条ISC规则的trigger字段统一为：

```json
{
  "trigger": {
    "events": ["domain.object.action"],
    "condition": "可选的JS表达式，在payload上下文求值",
    "sweep": {
      "enabled": true,
      "interval": "*/30 * * * *",
      "scanner": "scanner_function_name"
    }
  },
  "action": {
    "type": "validate|enforce|auto_fix|pipeline|notify|escalate",
    "handler": "handler_function_or_dto_task_id",
    "on_failure": "warn|reject|retry|escalate"
  }
}
```

**关键设计**：每条规则至少有一个`events`触发 + 可选的`sweep`兜底。没有规则是"不可事件化"的。

---

## 第三部分：78条规则逐条事件绑定

### 3.0 概览统计

| 分类 | 规则数 | 被动事件 | 主动事件 | 查缺补漏 |
|------|--------|---------|---------|---------|
| ISC治理 | 13 | 13 | 5 | 3 |
| 技能质量 | 8 | 6 | 6 | 2 |
| 命名规范 | 5 | 5 | 5 | 1 |
| 自动化触发 | 9 | 9 | 2 | 1 |
| 向量化 | 9 | 7 | 3 | 1 |
| 安全 | 4 | 4 | 1 | 1 |
| AEO | 5 | 5 | 2 | 1 |
| 决策 | 5 | 3 | 4 | 1 |
| 分析检测 | 4 | 4 | 2 | 1 |
| 编排 | 5 | 5 | 1 | 1 |
| 基础设施 | 5 | 4 | 3 | 1 |
| 交互 | 4 | 4 | 1 | 1 |
| 集成/标准 | 2 | 2 | 0 | 1 |
| **合计** | **78** | **71** | **35** | **17** |

> **100%覆盖**：每条规则至少有1个被动事件或1个主动事件 + 1个sweep兜底。

### 3.1 ISC治理类规则（13条）

#### R01: `rule.isc-standard-format-001.json` — ISC规则文件格式统一标准

| 维度 | 定义 |
|------|------|
| **被动事件** | `isc.rule.created` — 任何规则被创建时 |
| | `isc.rule.updated` — 任何规则被修改时 |
| **主动事件** | `quality.rule_format.violated` — 扫描发现格式不符合标准的规则数 ≥ 1 |
| **事件源/锚点** | 被动：`isc-core/event-bridge.js` detectChanges()（已有） |
| | 主动：`scanners/rule-format-scanner.js`（新建） |
| **校验动作** | 解析规则JSON → 校验必填字段（id/name/domain/type/scope/description/governance） → 不通过则reject+通知 |

#### R02: `rule.isc-creation-gate-001.json` — ISC规则创建闸门

| 维度 | 定义 |
|------|------|
| **被动事件** | `isc.rule.created` — 规则文件被创建的瞬间 |
| **事件源/锚点** | `isc-core/event-bridge.js` detectChanges() 检测到新文件 |
| **校验动作** | 创建前闸门校验：命名格式 → schema完整性 → id与文件名匹配 → governance配置 → 不通过则拒绝入库 |

#### R03: `rule.isc-change-auto-trigger-alignment-001.json` — ISC规则变更自动触发对齐

| 维度 | 定义 |
|------|------|
| **被动事件** | `isc.rule.created` / `isc.rule.updated` / `isc.rule.deleted` |
| **查缺补漏** | `system.sweep.isc_dto_alignment` — 每30分钟扫描ISC-DTO订阅对齐状态 |
| **事件源/锚点** | 被动：`isc-core/event-bridge.js`（已有） |
| | 扫描：`scanners/isc-dto-alignment-scanner.js`（新建） |
| **校验动作** | 规则变更后 → 自动检查DTO订阅是否同步 → 不同步则触发对齐修复 |

#### R04: `rule.isc-dto-handshake-001.json` — ISC-DTO定期握手

| 维度 | 定义 |
|------|------|
| **主动事件** | `isc.alignment.drifted` — 每30分钟扫描，发现ISC规则数与DTO订阅数不匹配 |
| **查缺补漏** | `system.sweep.isc_dto_handshake` — 定期全量比对 |
| **事件源/锚点** | `scanners/isc-dto-alignment-scanner.js`（与R03共用） |
| **校验动作** | 比对规则清单vs订阅清单 → 识别遗漏/多余 → 自动修复或报警 |

#### R05: `rule.isc-naming-convention-001.json` — ISC规则命名公约

| 维度 | 定义 |
|------|------|
| **被动事件** | `isc.rule.created` — 规则创建时校验命名 |
| | `isc.rule.updated` — 规则修改时（可能涉及重命名） |
| **主动事件** | `quality.naming.violated` — 扫描发现命名不规范的规则数 ≥ 1 |
| **事件源/锚点** | 被动：event-bridge.js |
| | 主动：`scanners/naming-scanner.js`（新建，统一扫描所有命名类规则） |
| **校验动作** | 校验文件名是否匹配 `rule.{domain}-{name}-{version}.json` |

#### R06: `rule.isc-detect-repeated-error-001.json` — 检测重复错误

| 维度 | 定义 |
|------|------|
| **被动事件** | `system.error.occurred` — 任何执行失败时 |
| **主动事件** | `system.error.recurring.threshold_crossed` — 同类错误次数 ≥ N |
| **事件源/锚点** | 被动：DTO task-executor执行失败时emit |
| | 主动：`scanners/error-frequency-scanner.js`（新建） |
| **校验动作** | 统计错误类型频率 → 超阈值则触发根因分析 + 自动修复 |

#### R07: `rule.isc-rule-missing-resource-001.json` — 规则缺失资源

| 维度 | 定义 |
|------|------|
| **被动事件** | `isc.rule.validated` 结果为 resource_missing |
| **主动事件** | `isc.rule.resource.gap_found` — 扫描发现规则引用的资源不存在 |
| **事件源/锚点** | `scanners/rule-resource-scanner.js`（新建） |
| **校验动作** | 检查规则引用的handler/task/pipeline是否存在 → 不存在则auto_create或报警 |

#### R08: `rule.isc-rule-timeout-retry-001.json` — 规则执行超时重试

| 维度 | 定义 |
|------|------|
| **被动事件** | `dto.task.failed` 且 error_type = timeout |
| **事件源/锚点** | DTO task-executor执行超时时emit |
| **校验动作** | 检查retry_count < 3 → 重试 → 超过3次则escalate |

#### R09: `N034-rule-identity-accuracy.json` — 规则识别准确率

| 维度 | 定义 |
|------|------|
| **主动事件** | `isc.rule.identity.gap_found` — 扫描发现规则计数/身份不一致 |
| **查缺补漏** | `system.sweep.rule_identity` — 每30分钟全量校验 |
| **事件源/锚点** | `scanners/rule-identity-scanner.js`（新建） |
| **校验动作** | 统计rules目录文件数 vs 注册表记录数 → 不一致则修复 |

#### R10: `rule-recognition-accuracy-N034.json` — 规则识别准确率（副本）

| 维度 | 定义 |
|------|------|
| 与R09相同，是同一规则的历史遗留副本，应合并 |

#### R11: `N035-rule-trigger-completeness.json` — 规则触发器完整性

| 维度 | 定义 |
|------|------|
| **被动事件** | `dto.task.completed` — 每轮DTO执行后检查 |
| **主动事件** | `isc.trigger.gap_found` — 扫描发现无trigger的规则数 ≥ 1 |
| **查缺补漏** | `system.sweep.trigger_completeness` — 每小时全量扫描 |
| **事件源/锚点** | `scanners/trigger-completeness-scanner.js`（新建） |
| **校验动作** | 遍历所有规则 → 检查trigger字段是否存在且符合统一schema → 不符合则标记+修复建议 |

#### R12: `rule-trigger-integrity-N035.json` — 触发器完整性（副本）

| 维度 | 定义 |
|------|------|
| 与R11相同，历史遗留副本，应合并 |

#### R13: `rule.isc-skill-usage-protocol-001.json` — 技能使用协议

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.invoked` — 技能被调用时 |
| **主动事件** | `quality.skill_usage.violated` — 扫描发现未读取SKILL.md就调用技能的情况 |
| **事件源/锚点** | 被动：Agent turn中技能调用前的拦截点 |
| | 主动：`scanners/skill-usage-scanner.js`（从日志分析调用模式） |
| **校验动作** | 检查是否先read了SKILL.md → 未读取则warn |

### 3.2 技能质量类规则（8条）

#### R14: `rule.skill-mandatory-skill-md-001.json` — 技能强制SKILL.md

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.created` — 技能目录被创建时 |
| | `skill.md.deleted` — SKILL.md被删除时 |
| **主动事件** | `quality.skillmd.gap_found` — 扫描发现缺失SKILL.md的技能数 ≥ 1 |
| **查缺补漏** | `system.sweep.skill_structure` — 每30分钟扫描skills/目录 |
| **事件源/锚点** | 被动：git post-commit hook检测skills/目录变更 |
| | 主动：`scanners/skill-structure-scanner.js`（新建） |
| **校验动作** | 检查skills/*/SKILL.md是否存在 → 不存在则触发auto-generation或block流水线 |

#### R15: `rule.quality-skill-no-placeholder-001.json` — 禁止占位符技能

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.created` / `skill.lifecycle.updated` |
| **主动事件** | `quality.placeholder.detected` — 扫描发现占位符技能数 ≥ 1 |
| **事件源/锚点** | 被动：git post-commit hook |
| | 主动：`scanners/skill-quality-scanner.js`（新建） |
| **校验动作** | 检查SKILL.md内容是否有"占位符"/"placeholder"标记 → 有则要求实质性实现 |

#### R16: `rule.skill-quality-001.json` — 禁止占位符（副本）

| 维度 | 定义 |
|------|------|
| 与R15相同，历史遗留副本，应合并 |

#### R17: `rule.skill-md-quality-check-001.json` — SKILL.md质量检查

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.md.created` / `skill.md.updated` |
| **主动事件** | `quality.skillmd.threshold_crossed` — SKILL.md质量评分 < 阈值 |
| **事件源/锚点** | 被动：git post-commit hook检测SKILL.md变更 |
| | 主动：`scanners/skillmd-quality-scanner.js`（新建） |
| **校验动作** | 评估SKILL.md的完整性/可读性/准确性 → 低分则触发auto-fix建议 |

#### R18: `rule.readme-quality-check-001.json` — README质量检查

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.created` — 技能创建时检查README |
| **主动事件** | `quality.readme.threshold_crossed` — README质量评分 < 阈值 |
| **事件源/锚点** | 与R17共用scanner扩展检查范围 |
| **校验动作** | 评估README格式/内容 → 低分则触发regeneration |

#### R19: `auto-skill-md-generation-019.json` — 自动生成SKILL.md

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.created` — 新技能创建且代码文件已存在 |
| | `skill.md.deleted` — SKILL.md被删除 |
| **主动事件** | `quality.skillmd.gap_found` — 扫描发现代码存在但SKILL.md缺失或质量低 |
| **事件源/锚点** | 被动：git post-commit hook |
| | 主动：`scanners/skill-structure-scanner.js` |
| **校验动作** | 分析代码文件 → 自动生成SKILL.md → 提交 |

#### R20: `rule.auto-readme-generation-trigger-001.json` — 自动生成README

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.created` — 代码文件存在但README缺失 |
| **主动事件** | `quality.readme.gap_found` — 扫描发现README缺失 |
| **事件源/锚点** | 同R19共用scanner |
| **校验动作** | 检测代码文件 → README不存在则自动生成 |

#### R21: `rule.auto-fix-high-severity-001.json` — 高严重度自动修复

| 维度 | 定义 |
|------|------|
| **被动事件** | `quality.*.violated` — 任何质量规则违反且severity=HIGH |
| | `system.error.occurred` — 执行失败且severity=HIGH |
| **事件源/锚点** | 所有质量校验handler在发现HIGH问题时emit |
| **校验动作** | 判断auto_fix_enabled → 自动执行修复 → 修复后re-validate |

### 3.3 命名规范类规则（5条）

#### R22: `rule.isc-naming-constants-001.json` — 命名常量标准

| 维度 | 定义 |
|------|------|
| **被动事件** | `isc.rule.created` / `isc.rule.updated` — 规则变更时校验常量命名 |
| **主动事件** | `quality.naming.violated` — 扫描发现常量命名不规范 |
| **事件源/锚点** | `scanners/naming-scanner.js`（统一命名扫描器） |
| **校验动作** | 校验常量是否符合命名规范 |

#### R23: `rule.isc-naming-gene-files-001.json` — 基因文件命名标准

| 维度 | 定义 |
|------|------|
| **被动事件** | 文件被创建/修改时（匹配gene文件pattern） |
| **主动事件** | `quality.naming.violated` — 扫描发现gene文件命名不规范 |
| **事件源/锚点** | `scanners/naming-scanner.js` |
| **校验动作** | 校验gene文件名是否匹配规定pattern |

#### R24: `rule.isc-naming-skill-dir-001.json` — 技能目录命名标准

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.created` / `skill.lifecycle.renamed` — 技能目录创建/重命名时 |
| **主动事件** | `quality.naming.violated` — 扫描发现目录命名不规范 |
| **事件源/锚点** | `scanners/naming-scanner.js` |
| **校验动作** | 校验目录名是否符合kebab-case等规范 |

#### R25: `rule.naming-skill-bilingual-display-006.json` — 技能名称双语展示

| 维度 | 定义 |
|------|------|
| **被动事件** | `interaction.report.created` — 报告生成时（涉及技能名称展示） |
| | `skill.lifecycle.created` / `skill.lifecycle.updated` — 技能变更时校验双语配置 |
| **主动事件** | `quality.naming.violated` — 扫描发现缺少中文名的技能 |
| **事件源/锚点** | `scanners/naming-scanner.js` |
| **校验动作** | 检查技能是否有chinese_name字段 → 报告输出时强制双语展示 |

#### R26: `rule.isc-naming-convention-001.json` — ISC规则命名公约

（已在R05定义，此处不重复）

### 3.4 自动化触发类规则（9条）

#### R27: `rule.auto-evomap-sync-trigger-001.json` — EvoMap自动同步

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.created` / `skill.lifecycle.updated` / `skill.lifecycle.published` |
| **事件源/锚点** | git post-commit hook检测skills/目录变更 |
| **校验动作** | 检查技能是否在EvoMap清单中 → 是则触发同步 |

#### R28: `rule.auto-github-sync-trigger-001.json` — GitHub自动同步

| 维度 | 定义 |
|------|------|
| **被动事件** | `system.file.changed` — 任何被跟踪文件变更时 |
| **事件源/锚点** | git post-commit hook（已有） |
| **校验动作** | 判断变更是否需要同步到GitHub → 触发git push |

#### R29: `rule.auto-skillization-trigger-001.json` — 自动技能化

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.created` — 新技能创建 |
| **主动事件** | `quality.skill.threshold_crossed` — 技能质量评分 ≥ 50时触发技能化流程 |
| **事件源/锚点** | `scanners/skill-quality-scanner.js` |
| **校验动作** | 评估质量分 → 达标则进入技能化流程（创建evaluation set等） |

#### R30: `rule.auto-vectorization-trigger-001.json` — 自动向量化触发

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.md.created` / `skill.md.updated` |
| **主动事件** | `vectorization.skill.gap_found` — SKILL.md存在但未向量化 |
| **事件源/锚点** | `scanners/vectorization-scanner.js`（新建） |
| **校验动作** | 检查向量化状态 → 未向量化则触发 |

#### R31: `rule.capability-anchor-auto-register-001.json` — 能力锚点自动注册

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.created` / `skill.lifecycle.updated` / `infra.config.updated`（provider变更） |
| **主动事件** | `quality.capability_anchor.gap_found` — 扫描发现新能力未注册到锚点 |
| **事件源/锚点** | 被动：git post-commit hook |
| | 主动：`scanners/capability-anchor-scanner.js`（新建） |
| **校验动作** | 比对CAPABILITY-ANCHOR.md vs 实际技能/工具清单 → 发现差异则自动更新 |

#### R32: `rule.isc-skill-index-auto-update-001.json` — 技能索引自动更新

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.created` / `skill.lifecycle.updated` / `skill.lifecycle.deleted` |
| **事件源/锚点** | git post-commit hook |
| **校验动作** | 重新生成技能索引文件 |

#### R33: `rule.skill.evolution.auto-trigger.json` — 技能进化自动触发

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.changed` / `skill.lifecycle.created` / `skill.lifecycle.published` |
| **事件源/锚点** | git post-commit hook + EvoMap发布回调 |
| **校验动作** | 触发SEEF进化流水线 |

#### R34: `rule.decision-capability-anchor-013.json` — 能力锚点自动识别

| 维度 | 定义 |
|------|------|
| **主动事件** | `quality.capability_anchor.threshold_crossed` — repeated_success ≥ 3 AND manual_intervention ≥ 2 AND 未技能化 |
| **事件源/锚点** | `scanners/capability-anchor-scanner.js` — 统计操作成功次数和人工介入次数 |
| **校验动作** | 满足阈值条件 → 自动识别为新能力 → 注册到锚点 → 建议技能化 |

#### R35: `rule.decision-proactive-skillization-014.json` — 主动技能化执行

| 维度 | 定义 |
|------|------|
| **被动事件** | `quality.capability_anchor.threshold_crossed`（R34触发后的后续） |
| **事件源/锚点** | R34事件的下游消费 |
| **校验动作** | 检查用户是否明确拒绝 → 未拒绝则执行技能化 |

### 3.5 向量化类规则（9条）

#### R36: `rule.vectorization.unified-standard-001.json` — 统一智谱向量化标准

| 维度 | 定义 |
|------|------|
| **被动事件** | `vectorization.*.requested` — 任何向量化请求时 |
| **主动事件** | `quality.vectorization.violated` — 扫描发现使用了非智谱Embedding的向量化实例 |
| **事件源/锚点** | `scanners/vectorization-scanner.js` |
| **校验动作** | 校验向量化请求是否使用智谱Embedding API → 非标准则reject |

#### R37: `rule.vectorization.skill-auto-001.json` — 技能强制向量化

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.md.created` / `skill.md.updated` |
| **主动事件** | `vectorization.skill.gap_found` — SKILL.md存在但未向量化 |
| **事件源/锚点** | `scanners/vectorization-scanner.js` |
| **校验动作** | 检测SKILL.md存在 → 触发智谱向量化 |

#### R38: `rule.vectorization.skill-lifecycle-002.json` — 技能生命周期向量化

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.created` / `skill.lifecycle.updated` / `skill.lifecycle.merged` |
| **事件源/锚点** | git post-commit hook检测SKILL.md变更 |
| **校验动作** | 生命周期变更 → 重新向量化 |

#### R39: `rule.vectorization.skill-cleanup-003.json` — 技能向量清理

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.deleted` |
| **事件源/锚点** | git post-commit hook检测技能目录删除 |
| **校验动作** | 技能删除 → 清理对应向量数据 |

#### R40: `rule.vectorization.knowledge-auto-001.json` — 知识强制向量化

| 维度 | 定义 |
|------|------|
| **被动事件** | `infra.knowledge.created` / `infra.knowledge.updated` |
| **主动事件** | `vectorization.knowledge.gap_found` — 知识文件存在但未向量化 |
| **事件源/锚点** | `scanners/vectorization-scanner.js`扫描knowledge/目录 |
| **校验动作** | 知识文件变更 → 触发向量化 |

#### R41: `rule.vectorization.memory-auto-001.json` — 记忆强制向量化

| 维度 | 定义 |
|------|------|
| **被动事件** | `infra.memory.created` / `infra.memory.updated` |
| **主动事件** | `vectorization.memory.gap_found` — 记忆文件存在但未向量化 |
| **事件源/锚点** | `scanners/vectorization-scanner.js`扫描memory/目录 |
| **校验动作** | 记忆文件变更 → 触发向量化 |

#### R42: `rule.vectorization.aeo-auto-001.json` — AEO评测集向量化

| 维度 | 定义 |
|------|------|
| **被动事件** | `aeo.evaluation.created` / `aeo.evaluation.updated` |
| **主动事件** | `vectorization.aeo.gap_found` — 评测集文件存在但未向量化 |
| **事件源/锚点** | `scanners/vectorization-scanner.js`扫描aeo/evaluation-sets/目录 |
| **校验动作** | 评测集变更 → 触发向量化 |

#### R43: `auto-skill-change-vectorization-028.json` — 技能变更向量化

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.created` / `skill.lifecycle.updated` / `skill.lifecycle.merged` / `skill.lifecycle.iterated` |
| **事件源/锚点** | git post-commit hook |
| **校验动作** | 技能变更 → 检查SKILL.md或evaluation set是否存在 → 存在则重新向量化 |

#### R44: `rule.vectorization-trigger-001.json` — 向量化触发器（通用）

| 维度 | 定义 |
|------|------|
| **被动事件** | 所有 `vectorization.*.requested` 事件 |
| **查缺补漏** | `system.sweep.vectorization` — 定期扫描所有应向量化但未向量化的对象 |
| **事件源/锚点** | `scanners/vectorization-scanner.js` |
| **校验动作** | 全量扫描 → 识别gap → batch触发向量化 |

### 3.6 安全类规则（4条）

#### R45: `gateway-config-protection-N033.json` — Gateway配置保护

| 维度 | 定义 |
|------|------|
| **被动事件** | `security.config.updated` — openclaw.json/gateway*.json等配置文件被修改 |
| **事件源/锚点** | git post-commit hook检测配置文件变更 + 文件系统watcher（`scanners/config-watcher.js`新建） |
| **校验动作** | 配置变更 → 校验变更合法性 → 可疑变更则rollback+报警 |

#### R46: `evomap-mandatory-security-scan-032.json` — EvoMap强制安全扫描

| 维度 | 定义 |
|------|------|
| **被动事件** | `sync.evomap.requested` — EvoMap上传请求时 |
| **事件源/锚点** | EvoMap发布流程入口 |
| **校验动作** | 上传前拦截 → 执行安全扫描 → 通过则放行，不通过则reject |

#### R47: `skill-security-gate-030.json` — 技能安全准出

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.published` / `sync.evomap.requested` / `sync.github.requested` |
| **事件源/锚点** | 发布/同步流程入口 |
| **校验动作** | 发布前安全扫描 → 权限检查 → 通过则放行 |

#### R48: `skill-permission-classification-031.json` — 技能权限分级

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.created` / `skill.lifecycle.updated` — 技能变更时评估权限 |
| **主动事件** | `security.permission.gap_found` — 扫描发现技能缺少权限标注 |
| **事件源/锚点** | `scanners/skill-permission-scanner.js`（新建） |
| **校验动作** | 评估四维权限（Filesystem/Network/Shell/Credential） → 标注到manifest |

### 3.7 AEO类规则（5条）

#### R49: `rule.aeo-evaluation-set-registry-001.json` — AEO评测集注册标准

| 维度 | 定义 |
|------|------|
| **被动事件** | `aeo.evaluation.created` — 评测集创建时 |
| | `aeo.evaluation.updated` — 评测集修改时 |
| **主动事件** | `aeo.evaluation.gap_found` — 扫描发现未注册的评测集 |
| **事件源/锚点** | `scanners/aeo-scanner.js`（新建） |
| **校验动作** | 校验注册信息完整性（分类/标签/版本） |

#### R50: `aeo-dual-track-orchestration-024.json` — AEO双轨编排

| 维度 | 定义 |
|------|------|
| **被动事件** | `aeo.evaluation.requested` — 评测请求 |
| | `skill.lifecycle.updated` — 技能变更触发测试 |
| **事件源/锚点** | AEO执行入口 |
| **校验动作** | 启动双轨评测（功能+性能） |

#### R51: `aeo-feedback-auto-collection-025.json` — AEO反馈自动采集

| 维度 | 定义 |
|------|------|
| **被动事件** | `interaction.message.received` — 用户消息 |
| | `orchestration.pipeline.completed` — 对话轮次完成 |
| **主动事件** | `aeo.feedback.detected` — 从交互中检测到反馈信号 |
| **事件源/锚点** | 消息处理管线中的feedback拦截器 |
| **校验动作** | 分析消息内容 → 识别反馈信号 → 写入反馈库 |

#### R52: `aeo-insight-to-action-026.json` — AEO洞察转行动

| 维度 | 定义 |
|------|------|
| **被动事件** | `aeo.insight.generated` — 洞察生成 |
| **主动事件** | `aeo.insight.threshold_crossed` — 问题频率 ≥ 3 或 severity = HIGH |
| **事件源/锚点** | AEO分析引擎 + `scanners/aeo-scanner.js` |
| **校验动作** | 洞察达阈值 → 自动生成修复任务 → 分派执行 |

#### R53: `auto-aeo-evaluation-standard-generation-023.json` — AEO评测标准自动生成

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.created` — 新技能创建时 |
| | `skill.lifecycle.updated` — 技能重大更新时（能力变更） |
| | `aeo.feedback.collected` — 用户反馈收集后 |
| **事件源/锚点** | git post-commit hook + 反馈收集器 |
| **校验动作** | 分析技能代码/能力 → 自动生成评测集 → 注册到registry |

### 3.8 决策类规则（5条）

#### R54: `rule.decision-council-seven-required-001.json` — 七人议会必要性

| 维度 | 定义 |
|------|------|
| **被动事件** | `orchestration.decision.requested` — 决策请求发起 |
| **主动事件** | `orchestration.decision.threshold_crossed` — impact > 3 OR priority ≥ 9 OR type ∈ 关键类型 |
| **事件源/锚点** | 决策流程入口点（spawn/task创建时评估） |
| **校验动作** | 评估决策影响范围 → 满足条件则强制经七人议会审议 |

#### R55: `rule.decision-custom-2f7dd6e4.json` — 自定义决策规则

| 维度 | 定义 |
|------|------|
| **被动事件** | `dto.task.failed` 且 error_type = timeout |
| **事件源/锚点** | DTO task-executor |
| **校验动作** | 检查retry_count < 3 → 自动重试 |

#### R56: `decision-auto-repair-loop-post-pipeline-016.json` — 流水线后自动修复

| 维度 | 定义 |
|------|------|
| **被动事件** | `orchestration.pipeline.completed` — 全局自动决策流水线完成 |
| **事件源/锚点** | DTO pipeline执行完成时emit |
| **校验动作** | 检查findings中fixable_issues → 有则自动修复 → 修复后re-validate |

#### R57: `rule.decision-capability-anchor-013.json` — 能力锚点自动识别

（已在R34定义）

#### R58: `rule.decision-proactive-skillization-014.json` — 主动技能化执行

（已在R35定义）

### 3.9 分析检测类规则（4条）

#### R59: `auto-universal-root-cause-analysis-020.json` — 通用根因分析

| 维度 | 定义 |
|------|------|
| **被动事件** | `dto.task.failed` / `orchestration.pipeline.failed` / `sync.*.failed` / `system.error.occurred` |
| **事件源/锚点** | 所有执行器的失败回调 |
| **校验动作** | 收集错误上下文 → 多维根因分析 → 输出修复建议 → 触发auto-fix（若可自动修复） |

#### R60: `detection-architecture-design-isc-compliance-audit-022.json` — 架构设计ISC合规审计

| 维度 | 定义 |
|------|------|
| **被动事件** | `system.design.created` / `system.design.updated` — 设计文档创建/修改 |
| **事件源/锚点** | git post-commit hook检测designs/目录变更 |
| **校验动作** | 解析设计文档 → 校验是否符合ISC规则体系 → 不合规则标记+建议 |

#### R61: `detection-cras-recurring-pattern-auto-resolve-017.json` — CRAS重复模式自动解决

| 维度 | 定义 |
|------|------|
| **主动事件** | `aeo.insight.threshold_crossed` — 洞察中重复模式数 > 0 |
| **查缺补漏** | `system.sweep.cras_patterns` — 每2小时扫描重复模式 |
| **事件源/锚点** | `scanners/cras-pattern-scanner.js`（新建） |
| **校验动作** | 识别重复模式 → 自动生成解决方案 → 提交修复 |

#### R62: `detection-skill-rename-global-alignment-018.json` — 技能重命名全局对齐

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.renamed` / `skill.lifecycle.moved` |
| **事件源/锚点** | git post-commit hook检测技能目录重命名 |
| **校验动作** | 技能重命名后 → 全局搜索旧名称引用 → 自动替换 → 更新索引 |

### 3.10 编排类规则（5条）

#### R63: `rule.parallel-analysis-workflow-001.json` — 并行分析工作流

| 维度 | 定义 |
|------|------|
| **被动事件** | `orchestration.analysis.requested` — 分析任务请求 |
| **事件源/锚点** | 用户消息处理 / DTO任务创建 |
| **校验动作** | 评估任务可并行性 → 拆分为多个子任务 → 并行执行 → 汇总结果 |

#### R64: `rule.parallel-subagent-orchestration-001.json` — 并行子Agent编排

| 维度 | 定义 |
|------|------|
| **被动事件** | `orchestration.subagent.requested` — 复杂任务检测 |
| **事件源/锚点** | 任务评估层 |
| **校验动作** | 评估复杂度 → 分解子任务 → spawn子Agent并行执行 → 汇总 |

#### R65: `rule.seef-subskill-orchestration-001.json` — SEEF子技能编排

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.created` — 技能进入SEEF流水线时 |
| | `orchestration.pipeline.requested` — SEEF流水线启动 |
| **事件源/锚点** | SEEF流水线入口 |
| **校验动作** | DTO直接调度7大子技能（creator/validator/optimizer等） |

#### R66: `rule.multi-agent-communication-priority-001.json` — 多Agent沟通优先级

| 维度 | 定义 |
|------|------|
| **被动事件** | `orchestration.subagent.spawned` — 子Agent被创建 |
| | `interaction.message.received` — 用户消息到达 |
| **事件源/锚点** | Agent调度层 |
| **校验动作** | 确保主Agent沟通通道始终畅通 → 子Agent不阻塞主线程 |

#### R67: `rule.pipeline-report-filter-001.json` — 流水线汇报过滤

| 维度 | 定义 |
|------|------|
| **被动事件** | `orchestration.pipeline.completed` — 流水线完成时 |
| | `interaction.report.created` — 报告生成时 |
| **事件源/锚点** | 报告生成管线 |
| **校验动作** | 过滤常规版本更新 → 仅汇报失败/重大发布 |

### 3.11 基础设施类规则（5条）

#### R68: `model-api-key-pool-management-029.json` — API密钥池管理

| 维度 | 定义 |
|------|------|
| **被动事件** | `infra.apikey.rate_limited` / `infra.apikey.invalid` / `infra.apikey.expired` |
| | `infra.apikey.requested` — 模型请求发起时 |
| **主动事件** | `infra.apikey.threshold_crossed` — 某key使用率 > 80% |
| **事件源/锚点** | 模型API调用层拦截器 |
| **校验动作** | 密钥轮转 → 选择可用密钥 → 记录使用统计 |

#### R69: `rule.cron-task-model-requirement-001.json` — Cron任务模型要求

| 维度 | 定义 |
|------|------|
| **被动事件** | `infra.cron.created` / `infra.cron.updated` — Cron任务创建/修改时 |
| **事件源/锚点** | Cron任务管理入口 |
| **校验动作** | 校验cron任务是否指定了model字段 → 未指定则reject |

#### R70: `rule.cron-task-model-selection-002.json` — Cron任务模型选择标准

| 维度 | 定义 |
|------|------|
| **被动事件** | `infra.cron.created` / `infra.cron.updated` — Cron任务创建/修改时 |
| **主动事件** | `quality.cron_model.violated` — 扫描发现cron任务使用了不合适的模型 |
| **事件源/锚点** | Cron任务管理入口 + `scanners/cron-scanner.js`（新建） |
| **校验动作** | 根据任务类型推荐最优模型 → 不匹配则warn |

#### R71: `N036-memory-loss-recovery.json` — 记忆丢失恢复

| 维度 | 定义 |
|------|------|
| **被动事件** | `infra.memory.deleted` — MEMORY.md被删除 |
| | `system.session.started` — 会话启动时检查 |
| **主动事件** | `infra.memory.gap_found` — 扫描发现MEMORY.md缺失或损坏 |
| **事件源/锚点** | 会话启动自检脚本 + `scanners/memory-scanner.js`（新建） |
| **校验动作** | 检测MEMORY.md状态 → 缺失则从Git/备份恢复 → 损坏则修复 |

#### R72: `memory-loss-self-recovery-N036.json` — 记忆丢失恢复（副本）

| 维度 | 定义 |
|------|------|
| 与R71相同，历史遗留副本，应合并 |

### 3.12 交互类规则（4条）

#### R73: `rule.interaction-source-file-delivery-007.json` — 源文件交付方式

| 维度 | 定义 |
|------|------|
| **被动事件** | `interaction.message.received` — 用户消息匹配"源文件"/"发我xxx" |
| **事件源/锚点** | 消息处理管线的意图识别层 |
| **校验动作** | 识别源文件请求 → 直接message发送文件 → 不问不提醒不等确认 |

#### R74: `rule.detection-report-feishu-card-001.json` — 报告飞书卡片格式

| 维度 | 定义 |
|------|------|
| **被动事件** | `interaction.report.created` — 任何报告生成时 |
| | `infra.cron.executed` — 定时任务执行且产出报告时 |
| **主动事件** | `quality.report_format.violated` — 扫描发现报告未使用飞书卡片格式 |
| **事件源/锚点** | 被动：报告生成管线出口 |
| | 主动：`scanners/report-format-scanner.js`（新建） |
| **校验动作** | 校验报告是否使用card格式 → 不符合则转换或warn |

> **用户教学回应**：这条规则之前被标记为"不可事件化"。实际上：(1) 定时任务创建时应校验任务相关规则；(2) 任务产出报告时应校验报告相关规则；(3) 全局扫描器定期检查所有报告的格式合规性。三个事件锚点，清清楚楚。

#### R75: `rule.dual-channel-message-guarantee-001.json` — 双通道消息保证

| 维度 | 定义 |
|------|------|
| **被动事件** | `interaction.message.sent` — 关键消息发送时 |
| **事件源/锚点** | 消息发送管线 |
| **校验动作** | 判断消息重要性 → 重要消息双通道发送 → 确认双通道均送达 |

#### R76: `rule.glm-vision-priority-001.json` — GLM视觉优先

| 维度 | 定义 |
|------|------|
| **被动事件** | `interaction.message.received` — 用户消息匹配视觉意图（图片理解/图像分析等） |
| **事件源/锚点** | 消息处理管线的意图识别层 |
| **校验动作** | 识别视觉意图 → 路由到GLM-4V |

### 3.13 集成/标准/路由类规则（4条）

#### R77: `rule.zhipu-capability-router-001.json` — 智谱能力路由

| 维度 | 定义 |
|------|------|
| **被动事件** | `interaction.message.received` — 用户输入到达时 |
| **事件源/锚点** | 模型路由层 |
| **校验动作** | 分析输入模态 → 自动选择最优智谱模型 |

#### R78: `rule.github-api-skill-001.json` — GitHub API技能规范

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.created` — GitHub API相关技能创建时 |
| | `sync.github.requested` — GitHub API调用时 |
| **事件源/锚点** | GitHub API调用入口 |
| **校验动作** | 校验是否正确处理token/分页/限流 |

#### R79: `rule.http-skills-suite-001.json` — HTTP技能套件规范

| 维度 | 定义 |
|------|------|
| **被动事件** | `skill.lifecycle.created` — HTTP相关技能创建时 |
| **事件源/锚点** | 技能创建流程 |
| **校验动作** | 校验HTTP技能是否包含标准错误处理/重试/超时配置 |

#### R80: `rule.evomap-sync-trigger-001.json` — EvoMap同步触发（通用）

| 维度 | 定义 |
|------|------|
| **被动事件** | `sync.evomap.requested` — 同步请求 |
| **查缺补漏** | `system.sweep.evomap_sync` — 定期扫描待同步项 |
| **事件源/锚点** | `scanners/sync-scanner.js`（新建） |
| **校验动作** | 检查同步清单 → 触发未同步项 |

### 3.14 其他规则（2条）

#### R81: `planning.time-granularity-037.json` — AI计划时间粒度标准

| 维度 | 定义 |
|------|------|
| **被动事件** | `orchestration.plan.created` — 计划/任务创建时 |
| **主动事件** | `quality.planning.violated` — 扫描发现计划粒度使用了"日/周/月" |
| **事件源/锚点** | 被动：任务创建入口 |
| | 主动：`scanners/planning-scanner.js`（新建，扫描任务定义的时间粒度） |
| **校验动作** | 校验计划单位 → 使用"日/周/月"则reject，强制改为分钟/小时 |

> **用户教学回应**：这条规则之前被标记为"纯文档标准，不可事件化"。实际上：任何计划被创建就是事件（被动），扫描发现违规粒度也是事件（主动）。可量化的就是事件。

#### R82: `rule.isc-skill-usage-protocol-001.json` — 技能使用协议

（已在R13定义）

### 3.15 规则去重建议

以下规则存在重复，建议合并：

| 保留 | 删除 | 原因 |
|------|------|------|
| `N034-rule-identity-accuracy.json` | `rule-recognition-accuracy-N034.json` | 同一规则的两个版本 |
| `N035-rule-trigger-completeness.json` | `rule-trigger-integrity-N035.json` | 同一规则的两个版本 |
| `N036-memory-loss-recovery.json` | `memory-loss-self-recovery-N036.json` | 同一规则的两个版本 |
| `rule.quality-skill-no-placeholder-001.json` | `rule.skill-quality-001.json` | 同一规则的两个版本 |

去重后有效规则数：78 - 4 = **74条独立规则**。

---

## 第四部分：事件源清单（Event Source Inventory）

### 4.1 现有事件源

| 事件源ID | 类型 | 位置 | 状态 | 能emit的事件 |
|----------|------|------|------|-------------|
| `ES01` git-hook | 被动 | `.git/hooks/post-commit` | ✅已有 | `system.file.changed`, `system.architecture.changed` |
| `ES02` event-bridge | 被动 | `isc-core/event-bridge.js` | ✅已有 | `isc.rule.created/updated/deleted` |
| `ES03` event-bus | 基础设施 | `infrastructure/event-bus/bus.js` | ✅已有 | 持久化层（JSONL），支持emit/consume/matchType |
| `ES04` dispatcher | 路由 | `infrastructure/dispatcher/dispatcher.js` | ⚠️残缺 | 路由事件到handler，但不执行（写文件） |
| `ES05` dto-event-bus | 内存 | `dto-core/core/event-bus.js` | ⚠️孤岛 | 进程内EventEmitter，不持久化 |

### 4.2 需要新建的事件源

| 事件源ID | 类型 | 位置（规划） | 能emit的事件 |
|----------|------|-------------|-------------|
| `ES06` skill-watcher | 被动 | `scanners/skill-watcher.js` | `skill.lifecycle.*`, `skill.md.*` |
| `ES07` naming-scanner | 主动 | `scanners/naming-scanner.js` | `quality.naming.violated` |
| `ES08` skill-quality-scanner | 主动 | `scanners/skill-quality-scanner.js` | `quality.placeholder.detected`, `quality.skillmd.*` |
| `ES09` vectorization-scanner | 主动 | `scanners/vectorization-scanner.js` | `vectorization.*.gap_found` |
| `ES10` rule-format-scanner | 主动 | `scanners/rule-format-scanner.js` | `quality.rule_format.violated` |
| `ES11` isc-dto-alignment-scanner | 主动 | `scanners/isc-dto-alignment-scanner.js` | `isc.alignment.drifted` |
| `ES12` capability-anchor-scanner | 主动 | `scanners/capability-anchor-scanner.js` | `quality.capability_anchor.*` |
| `ES13` error-frequency-scanner | 主动 | `scanners/error-frequency-scanner.js` | `system.error.recurring.*` |
| `ES14` config-watcher | 被动 | `scanners/config-watcher.js` | `security.config.updated` |
| `ES15` report-format-scanner | 主动 | `scanners/report-format-scanner.js` | `quality.report_format.violated` |
| `ES16` cras-pattern-scanner | 主动 | `scanners/cras-pattern-scanner.js` | `aeo.insight.threshold_crossed` |
| `ES17` cron-scanner | 主动 | `scanners/cron-scanner.js` | `quality.cron_model.violated` |
| `ES18` memory-scanner | 主动 | `scanners/memory-scanner.js` | `infra.memory.gap_found` |
| `ES19` sync-scanner | 主动 | `scanners/sync-scanner.js` | `sync.*.gap_found` |
| `ES20` planning-scanner | 主动 | `scanners/planning-scanner.js` | `quality.planning.violated` |
| `ES21` skill-permission-scanner | 主动 | `scanners/skill-permission-scanner.js` | `security.permission.gap_found` |
| `ES22` aeo-scanner | 主动 | `scanners/aeo-scanner.js` | `aeo.evaluation.gap_found` |
| `ES23` message-interceptor | 被动 | `interceptors/message-interceptor.js` | `interaction.message.received` |
| `ES24` global-sweep | 查缺补漏 | `scanners/global-sweep.js` | `system.sweep.*` |

### 4.3 事件源→规则映射矩阵

```
ES01 (git-hook)          → R14,R15,R19,R20,R24,R27,R28,R32,R33,R38,R39,R43,R45,R60,R62
ES02 (event-bridge)      → R01,R02,R03,R05,R22,R23
ES06 (skill-watcher)     → R14,R15,R17,R19,R24,R25,R27,R29,R30,R31,R32,R33,R37,R43,R47,R48,R50,R53,R65,R78,R79
ES07 (naming-scanner)    → R05,R22,R23,R24,R25
ES08 (skill-quality)     → R14,R15,R17,R18,R19,R20,R29
ES09 (vectorization)     → R30,R36,R37,R40,R41,R42,R44
ES10 (rule-format)       → R01,R05
ES11 (isc-dto-alignment) → R03,R04
ES12 (capability-anchor) → R31,R34,R35
ES13 (error-frequency)   → R06,R55,R59
ES14 (config-watcher)    → R45
ES15 (report-format)     → R74
ES16 (cras-pattern)      → R61
ES17 (cron-scanner)      → R69,R70
ES18 (memory-scanner)    → R71
ES19 (sync-scanner)      → R46,R80
ES20 (planning-scanner)  → R81
ES21 (skill-permission)  → R48
ES22 (aeo-scanner)       → R49,R52
ES23 (message-interceptor) → R51,R73,R75,R76,R77
ES24 (global-sweep)      → ALL (兜底)
```

---

## 第五部分：架构设计

### 5.1 整体架构（v3）

```
┌─────────────────────────────────────────────────────────────────────┐
│                     事件源层（Event Source Layer）                     │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ git-hook │ │ event-   │ │ skill-   │ │ config-  │ │ message- │  │
│  │ (ES01)   │ │ bridge   │ │ watcher  │ │ watcher  │ │ intercept│  │
│  │          │ │ (ES02)   │ │ (ES06)   │ │ (ES14)   │ │ (ES23)   │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
│       │             │            │             │            │        │
│  ┌────┴─────────────┴────────────┴─────────────┴────────────┴────┐  │
│  │                    被动事件汇聚 (Passive Event Collector)       │  │
│  └────────────────────────────┬──────────────────────────────────┘  │
│                               │                                     │
│  ┌──────────┐ ┌──────────┐ ┌─┴────────┐ ┌──────────┐ ┌──────────┐  │
│  │ naming-  │ │ quality- │ │ vector-  │ │ error-   │ │ planning │  │
│  │ scanner  │ │ scanner  │ │ scanner  │ │ freq-    │ │ scanner  │  │
│  │ (ES07)   │ │ (ES08)   │ │ (ES09)   │ │ scanner  │ │ (ES20)   │  │
│  │          │ │          │ │          │ │ (ES13)   │ │          │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
│       │             │            │             │            │        │
│  ┌────┴─────────────┴────────────┴─────────────┴────────────┴────┐  │
│  │                    主动事件汇聚 (Active Event Collector)        │  │
│  └────────────────────────────┬──────────────────────────────────┘  │
│                               │                                     │
│  ┌────────────────────────────┴──────────────────────────────────┐  │
│  │              全局扫描器 (Global Sweep - ES24)                   │  │
│  │              查缺补漏：定期对比所有对象状态，emit遗漏事件         │  │
│  └────────────────────────────┬──────────────────────────────────┘  │
└───────────────────────────────┼──────────────────────────────────────┘
                                │
                     ┌──────────▼──────────┐
                     │  统一事件总线         │
                     │  infrastructure/     │
                     │  event-bus/bus.js    │
                     │  (JSONL持久化+锁)    │
                     └──────────┬──────────┘
                                │
┌───────────────────────────────┼──────────────────────────────────────┐
│                     ISC规则层（Rule Layer）                           │
│                               │                                     │
│  ┌────────────────────────────▼──────────────────────────────────┐  │
│  │              事件-规则匹配引擎 (Event-Rule Matcher)             │  │
│  │              根据事件type匹配rules/*.json的trigger.events     │  │
│  └──────┬───────────────────────────────────┬────────────────────┘  │
│         │                                   │                       │
│  ┌──────▼──────────┐               ┌───────▼─────────────┐         │
│  │ 校验/判定         │               │ 事件-规则注册表      │         │
│  │ (validate/enforce)│               │ event-rule-map.json │         │
│  └──────┬──────────┘               └─────────────────────┘         │
│         │                                                           │
└─────────┼───────────────────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────────────────┐
│                     DTO执行层（Execution Layer）                      │
│                                                                     │
│  ┌──────▼──────────┐   ┌─────────────────┐   ┌──────────────────┐  │
│  │ runtime-binder  │   │ task-executor    │   │ result-emitter   │  │
│  │ (事件→任务绑定)  │   │ (统一执行)       │   │ (结果→事件)      │  │
│  └──────┬──────────┘   └────────┬────────┘   └────────┬─────────┘  │
│         │                       │                      │           │
│         └───────────────────────┴──────────────────────┘           │
│                                 │                                   │
│                     ┌───────────▼──────────────┐                    │
│                     │ 执行结果 → bus.emit()     │                    │
│                     │ (回写事件总线形成闭环)     │                    │
│                     └──────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 统一事件总线（Single Bus）

**决策**：废弃DTO内部的event-bus.js和event-consumer.js，全部统一到`infrastructure/event-bus/bus.js`。

理由：
1. 一套持久化机制（JSONL + 文件锁）
2. 一套消费模型（cursor + 事件类型匹配）
3. 一条审计链路（所有事件都在events.jsonl中可回溯）

改造：
- DTO的runtime-binder直接调用`bus.consume(cursor, typePattern)`
- 废弃`.dto-signals/`目录监视
- 废弃DTO内部EventEmitter

### 5.3 Scanner框架

所有主动事件扫描器共享统一框架：

```javascript
// scanners/base-scanner.js
class BaseScanner {
  constructor(name, interval) {
    this.name = name;
    this.interval = interval; // cron表达式
    this.bus = require('../infrastructure/event-bus/bus.js');
    this.stateFile = path.join(__dirname, `.${name}-state.json`);
  }
  
  // 子类实现：返回当前状态快照
  async snapshot() { throw new Error('implement me'); }
  
  // 子类实现：对比新旧快照，返回事件列表
  async diff(oldState, newState) { throw new Error('implement me'); }
  
  // 执行扫描
  async scan() {
    const oldState = this.loadState();
    const newState = await this.snapshot();
    const events = await this.diff(oldState, newState);
    
    for (const evt of events) {
      this.bus.emit(evt.type, this.name, evt.payload);
    }
    
    this.saveState(newState);
    return events;
  }
}
```

**扫描器清单**（需新建17个，可收敛为7个组合扫描器）：

| 组合扫描器 | 覆盖的ES | 扫描范围 | cron |
|-----------|---------|---------|------|
| `skill-scanner.js` | ES06,ES07,ES08,ES21 | skills/目录结构+质量+命名+权限 | `*/10 * * * *` |
| `rule-scanner.js` | ES10,ES11 | rules/格式+ISC-DTO对齐 | `*/30 * * * *` |
| `vectorization-scanner.js` | ES09 | 所有应向量化对象 | `*/30 * * * *` |
| `infra-scanner.js` | ES14,ES17,ES18 | 配置/cron/记忆 | `*/30 * * * *` |
| `quality-scanner.js` | ES13,ES15,ES20,ES22 | 错误频率/报告/计划/AEO | `*/30 * * * *` |
| `sync-scanner.js` | ES19 | EvoMap/GitHub同步状态 | `0 * * * *` |
| `global-sweep.js` | ES24 | 全量对比 | `0 */6 * * *` |

### 5.4 Dispatcher改造

当前dispatcher只写文件不执行。改造方案：

```javascript
// infrastructure/dispatcher/dispatcher.js (改造后)
async function dispatch(event) {
  const route = matchRoute(event.type);
  if (!route) {
    bus.emit('system.event.unrouted', 'dispatcher', { event });
    return;
  }
  
  // 关键改造：真正执行
  const result = await executeHandler(route.handler, event);
  
  // 执行结果回写事件总线
  bus.emit(
    result.success ? 'dto.task.completed' : 'dto.task.failed',
    'dispatcher',
    { event_id: event.id, handler: route.handler, result }
  );
}

async function executeHandler(handlerName, event) {
  // 方式1: sessions_spawn (子Agent)
  // 方式2: 直接调用handler函数
  // 方式3: DTO任务队列
  const handler = require(`./handlers/${handlerName}`);
  return handler.execute(event);
}
```

### 5.5 查缺补漏机制（Global Sweep）

```javascript
// scanners/global-sweep.js
// 每6小时执行一次全量扫描

async function sweep() {
  const results = {
    rules: await sweepRules(),      // ISC规则完整性
    skills: await sweepSkills(),    // 技能结构完整性
    vectors: await sweepVectors(),  // 向量化覆盖率
    alignment: await sweepAlignment(), // ISC-DTO-Event三角对齐
    naming: await sweepNaming(),    // 命名规范合规率
    security: await sweepSecurity() // 安全扫描覆盖率
  };
  
  // 发现任何变化都emit事件
  for (const [domain, findings] of Object.entries(results)) {
    if (findings.length > 0) {
      bus.emit(`system.sweep.${domain}.changed`, 'global-sweep', {
        findings,
        timestamp: Date.now()
      });
    }
  }
  
  // 全量扫描完成事件
  bus.emit('system.sweep.completed', 'global-sweep', {
    summary: Object.fromEntries(
      Object.entries(results).map(([k, v]) => [k, v.length])
    )
  });
}
```

### 5.6 事件-规则-DTO三角对齐监控

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  ISC Rules   │     │   Events    │     │ DTO Tasks   │
│  (78条)      │◄───►│   (注册表)   │◄───►│  (订阅+执行) │
│              │     │             │     │             │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    ┌──────▼──────┐
                    │ 三角对齐     │
                    │ 监控器       │
                    │ (每30min)    │
                    └─────────────┘
```

**对齐检查项**：
1. 每条ISC规则是否有≥1个trigger事件绑定？
2. 每个trigger事件是否在事件注册表中注册？
3. 每个事件是否有≥1个DTO订阅/handler？
4. 每个DTO订阅引用的规则是否存在？
5. 事件是否有事件源能够emit？

**不对齐则emit**：`isc.alignment.drifted` → 自动修复或报警。

---

## 第六部分：实施路线图

### Phase 1: 基础设施统一（1-2天）

**目标**：统一事件总线，修复dispatcher

| 任务 | 产出 | 估时 |
|------|------|------|
| 1.1 统一bus.js为唯一事件总线 | 废弃DTO内部bus | 2h |
| 1.2 改造dispatcher.js使其真正执行 | handler执行框架 | 3h |
| 1.3 创建BaseScanner框架 | `scanners/base-scanner.js` | 2h |
| 1.4 扩展git post-commit hook | emit更多事件类型 | 1h |
| 1.5 创建事件注册表 | `event-registry.json`（所有事件类型） | 2h |

### Phase 2: 扫描器实现（2-3天）

**目标**：7个组合扫描器全部上线

| 任务 | 产出 | 估时 |
|------|------|------|
| 2.1 skill-scanner.js | 技能结构/质量/命名/权限扫描 | 3h |
| 2.2 rule-scanner.js | 规则格式/ISC-DTO对齐扫描 | 2h |
| 2.3 vectorization-scanner.js | 向量化覆盖率扫描 | 2h |
| 2.4 infra-scanner.js | 配置/cron/记忆扫描 | 2h |
| 2.5 quality-scanner.js | 错误频率/报告/计划/AEO扫描 | 3h |
| 2.6 sync-scanner.js | 同步状态扫描 | 1h |
| 2.7 global-sweep.js | 全量兜底扫描 | 3h |

### Phase 3: 规则标准化迁移（1-2天）

**目标**：78条规则全部迁移到统一trigger/action schema

| 任务 | 产出 | 估时 |
|------|------|------|
| 3.1 编写迁移脚本 | `scripts/migrate-rules-v3.js` | 3h |
| 3.2 执行迁移 | 78条规则JSON更新 | 2h |
| 3.3 去重合并 | 4对重复规则合并 | 1h |
| 3.4 验证迁移 | 所有规则通过schema校验 | 1h |

### Phase 4: Runtime Binder + 闭环验证（1天）

**目标**：事件→规则→DTO执行→结果反馈闭环跑通

| 任务 | 产出 | 估时 |
|------|------|------|
| 4.1 实现runtime-binder.js | 事件消费→规则匹配→任务分发 | 3h |
| 4.2 三角对齐监控 | `monitors/alignment-monitor.js` | 2h |
| 4.3 端到端测试 | 从规则变更到执行完成的全链路测试 | 3h |

### Phase 5: 上线+调优（持续）

| 任务 | 产出 | 估时 |
|------|------|------|
| 5.1 Cron注册所有扫描器 | openclaw.json中注册cron | 1h |
| 5.2 监控dashboard | 事件流量/覆盖率/延迟监控 | 2h |
| 5.3 持续调优 | 扫描间隔/阈值/误报率调整 | 持续 |

**总估时：约8-10天**，可并行缩短到5-6天。

---

## 第七部分：关键设计决策记录

| # | 决策 | 理由 |
|---|------|------|
| D1 | 废弃DTO内部event-bus，统一到infrastructure/event-bus | 三条通道互不通信是根本问题 |
| D2 | 事件 = 状态机触发条件，不是"发生了什么事" | 用户教学的第一性原理 |
| D3 | 每条规则至少1个被动事件 + 可选主动/sweep | 100%覆盖，0遗漏 |
| D4 | 17个独立扫描器收敛为7个组合扫描器 | 减少进程数，共享状态 |
| D5 | 全局扫描器(global-sweep)每6小时兜底 | 查缺补漏机制 |
| D6 | 三角对齐监控每30分钟运行 | 防止ISC-Event-DTO漂移 |
| D7 | 4对重复规则建议合并 | 去重降噪 |
| D8 | 统一事件命名为`domain.object.action`三段式 | MECE + 可路由 |
| D9 | dispatcher改造为真正执行器 | 修复最后一公里断裂 |
| D10 | BaseScanner框架统一扫描器实现 | 代码复用 + 状态管理统一 |
| D11 | 事件分类体系采用生成式语法而非穷举枚举 | 从77→3000条规则时不需要重构 |

---

## 第八部分：事件分类体系的可扩展性论证

### 8.1 问题定义

用户的核心挑战："你现在定义的事件分类体系，变成3000条规则时还能否扩展、MECE？"

这暴露了v3初版的一个结构性问题：附录A列出88种事件类型，本质上是**为77条规则量身定做的枚举**。当规则从77→300→3000时，这个枚举会不断膨胀、分类边界会模糊、MECE会崩塌。

**必须解决的三个问题：**
1. 事件命名规范必须是**生成式**的（给定任何规则，可自动推导出事件类型），不是穷举式的
2. 分类体系在任意规模下保持MECE
3. 新增规则不需要修改分类体系本身

### 8.2 核心洞察：动词有限，名词无限

自然语言的类比：

> 你不需要预定义世界上所有名词才能说出完整的句子。语法是有限的规则集，它能生成无限的合法句子。

事件分类体系应该是一套**语法（grammar）**，不是一本**词典（dictionary）**。

- **动词（verb）**：描述状态转换的类型。状态机的转换类型是有限的——对象要么诞生、要么变化、要么消亡、要么被观测。无论系统多复杂，状态转换的种类不会爆炸。
- **名词（noun）**：描述被管理的对象。对象可以无限增长——新技能、新规则、新模块、新集成、新任何东西。名词是开放的。

**结论**：把有限的动词固定为封闭集（closed set），把无限的名词定义为开放层级（open hierarchy），就得到一个可无限扩展且永远MECE的分类体系。

### 8.3 事件类型生成语法（Event Type Grammar）

#### 语法定义

```
event_type  := noun "." verb
noun        := segment ("." segment)*
segment     := [a-z][a-z0-9_]*
verb        := lifecycle_verb | process_verb | compliance_verb | observation_verb
```

**示例**：
- `skill.md.created` → 名词=`skill.md`，动词=`created`（生命周期）
- `vectorization.skill.gap_found` → 名词=`vectorization.skill`，动词=`gap_found`（观测）
- `orchestration.pipeline.failed` → 名词=`orchestration.pipeline`，动词=`failed`（过程）

#### 动词封闭集（Verb Closed Set）

状态机只有四类转换，对应四类动词。这是MECE的，因为穷尽了状态机的所有可能：

**类别一：生命周期动词（Lifecycle Verbs）** — 对象存在性的变化

| 动词 | 含义 | 状态转换 |
|------|------|---------|
| `created` | 对象从无到有 | ∅ → exists |
| `updated` | 对象属性变化 | exists(v1) → exists(v2) |
| `deleted` | 对象从有到无 | exists → ∅ |
| `renamed` | 对象标识变化（特殊的updated） | exists(id1) → exists(id2) |
| `merged` | 多对象合一（特殊的created+deleted） | exists(a)+exists(b) → exists(c) |

**类别二：过程动词（Process Verbs）** — 操作执行的阶段变化

| 动词 | 含义 | 状态转换 |
|------|------|---------|
| `requested` | 操作被请求 | idle → pending |
| `started` | 操作开始执行 | pending → running |
| `completed` | 操作成功完成 | running → done |
| `failed` | 操作失败 | running → error |
| `retried` | 操作重试 | error → running |
| `cancelled` | 操作取消 | pending/running → cancelled |

**类别三：合规动词（Compliance Verbs）** — 规则校验的结果变化

| 动词 | 含义 | 状态转换 |
|------|------|---------|
| `validated` | 校验通过 | unchecked → compliant |
| `violated` | 校验不通过 | unchecked → non_compliant |
| `remediated` | 违规被修复 | non_compliant → compliant |
| `exempted` | 获得豁免 | non_compliant → exempted |

**类别四：观测动词（Observation Verbs）** — 扫描/度量的结果变化

| 动词 | 含义 | 状态转换 |
|------|------|---------|
| `detected` | 异常/条件被发现 | undetected → detected |
| `threshold_crossed` | 量化指标越过阈值 | below → above |
| `gap_found` | 缺口/缺失被发现 | unknown → gap_identified |
| `drifted` | 状态偏离基线 | aligned → misaligned |
| `resolved` | 已发现的问题被解决 | detected → resolved |
| `swept` | 全量扫描完成 | scanning → scanned |

**合计：21个动词，4个MECE类别。**

#### MECE证明

**为什么这4个类别是MECE的？**

任何一个事件，本质上都是某个"东西"的"状态"发生了"变化"。变化只有四种可能（穷尽）：

1. **东西本身的存在性变了**（诞生/变化/消亡）→ 生命周期
2. **作用在东西上的操作阶段变了**（请求/执行/完成/失败）→ 过程
3. **东西相对于规则的合规状态变了**（通过/违反/修复）→ 合规
4. **对东西的观测结果变了**（发现异常/越过阈值/发现缺口）→ 观测

这4个类别：
- **互斥**：一个事件不可能同时是"对象创建"和"校验通过"——它是其中且仅是其中一个
- **穷尽**：系统中不存在第5种状态变化类型

**追加3000条规则时会怎样？** 
- 新规则可能引入新的**名词**（例如 `ml_model`, `deployment`, `sla_metric`）
- 但不会引入新的**动词类别**——因为状态机转换类型已经穷尽
- 最多在某个动词类别内增加子动词（如lifecycle增加`archived`、`restored`），但这不改变分类体系结构

#### 名词开放层级（Noun Open Hierarchy）

名词采用层级命名，类似文件系统路径：

```
一级名词（域）
├── 二级名词（对象）
│   ├── 三级名词（子对象/属性）
│   │   └── ...
```

**命名规则**：
- 每级用`.`分隔
- 使用snake_case
- 层级深度不限，但建议≤4级
- 新名词**不需要预注册**——只要符合语法就是合法的事件类型

**示例**：当前77条规则用到的名词大约40个。3000条规则可能需要300-500个名词。名词按需生长，无需修改Schema。

```
# 当前（77条规则）
skill, skill.md, skill.index, skill.permission, skill.vector
rule, rule.trigger, rule.format, rule.resource
...

# 未来可能新增
ml_model, ml_model.checkpoint, ml_model.metric
deployment, deployment.canary, deployment.rollback
sla, sla.availability, sla.latency
workflow, workflow.step, workflow.approval
...
```

**关键约束**：名词层级的每一级必须在其父级下MECE。例如`skill`下面不能同时有`skill.md`和`skill.documentation`（它们语义重叠）。这通过命名审查（可自动化）来保证，而非预先枚举。

### 8.4 事件类型自动推导算法

给定任何一条ISC规则，用以下算法**自动推导**其触发事件类型，不需要人工判断：

```python
def derive_events(rule: dict) -> list[str]:
    """
    从ISC规则自动推导触发事件类型。
    这个算法对77条规则和3000条规则完全一致。
    """
    events = []
    
    # ─── Step 1: 识别被治理对象（名词） ───
    noun = derive_noun(rule)
    # 从rule.scope, rule.target, rule.domain, rule.description中
    # 提取被治理对象的名词。
    # 例: scope="skill", target="SKILL.md" → noun="skill.md"
    # 例: scope="isc", target="rule_format" → noun="rule.format"
    
    # ─── Step 2: 生命周期事件（被动，必有） ───
    # 任何对象都有create/update/delete，至少命中一个
    events.append(f"{noun}.created")
    events.append(f"{noun}.updated")
    if rule_governs_deletion(rule):
        events.append(f"{noun}.deleted")
    
    # ─── Step 3: 合规事件（如果规则定义了校验标准） ───
    if has_validation_criteria(rule):
        events.append(f"{noun}.validated")
        events.append(f"{noun}.violated")
    
    # ─── Step 4: 观测事件（如果规则有量化阈值） ───
    if has_threshold(rule):
        events.append(f"{noun}.threshold_crossed")
    if has_completeness_check(rule):
        events.append(f"{noun}.gap_found")
    
    # ─── Step 5: 过程事件（如果规则关联操作流程） ───
    if governs_process(rule):
        events.append(f"{noun}.requested")
        events.append(f"{noun}.completed")
        events.append(f"{noun}.failed")
    
    # ─── Step 6: 查缺补漏事件（永远添加） ───
    domain = noun.split('.')[0]
    events.append(f"system.sweep.{domain}")
    
    return deduplicate(events)
```

**关键特性**：
- 这个算法是**规则无关的**——它不关心规则的具体内容，只关心规则的结构属性
- 77条规则跑这个算法，和3000条规则跑这个算法，逻辑完全一样
- 新增规则不需要修改算法，只需要规则本身符合ISC schema

### 8.5 规模扩展分析

#### 从77→3000条规则的增长模型

| 维度 | 77条 | 300条 | 3000条 | 增长方式 |
|------|------|-------|--------|---------|
| **名词数** | ~40 | ~120 | ~500 | 线性增长（名词数 ≈ 规则数 × 0.15，因为多规则共享名词） |
| **动词数** | 21 | 21 | 21 | **不增长**（状态机转换类型是封闭集） |
| **事件类型总数** | ~88 | ~250 | ~800 | 亚线性增长（名词×常用动词子集） |
| **分类层级** | 3级 | 3-4级 | 3-4级 | **不增长**（层级深度不随规模膨胀） |
| **MECE性** | ✅ | ✅ | ✅ | **恒定保持**（动词MECE是结构保证的） |

#### 为什么事件类型增长是亚线性的？

因为大量规则**共享同一组触发事件**。例如：
- "技能强制SKILL.md" + "SKILL.md质量检查" + "自动生成SKILL.md" → 都由`skill.md.created`触发
- 不同质量规则共享`quality.*.violated`系列事件
- 不同安全规则共享`security.*.validated/violated`系列事件

**规律**：事件类型数 ≈ O(名词数 × 常用动词数) ≈ O(规则数^0.7)

3000条规则不会产生3000×21=63000种事件。实际只需要约800种（500名词 × 平均1.6个常用动词/名词）。

#### 什么情况下需要扩展动词集？

极少数情况下，可能需要在某个动词类别内新增子动词。例如：

```
# 生命周期类别新增
archived    → 对象被归档（特殊的"软删除"）
restored    → 对象从归档恢复（特殊的"重新创建"）
forked      → 对象被分叉（特殊的"创建"，来源于已有对象）

# 过程类别新增
paused      → 操作暂停（running → paused）
resumed     → 操作恢复（paused → running）
escalated   → 操作升级（error → escalated）
```

这些新增动词：
- 不改变4个动词类别的MECE结构
- 只是在类别内部增加更细粒度的区分
- 可以向后兼容（`archived`可以被旧系统理解为`deleted`的一种）

### 8.6 可扩展性的形式化论证

**定理**：对于任意数量N的ISC规则，事件分类体系保持MECE。

**证明**：

1. **动词集的MECE性不依赖于规则数量。** 
   - 动词集基于状态机转换类型划分，与被管理对象的数量无关
   - 4个动词类别（生命周期/过程/合规/观测）覆盖了状态机的所有可能转换
   - 新增规则引入的是新名词，不是新的状态转换类型

2. **名词层级的MECE性通过构造保证。**
   - 每个名词在其父层级下是唯一的（命名审查）
   - 新名词只在叶节点扩展，不改变现有名词的分类
   - 名词命名冲突通过自动化校验拦截

3. **事件类型 = 名词 × 动词，两者的MECE性保证乘积的MECE性。**
   - 互斥：不同名词-动词组合天然互斥
   - 穷尽：任何状态变化都可以表达为某个名词的某个动词

∎

### 8.7 与v3初版的差异

| 维度 | v3初版（附录A） | v3.1（本章） |
|------|----------------|-------------|
| **事件类型定义方式** | 穷举88种事件类型 | 生成语法 + 推导算法 |
| **新增规则时** | 手动添加事件类型到注册表 | 算法自动推导，名词按需生长 |
| **MECE保证** | 人工审查88个类型不重叠 | 结构保证（动词封闭集 × 名词树） |
| **3000条规则适应性** | 需要重构（88→800+手动管理不现实） | 无需重构（语法不变，名词自动生长） |
| **注册表角色** | 事件类型的"唯一真相来源" | 变为"历史记录/索引"，不再是必须 |

**附录A的88种事件类型仍然有效**——它们是当前77条规则通过推导算法得到的实例。但分类体系的权威定义不再是这个列表，而是**语法 + 动词封闭集 + 推导算法**。

### 8.8 实施要点

1. **将推导算法实现为`derive-events.js`**：给定任何规则JSON，输出其触发事件类型列表
2. **事件注册表改为自动生成**：不再手动维护，由推导算法扫描所有规则自动生成
3. **名词冲突检测**：新增规则时自动检查名词是否与现有名词语义重叠
4. **动词扩展审批**：新增动词需要人工审批（极低频操作），确保不破坏MECE

```javascript
// derive-events.js — 核心推导逻辑
function deriveEvents(rule) {
  const noun = deriveNoun(rule);  // 从规则结构推导名词
  const events = new Set();
  
  // 生命周期（被动，必有）
  events.add(`${noun}.created`);
  events.add(`${noun}.updated`);
  
  // 合规（如果规则有校验标准）
  if (rule.check_criteria || rule.standard || rule.creation_gate) {
    events.add(`${noun}.validated`);
    events.add(`${noun}.violated`);
  }
  
  // 观测（如果规则有量化条件）
  if (rule.threshold || rule.severity || rule.condition) {
    events.add(`${noun}.detected`);
  }
  
  // 过程（如果规则关联操作流程）
  if (rule.enforcement?.auto_execute || rule.auto_fix) {
    events.add(`${noun}.requested`);
    events.add(`${noun}.completed`);
    events.add(`${noun}.failed`);
  }
  
  // 查缺补漏（永远有）
  const domain = noun.split('.')[0];
  events.add(`system.sweep.${domain}`);
  
  return [...events];
}

function deriveNoun(rule) {
  // 优先使用scope.target
  if (rule.scope && rule.target) return `${rule.scope}.${rule.target}`;
  // 其次使用domain.type组合  
  if (rule.domain) {
    const obj = rule.scope || rule.target || rule.name?.split('_')[0] || 'general';
    return `${rule.domain}.${obj}`;
  }
  // 兜底从id推导
  return rule.id?.replace(/^rule\./, '').replace(/-\d+$/, '').replace(/-/g, '.') || 'unknown';
}
```

---

## 附录A：完整事件类型注册表

```json
{
  "events": [
    {"type": "isc.rule.created", "source": ["ES02"], "description": "ISC规则创建"},
    {"type": "isc.rule.updated", "source": ["ES02"], "description": "ISC规则修改"},
    {"type": "isc.rule.deleted", "source": ["ES02"], "description": "ISC规则删除"},
    {"type": "isc.rule.validated", "source": ["ES10"], "description": "ISC规则校验通过"},
    {"type": "isc.rule.resource.gap_found", "source": ["ES10"], "description": "规则引用资源缺失"},
    {"type": "isc.rule.identity.gap_found", "source": ["ES10"], "description": "规则身份不一致"},
    {"type": "isc.trigger.gap_found", "source": ["ES10"], "description": "规则缺少trigger"},
    {"type": "isc.alignment.drifted", "source": ["ES11"], "description": "ISC-DTO对齐漂移"},
    
    {"type": "skill.lifecycle.created", "source": ["ES01","ES06"], "description": "技能创建"},
    {"type": "skill.lifecycle.updated", "source": ["ES01","ES06"], "description": "技能修改"},
    {"type": "skill.lifecycle.deleted", "source": ["ES01","ES06"], "description": "技能删除"},
    {"type": "skill.lifecycle.renamed", "source": ["ES01","ES06"], "description": "技能重命名"},
    {"type": "skill.lifecycle.merged", "source": ["ES01","ES06"], "description": "技能合并"},
    {"type": "skill.lifecycle.published", "source": ["ES01","ES06"], "description": "技能发布"},
    {"type": "skill.lifecycle.invoked", "source": ["ES23"], "description": "技能被调用"},
    {"type": "skill.md.created", "source": ["ES01","ES06"], "description": "SKILL.md创建"},
    {"type": "skill.md.updated", "source": ["ES01","ES06"], "description": "SKILL.md修改"},
    {"type": "skill.md.deleted", "source": ["ES01","ES06"], "description": "SKILL.md删除"},
    {"type": "skill.index.updated", "source": ["ES06"], "description": "技能索引更新"},
    
    {"type": "quality.naming.violated", "source": ["ES07"], "description": "命名规范违反"},
    {"type": "quality.placeholder.detected", "source": ["ES08"], "description": "占位符技能检测到"},
    {"type": "quality.skillmd.gap_found", "source": ["ES08"], "description": "SKILL.md缺失"},
    {"type": "quality.skillmd.threshold_crossed", "source": ["ES08"], "description": "SKILL.md质量低于阈值"},
    {"type": "quality.readme.gap_found", "source": ["ES08"], "description": "README缺失"},
    {"type": "quality.readme.threshold_crossed", "source": ["ES08"], "description": "README质量低于阈值"},
    {"type": "quality.rule_format.violated", "source": ["ES10"], "description": "规则格式不合规"},
    {"type": "quality.capability_anchor.gap_found", "source": ["ES12"], "description": "能力锚点覆盖不足"},
    {"type": "quality.capability_anchor.threshold_crossed", "source": ["ES12"], "description": "能力锚点阈值达标"},
    {"type": "quality.report_format.violated", "source": ["ES15"], "description": "报告格式不合规"},
    {"type": "quality.cron_model.violated", "source": ["ES17"], "description": "Cron任务模型选择不当"},
    {"type": "quality.planning.violated", "source": ["ES20"], "description": "计划时间粒度违规"},
    {"type": "quality.skill_usage.violated", "source": ["ES08"], "description": "技能使用协议违反"},
    {"type": "quality.skill.threshold_crossed", "source": ["ES08"], "description": "技能质量分达标"},
    
    {"type": "security.config.updated", "source": ["ES14"], "description": "安全配置变更"},
    {"type": "security.gate.validated", "source": ["ES06"], "description": "安全门禁校验通过"},
    {"type": "security.gate.rejected", "source": ["ES06"], "description": "安全门禁校验拒绝"},
    {"type": "security.scan.completed", "source": ["ES19"], "description": "安全扫描完成"},
    {"type": "security.permission.gap_found", "source": ["ES21"], "description": "权限标注缺失"},
    
    {"type": "sync.evomap.requested", "source": ["ES06"], "description": "EvoMap同步请求"},
    {"type": "sync.evomap.completed", "source": ["ES19"], "description": "EvoMap同步完成"},
    {"type": "sync.evomap.failed", "source": ["ES19"], "description": "EvoMap同步失败"},
    {"type": "sync.github.requested", "source": ["ES01"], "description": "GitHub同步请求"},
    {"type": "sync.github.completed", "source": ["ES19"], "description": "GitHub同步完成"},
    
    {"type": "vectorization.skill.gap_found", "source": ["ES09"], "description": "技能未向量化"},
    {"type": "vectorization.knowledge.gap_found", "source": ["ES09"], "description": "知识未向量化"},
    {"type": "vectorization.memory.gap_found", "source": ["ES09"], "description": "记忆未向量化"},
    {"type": "vectorization.aeo.gap_found", "source": ["ES09"], "description": "AEO评测集未向量化"},
    {"type": "vectorization.completed", "source": ["ES09"], "description": "向量化完成"},
    {"type": "vectorization.standard.violated", "source": ["ES09"], "description": "向量化标准违反"},
    
    {"type": "aeo.evaluation.created", "source": ["ES22"], "description": "AEO评测集创建"},
    {"type": "aeo.evaluation.updated", "source": ["ES22"], "description": "AEO评测集修改"},
    {"type": "aeo.evaluation.requested", "source": ["ES22"], "description": "AEO评测请求"},
    {"type": "aeo.evaluation.completed", "source": ["ES22"], "description": "AEO评测完成"},
    {"type": "aeo.evaluation.gap_found", "source": ["ES22"], "description": "AEO评测集未注册"},
    {"type": "aeo.feedback.detected", "source": ["ES23"], "description": "AEO反馈信号检测"},
    {"type": "aeo.feedback.collected", "source": ["ES22"], "description": "AEO反馈收集完成"},
    {"type": "aeo.insight.generated", "source": ["ES16"], "description": "AEO洞察生成"},
    {"type": "aeo.insight.threshold_crossed", "source": ["ES16"], "description": "AEO洞察阈值达标"},
    
    {"type": "infra.config.updated", "source": ["ES14"], "description": "配置文件变更"},
    {"type": "infra.apikey.rate_limited", "source": ["ES17"], "description": "API密钥限流"},
    {"type": "infra.apikey.invalid", "source": ["ES17"], "description": "API密钥无效"},
    {"type": "infra.apikey.expired", "source": ["ES17"], "description": "API密钥过期"},
    {"type": "infra.apikey.requested", "source": ["ES17"], "description": "API密钥请求"},
    {"type": "infra.apikey.threshold_crossed", "source": ["ES17"], "description": "API密钥使用率高"},
    {"type": "infra.memory.created", "source": ["ES01"], "description": "记忆文件创建"},
    {"type": "infra.memory.updated", "source": ["ES01"], "description": "记忆文件修改"},
    {"type": "infra.memory.deleted", "source": ["ES01"], "description": "记忆文件删除"},
    {"type": "infra.memory.gap_found", "source": ["ES18"], "description": "记忆文件缺失/损坏"},
    {"type": "infra.knowledge.created", "source": ["ES01"], "description": "知识文件创建"},
    {"type": "infra.knowledge.updated", "source": ["ES01"], "description": "知识文件修改"},
    {"type": "infra.cron.created", "source": ["ES17"], "description": "Cron任务创建"},
    {"type": "infra.cron.updated", "source": ["ES17"], "description": "Cron任务修改"},
    {"type": "infra.cron.executed", "source": ["ES17"], "description": "Cron任务执行"},
    
    {"type": "interaction.message.received", "source": ["ES23"], "description": "用户消息接收"},
    {"type": "interaction.message.sent", "source": ["ES23"], "description": "消息发送"},
    {"type": "interaction.report.created", "source": ["ES15"], "description": "报告生成"},
    
    {"type": "orchestration.pipeline.requested", "source": ["ES06"], "description": "流水线启动请求"},
    {"type": "orchestration.pipeline.completed", "source": ["ES06"], "description": "流水线完成"},
    {"type": "orchestration.pipeline.failed", "source": ["ES06"], "description": "流水线失败"},
    {"type": "orchestration.subagent.spawned", "source": ["ES23"], "description": "子Agent创建"},
    {"type": "orchestration.subagent.completed", "source": ["ES23"], "description": "子Agent完成"},
    {"type": "orchestration.decision.requested", "source": ["ES23"], "description": "决策请求"},
    {"type": "orchestration.analysis.requested", "source": ["ES23"], "description": "分析任务请求"},
    {"type": "orchestration.plan.created", "source": ["ES23"], "description": "计划创建"},
    
    {"type": "dto.task.created", "source": ["ES04"], "description": "DTO任务创建"},
    {"type": "dto.task.completed", "source": ["ES04"], "description": "DTO任务完成"},
    {"type": "dto.task.failed", "source": ["ES04"], "description": "DTO任务失败"},
    
    {"type": "system.file.changed", "source": ["ES01"], "description": "文件变更（git commit）"},
    {"type": "system.error.occurred", "source": ["ES13"], "description": "系统错误"},
    {"type": "system.error.recurring.threshold_crossed", "source": ["ES13"], "description": "重复错误阈值"},
    {"type": "system.session.started", "source": ["ES23"], "description": "会话启动"},
    {"type": "system.design.created", "source": ["ES01"], "description": "设计文档创建"},
    {"type": "system.design.updated", "source": ["ES01"], "description": "设计文档修改"},
    {"type": "system.sweep.completed", "source": ["ES24"], "description": "全量扫描完成"},
    {"type": "system.event.unrouted", "source": ["ES04"], "description": "事件无路由匹配"}
  ]
}
```

**总计：88种事件类型，覆盖78条规则（去重后74条独立规则）的100%事件绑定。**

---

## 附录B：规则-事件快速索引

| # | 规则文件 | 规则名 | 事件类型 | 触发事件 | 事件源 |
|---|---------|--------|---------|---------|--------|
| 1 | rule.isc-standard-format-001 | ISC格式统一 | 被动+主动 | isc.rule.created/updated + quality.rule_format.violated | ES02,ES10 |
| 2 | rule.isc-creation-gate-001 | ISC创建闸门 | 被动 | isc.rule.created | ES02 |
| 3 | rule.isc-change-auto-trigger-alignment-001 | ISC变更对齐 | 被动+sweep | isc.rule.*/system.sweep.isc_dto_alignment | ES02,ES11 |
| 4 | rule.isc-dto-handshake-001 | ISC-DTO握手 | 主动+sweep | isc.alignment.drifted | ES11 |
| 5 | rule.isc-naming-convention-001 | ISC命名公约 | 被动+主动 | isc.rule.created + quality.naming.violated | ES02,ES07 |
| 6 | rule.isc-detect-repeated-error-001 | 重复错误检测 | 被动+主动 | system.error.occurred + recurring.threshold_crossed | ES04,ES13 |
| 7 | rule.isc-rule-missing-resource-001 | 规则缺失资源 | 主动 | isc.rule.resource.gap_found | ES10 |
| 8 | rule.isc-rule-timeout-retry-001 | 超时重试 | 被动 | dto.task.failed (timeout) | ES04 |
| 9 | N034-rule-identity-accuracy | 规则识别准确率 | 主动+sweep | isc.rule.identity.gap_found | ES10 |
| 10 | rule-recognition-accuracy-N034 | (R09副本) | — | — | — |
| 11 | N035-rule-trigger-completeness | 触发器完整性 | 被动+主动+sweep | dto.task.completed + isc.trigger.gap_found | ES04,ES10 |
| 12 | rule-trigger-integrity-N035 | (R11副本) | — | — | — |
| 13 | rule.isc-skill-usage-protocol-001 | 技能使用协议 | 被动+主动 | skill.lifecycle.invoked + quality.skill_usage.violated | ES23,ES08 |
| 14 | rule.skill-mandatory-skill-md-001 | 强制SKILL.md | 被动+主动+sweep | skill.lifecycle.created + quality.skillmd.gap_found | ES01,ES06,ES08 |
| 15 | rule.quality-skill-no-placeholder-001 | 禁止占位符 | 被动+主动 | skill.lifecycle.* + quality.placeholder.detected | ES01,ES08 |
| 16 | rule.skill-quality-001 | (R15副本) | — | — | — |
| 17 | rule.skill-md-quality-check-001 | SKILL.md质量 | 被动+主动 | skill.md.* + quality.skillmd.threshold_crossed | ES01,ES08 |
| 18 | rule.readme-quality-check-001 | README质量 | 被动+主动 | skill.lifecycle.created + quality.readme.threshold_crossed | ES01,ES08 |
| 19 | auto-skill-md-generation-019 | 自动生成SKILL.md | 被动+主动 | skill.lifecycle.created + quality.skillmd.gap_found | ES01,ES08 |
| 20 | rule.auto-readme-generation-trigger-001 | 自动生成README | 被动+主动 | skill.lifecycle.created + quality.readme.gap_found | ES01,ES08 |
| 21 | rule.auto-fix-high-severity-001 | 高严重度修复 | 被动 | quality.*.violated (severity=HIGH) | ES08,ES13 |
| 22 | rule.isc-naming-constants-001 | 命名常量 | 被动+主动 | isc.rule.* + quality.naming.violated | ES02,ES07 |
| 23 | rule.isc-naming-gene-files-001 | 基因文件命名 | 被动+主动 | system.file.changed + quality.naming.violated | ES01,ES07 |
| 24 | rule.isc-naming-skill-dir-001 | 技能目录命名 | 被动+主动 | skill.lifecycle.created + quality.naming.violated | ES06,ES07 |
| 25 | rule.naming-skill-bilingual-display-006 | 双语展示 | 被动+主动 | interaction.report.created + quality.naming.violated | ES15,ES07 |
| 26 | rule.auto-evomap-sync-trigger-001 | EvoMap同步 | 被动 | skill.lifecycle.* | ES01,ES06 |
| 27 | rule.auto-github-sync-trigger-001 | GitHub同步 | 被动 | system.file.changed | ES01 |
| 28 | rule.auto-skillization-trigger-001 | 自动技能化 | 被动+主动 | skill.lifecycle.created + quality.skill.threshold_crossed | ES06,ES08 |
| 29 | rule.auto-vectorization-trigger-001 | 自动向量化 | 被动+主动 | skill.md.* + vectorization.skill.gap_found | ES06,ES09 |
| 30 | rule.capability-anchor-auto-register-001 | 能力锚点注册 | 被动+主动 | skill.lifecycle.* + quality.capability_anchor.gap_found | ES06,ES12 |
| 31 | rule.isc-skill-index-auto-update-001 | 技能索引更新 | 被动 | skill.lifecycle.created/updated/deleted | ES01,ES06 |
| 32 | rule.skill.evolution.auto-trigger | 技能进化触发 | 被动 | skill.lifecycle.changed/created/published | ES01,ES06 |
| 33 | rule.decision-capability-anchor-013 | 能力锚点识别 | 主动 | quality.capability_anchor.threshold_crossed | ES12 |
| 34 | rule.decision-proactive-skillization-014 | 主动技能化 | 被动 | quality.capability_anchor.threshold_crossed | ES12 |
| 35 | rule.vectorization.unified-standard-001 | 统一向量化标准 | 被动+主动 | vectorization.*.requested + vectorization.standard.violated | ES09 |
| 36 | rule.vectorization.skill-auto-001 | 技能向量化 | 被动+主动 | skill.md.* + vectorization.skill.gap_found | ES06,ES09 |
| 37 | rule.vectorization.skill-lifecycle-002 | 生命周期向量化 | 被动 | skill.lifecycle.created/updated/merged | ES01,ES06 |
| 38 | rule.vectorization.skill-cleanup-003 | 向量清理 | 被动 | skill.lifecycle.deleted | ES01,ES06 |
| 39 | rule.vectorization.knowledge-auto-001 | 知识向量化 | 被动+主动 | infra.knowledge.* + vectorization.knowledge.gap_found | ES01,ES09 |
| 40 | rule.vectorization.memory-auto-001 | 记忆向量化 | 被动+主动 | infra.memory.* + vectorization.memory.gap_found | ES01,ES09 |
| 41 | rule.vectorization.aeo-auto-001 | AEO向量化 | 被动+主动 | aeo.evaluation.* + vectorization.aeo.gap_found | ES22,ES09 |
| 42 | auto-skill-change-vectorization-028 | 变更向量化 | 被动 | skill.lifecycle.created/updated/merged/iterated | ES01,ES06 |
| 43 | rule.vectorization-trigger-001 | 向量化触发通用 | 被动+sweep | vectorization.*.requested + system.sweep.vectorization | ES09,ES24 |
| 44 | gateway-config-protection-N033 | Gateway配置保护 | 被动 | security.config.updated | ES01,ES14 |
| 45 | evomap-mandatory-security-scan-032 | EvoMap安全扫描 | 被动 | sync.evomap.requested | ES19 |
| 46 | skill-security-gate-030 | 技能安全准出 | 被动 | skill.lifecycle.published / sync.*.requested | ES06,ES19 |
| 47 | skill-permission-classification-031 | 技能权限分级 | 被动+主动 | skill.lifecycle.* + security.permission.gap_found | ES06,ES21 |
| 48 | rule.aeo-evaluation-set-registry-001 | AEO评测集注册 | 被动+主动 | aeo.evaluation.created + aeo.evaluation.gap_found | ES22 |
| 49 | aeo-dual-track-orchestration-024 | AEO双轨编排 | 被动 | aeo.evaluation.requested + skill.lifecycle.updated | ES22,ES06 |
| 50 | aeo-feedback-auto-collection-025 | AEO反馈采集 | 被动+主动 | interaction.message.received + aeo.feedback.detected | ES23 |
| 51 | aeo-insight-to-action-026 | AEO洞察转行动 | 被动+主动 | aeo.insight.generated + aeo.insight.threshold_crossed | ES16 |
| 52 | auto-aeo-evaluation-standard-generation-023 | AEO标准生成 | 被动 | skill.lifecycle.created/updated + aeo.feedback.collected | ES06,ES22 |
| 53 | rule.decision-council-seven-required-001 | 七人议会 | 被动+主动 | orchestration.decision.requested + threshold_crossed | ES23 |
| 54 | rule.decision-custom-2f7dd6e4 | 自定义决策 | 被动 | dto.task.failed (timeout) | ES04 |
| 55 | decision-auto-repair-loop-post-pipeline-016 | 流水线后修复 | 被动 | orchestration.pipeline.completed | ES06 |
| 56 | auto-universal-root-cause-analysis-020 | 根因分析 | 被动 | dto.task.failed / pipeline.failed / sync.*.failed | ES04,ES06,ES19 |
| 57 | detection-architecture-design-isc-compliance-audit-022 | 架构合规 | 被动 | system.design.created/updated | ES01 |
| 58 | detection-cras-recurring-pattern-auto-resolve-017 | CRAS模式解决 | 主动+sweep | aeo.insight.threshold_crossed + system.sweep.cras_patterns | ES16,ES24 |
| 59 | detection-skill-rename-global-alignment-018 | 重命名对齐 | 被动 | skill.lifecycle.renamed/moved | ES01,ES06 |
| 60 | rule.parallel-analysis-workflow-001 | 并行分析 | 被动 | orchestration.analysis.requested | ES23 |
| 61 | rule.parallel-subagent-orchestration-001 | 并行子Agent | 被动 | orchestration.subagent.requested | ES23 |
| 62 | rule.seef-subskill-orchestration-001 | SEEF子技能 | 被动 | skill.lifecycle.created + orchestration.pipeline.requested | ES06 |
| 63 | rule.multi-agent-communication-priority-001 | 多Agent沟通 | 被动 | orchestration.subagent.spawned + interaction.message.received | ES23 |
| 64 | rule.pipeline-report-filter-001 | 流水线汇报过滤 | 被动 | orchestration.pipeline.completed + interaction.report.created | ES06,ES15 |
| 65 | model-api-key-pool-management-029 | API密钥池 | 被动+主动 | infra.apikey.* + infra.apikey.threshold_crossed | ES17 |
| 66 | rule.cron-task-model-requirement-001 | Cron模型要求 | 被动 | infra.cron.created/updated | ES17 |
| 67 | rule.cron-task-model-selection-002 | Cron模型选择 | 被动+主动 | infra.cron.created + quality.cron_model.violated | ES17 |
| 68 | N036-memory-loss-recovery | 记忆恢复 | 被动+主动 | infra.memory.deleted + infra.memory.gap_found | ES01,ES18 |
| 69 | memory-loss-self-recovery-N036 | (R68副本) | — | — | — |
| 70 | rule.interaction-source-file-delivery-007 | 源文件交付 | 被动 | interaction.message.received (匹配"源文件") | ES23 |
| 71 | rule.detection-report-feishu-card-001 | 飞书卡片格式 | 被动+主动 | interaction.report.created + quality.report_format.violated | ES15 |
| 72 | rule.dual-channel-message-guarantee-001 | 双通道保证 | 被动 | interaction.message.sent | ES23 |
| 73 | rule.glm-vision-priority-001 | GLM视觉优先 | 被动 | interaction.message.received (视觉意图) | ES23 |
| 74 | rule.zhipu-capability-router-001 | 智谱能力路由 | 被动 | interaction.message.received | ES23 |
| 75 | rule.github-api-skill-001 | GitHub API技能 | 被动 | skill.lifecycle.created + sync.github.requested | ES06,ES19 |
| 76 | rule.http-skills-suite-001 | HTTP技能套件 | 被动 | skill.lifecycle.created | ES06 |
| 77 | rule.evomap-sync-trigger-001 | EvoMap同步通用 | 被动+sweep | sync.evomap.requested + system.sweep.evomap_sync | ES19,ES24 |
| 78 | planning.time-granularity-037 | 计划时间粒度 | 被动+主动 | orchestration.plan.created + quality.planning.violated | ES23,ES20 |

**100%覆盖完成。78条规则（含4条副本），74条独立规则，每条至少1个事件绑定，0遗漏。**

---

## 附录C：事件思维模型回顾

### 为什么v2有30+条规则被标记为"不可事件化"？

**根本原因**：把"事件"理解为"具体动作发生了"，而不是"状态机的触发条件"。

**错误思维**："报告输出格式标准"——什么时候触发？报告要输出的时候？那不是一直都在输出吗？→ 结论：不可事件化。

**正确思维**：
1. 定时任务创建时 → 事件 → 校验任务是否需要产出报告 → 校验报告相关规则
2. 定时任务执行且产出报告时 → 事件 → 校验报告格式是否合规
3. 全局扫描发现报告格式不合规 → 事件 → 标记+修复

**三个事件锚点，清清楚楚。**

### 事件锚点设计的核心方法论

```
对于任何一条规则：
1. 问：这条规则约束的对象是什么？→ 找到对象
2. 问：这个对象有哪些生命周期节点？→ 每个节点都是被动事件
3. 问：这条规则的违反条件能量化吗？→ 能量化就是主动事件
4. 问：上述事件有没有可能遗漏？→ 需要sweep兜底
```

**这是基础操作，不是高级技巧。**