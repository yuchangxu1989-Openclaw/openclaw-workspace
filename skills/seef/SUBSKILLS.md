# SEEF 七大子技能详细定义

> 每个子技能均为自治单元，拥有唯一功能边界、明确定义的输入输出契约、以及与 ISC 和 DTO 的标准化交互协议。

---

## 1. 技能评估器（skill-evaluator）

### 中文定义
负责对现有技能进行多维质量诊断，特别融合 CRAS 用户意图洞察报告，将"技能设计预期"与"用户真实行为"交叉比对，识别偏差根源。

### 核心任务
1. 执行技能文档结构完整性、接口稳定性与标准符合性初筛
2. 关联 CRAS 报告中的用户行为数据（如高频失败路径、手动绕过步骤、自定义脚本泛滥），判断技能是否"过度设计""能力缺失"或"交互不友好"
3. 输出带归因的问题清单与改进优先级建议（含用户侧证据）

### 所依据的标准来源
- **ISC detection_standards**（含语义偏移阈值）
- **CRAS intent_insight_report**（结构化 JSON，字段包括 usersegment, pain_point, workaround_count, success_rate_delta）

### 准入与准出机制

**✅ 准入条件**
- 由 DTO 显式触发（定时任务/事件告警）
- 输入技能文件通过 ISC 的 `file_integrity_check`（哈希校验 + 必填字段检查）
- 若 CRAS 报告缺失，则降级为纯内部分析，但需标记"缺乏用户侧依据"

**✅ 准出规则**
- 输出问题清单中 ≥1 项偏差超过 ISC `detection_thresholds` 中定义的阈值时，自动标记为"需介入"
- 否则视为"健康"，准出状态为 `status: ready_for_next` 或 `status: skip`
- 结果实时推送至 DTO 的 `evolution_queue` 供后续决策

---

## 2. 技能发现器（skill-discoverer）

### 中文定义
在技能库与用户行为双重线索下，主动识别能力空白、冗余建设及潜在协同机会，将用户未言明的需求转化为可落地的技能创新点。

### 核心任务
1. 分析技能向量空间，定位语义孤立区或高密度重叠区
2. 结合 CRAS 报告中的"用户自发组合行为"（如多个技能被频繁串联使用），推断应封装为新技能的场景
3. 输出两类结果：
   - **「创新机会清单」**：例"用户常手动拼接 A+B+C 生成报表，建议合成'全自动报表生成'技能"
   - **「优化合并建议」**：例"技能 X 与 Y 功能重合率达 82%，且用户始终只用其一，建议合并"

### 所依据的标准来源
- **ISC migration_rules**（含能力聚类与合并策略）
- **CRAS behavior_pattern_catalog**（含高频组合模式标识）

### 准入与准出机制

**✅ 准入条件**（需同时满足）
1. 上游 skill-evaluator 输出 `status: need_investigation` 或 `status: gap_detected`
2. ISC 确认当前标准版本支持缺口识别（`standard_version.compatibility = true`）
3. DTO 未禁止该类发现（`dto_policy.allow_discovery = true`）

**✅ 准出规则**
- 生成 ≥1 条含业务影响评级（L/M/H）的可操作建议即视为通过
- 否则返回 `status: insufficient_evidence`，并建议补充分析
- 准出结果附带 `priority_score`，供 DTO 排序调度

---

## 3. 技能优化器（skill-optimizer）

### 中文定义
针对已识别的问题，自动生成安全、可逆、低风险的修复方案，是技能自我修正的执行单元。

### 核心任务
1. 基于问题清单生成结构化补丁（diff 形式），明确修改范围与理由
2. 模拟修改对上下游技能、变量名、定时任务等的潜在影响
3. 输出可评审的修复提案，非强制执行

### 所依据的标准来源
- **ISC auto_fix_rules**（含风险等级矩阵、副作用禁令列表）

### 准入与准出机制

**✅ 准入条件**
- 问题清单中标记 `autofixable = true`
- ISC 的 `risk_assessment_matrix` 评定风险等级 R ≤ 2（低风险）
- DTO 未锁定该技能为"只读"

**✅ 准出规则**
- 修复提案必须通过 ISC 的 `diff_safety_check`（禁止跨模块副作用、禁止破坏契约接口）
- 通过后状态为 `status: ready_for_apply`
- 否则转交人工复核
- DTO 可配置自动执行阈值（如 R ≤ 1 时直接提交 Git PR）

---

## 4. 技能创造器（skill-creator）

### 中文定义
根据能力缺口或业务需求，自动生成符合规范的新技能原型，包括文档、接口定义与最小可运行模板。

### 核心任务
1. 构建完整 SKILL.md 框架（含功能描述、输入输出、约束条件、示例）
2. 自动生成 README、CLI 命令说明与最小代码模板
3. 标注基因血缘信息（parent_id, gene_id, version_chain），支持追溯

### 所依据的标准来源
- **ISC naming_standards**（命名规范）
- **ISC architecture_standards**（分层与接口模式）

### 准入与准出机制

**✅ 准入条件**
- 收到 skill-discoverer 的高优先级创新建议（`priority_score ≥ 8`）
- 或 DTO 下达专项创建指令
- ISC 的 `standard_status` 为 `published`（标准已生效）

**✅ 准出规则**
- 生成的 SKILL.md 必须通过 ISC 的 `schema_validation`（JSON Schema 校验）
- 通过 `gene_lineage_check`（血缘链完整）
- 通过后状态为 `status: draft`，等待 skill-validator 接管
- DTO 可设定"草稿自动入库"策略（如每周汇总提交一次）

---

## 5. 全局标准化对齐器（skill-aligner）

### 中文定义
唯一与 ISC 主动联动的子技能，负责监听标准变更，并在技能创建、修改、删除、合并等任一操作后，自动触发全链路术语与结构对齐，彻底清除遗留问题。

### 核心任务
1. 从 ISC 订阅最新 `alignment_standards`（含命名规则、分层协议、术语表）
2. 在技能变更事件发生后，扫描并更新所有相关依赖项（Python 变量名、函数名、定时任务配置、文件路径、文档交叉引用等）
3. 生成"对齐收据"（alignment_receipt），确认无残留旧引用

### 所依据的标准来源
- **ISC alignment_standards**（动态订阅，带版本哈希）

### 准入与准出机制

**✅ 准入条件**
- 任一技能发生 create / modify / delete / merge 操作（由 DTO 或其他子技能触发事件）
- ISC 的 `standard_version` 有更新或本技能未完成上次对齐
- DTO 未启用"对齐冻结"策略

**✅ 准出规则**
完成对齐后，生成 `alignment_receipt`，包含：
- 修正项总数
- 涉及的上下游资产清单（精确到文件路径与字段名）
- "残留清零"确认签名（哈希值，基于清理后所有目标文件计算）

仅当签名有效且无警告项（`warnings: []`）时，状态为 `status: aligned`
否则标记 `status: partial_clean` 并告警

**📡 与 DTO 协同**
DTO 可强制触发"全量对齐巡检"，并接收对齐覆盖率报告（% of skills aligned）

---

## 6. 技能验证器（skill-validator）

### 中文定义
作为技能进入生产环境前的最后一道关卡，确保其功能、质量与规范三重达标，是准入与准出的最终裁决者。

### 核心任务
1. 执行基础可用性测试（准入）与集成兼容性测试（准出）
2. 校验是否符合 ISC 的 `admission_rules`（如文档完整性、接口稳定性、错误处理规范）
3. 输出带证据链的验证结论（通过/驳回 + 违规明细 + 修复指引）

### 所依据的标准来源
- **ISC admission_rules**（含 mandatory / optional 条款列表）
- **test_coverage_schema**

### 准入与准出机制

**✅ 准入条件**
- 输入技能处于 `status: draft` 或 `status: modified`
- ISC 的 `admission_window` 开放（默认工作日 9:00–18:00，可配置）
- DTO 未开启"紧急跳过"模式

**✅ 准出规则**
- **准入通过**：100% 满足 mandatory 条款 + ≥95% optional 条款
- **准出通过**：集成测试通过率 ≥98%，且无 critical 级缺陷

任一失败则返回 `rework_recommendation`，状态为 `status: rejected`，并通知 DTO
DTO 可配置豁免白名单（如 P0 故障修复场景降低阈值）

---

## 7. 技能记录器（skill-recorder）

### 中文定义
忠实记录每一次技能变更事件，构建可追溯的进化知识库，支撑审计、回溯与智能推荐。

### 核心任务
1. 归档变更内容（含前后哈希、操作类型、触发源、用户意图关联 ID）
2. 维护技能血缘图谱（谁基于谁创建/修改/合并）
3. 生成 human-readable 的 evolution.log 条目（按时间倒序）

### 所依据的标准来源
- **ISC memory_standards**（含日志结构、存证哈希算法）

### 准入与准出机制

**✅ 准入条件**
- 任一子技能完成准出（无论成功/失败），即触发记录
- DTO 未关闭日志采集

**✅ 准出规则**
- 生成结构化日志条目后，向 ISC 提交 `evolution_hash` 进行存证
- ISC 返回 `receipt_id` 且校验通过，即视为完成，状态为 `status: logged`
- 否则重试（最多 3 次）

---

## 附录：子技能间数据流

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  evaluator  │───→│  discoverer │───→│  optimizer  │
│  (评估)     │    │  (发现)     │    │  (优化)     │
└─────────────┘    └─────────────┘    └──────┬──────┘
                                              │
                                              ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  recorder   │←───│  validator  │←───│   creator   │
│  (记录)     │    │  (验证)     │    │  (创造)     │
└─────────────┘    └──────┬──────┘    └─────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │   aligner   │
                   │  (对齐)     │
                   └─────────────┘
```

**数据契约**：每个子技能输出必须包含 `isc_ref` 和 `dto_context`，确保全链路可追溯。
