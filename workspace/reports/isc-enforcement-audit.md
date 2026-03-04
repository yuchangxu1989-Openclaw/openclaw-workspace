# ISC规则执行绑定审计报告

> 生成时间: 2026-03-05 01:39 CST
> 扫描范围: isc-core/rules/ (87条), dto-core/subscriptions/ (73条), isc-core/**/*.js

## 审计方法

1. 解析 `isc-core/rules/` 全部 87 条规则JSON
2. 检查 `dto-core/subscriptions/` 是否有 `isc-{ruleId}.json` 订阅文件
3. 搜索 `isc-core/` 下JS源码是否引用规则ID
4. 检查规则trigger.actions是否有具体type

### 分类标准

- **Enforced**: 有DTO订阅或JS代码实际引用 + 有trigger.actions定义
- **Partially-Enforced**: 有DTO订阅但无actions，或有trigger声明但无执行代码
- **Unenforced**: 仅JSON文件存在，无任何执行绑定

---

## ✅ Enforced（0条）

| 规则ID | 描述 | Trigger事件 | 执行证据 |
|--------|------|------------|----------|
| (无) | — | — | — |

## ⚠️ Partially-Enforced（48条）

| 规则ID | 描述 | Trigger事件 | 已有绑定 | 缺口 |
|--------|------|------------|----------|------|
| evomap_sync | (无描述) | 无 | DTO订阅, JS引用 | DTO订阅存在但规则无trigger.actions定义 |
| isc-detect-repeated-error | (无描述) | 无 | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| isc-evomap-mandatory-security-scan-032 | 对EvoMap同步清单中的技能实施强制安全扫描，阻断恶意技能传播 | evomap.sync.request, evomap.skill.upload | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| isc-naming-constants | (无描述) | 无 | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| isc-naming-gene-files | (无描述) | 无 | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| isc-naming-skill-dir | (无描述) | 无 | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| isc-rule-missing-resource | (无描述) | 无 | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| isc-rule-timeout-retry | (无描述) | 无 | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| isc-skill-permission-classification-031 | Filesystem/Network/Shell/Credential四维度权限标注，实现最小权限原则 | 无 | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| ISC-SKILL-QUALITY-001 | 禁止占位符技能 - 技能必须有实质性实现 | 无 | DTO订阅, JS引用 | DTO订阅存在但规则无trigger.actions定义 |
| isc-skill-security-gate-030 | 基于Snyk 8类威胁检测的技能发布前置门禁，阻断潜在供应链风险 | skill.publish, skill.sync, skill.evoMap.upload | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| N006 | 技能名称双语展示标准 - 所有汇报涉及skill英文名时必须同时展示中文名 | 无 | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| N007-v2 | 源文件交付标准 - 当用户要求'源文件'时，必须通过消息工具直接发送文件本身。如果通道不支持文件传输，则输出完整文件内容 | 无 | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| N016 | 流水线后自动修复循环 - 全局自主决策流水线发现问题后，自动循环修复直至稳定 | 无 | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| N017 | CRAS重复模式自动解决 - CRAS-B用户洞察分析发现同一问题模式≥2次时，主动根因分析并自动解决 | 无 | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| N018 | 技能重命名全局引用对齐 - 检测到技能/模块重命名或移动时，自动扫描并更新所有引用点 | skill_renamed, skill_moved, module_refactored | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| N019 | 自动SKILL.md生成 - 代码文件存在但SKILL.md缺失或质量不达标时，由深度思考类模型自动生成 | skill_code_created, skill_code_major_update, skill_md_missing, skill_md_quality_low | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| N020 | 通用根因分析与差距分析 - 针对各类系统问题自动进行深度分析，由DTO驱动闭环解决 | execution_failed, pipeline_error, sync_failure, health_check_failed, user_reported_issue, design_compliance_failure, architecture_audit_failed, hardcode_detected, isc_non_compliance_detected | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| N022 | 架构设计ISC合规审计 - 自动检查架构设计方案是否符合ISC标准，强制要求完整输出物 | design_document_created, architecture_design_completed, mr_design_generated | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| N023 | AEO自动生成评测标准 - 基于技能类型、历史数据、用户反馈自动生成评测标准和黄金标准 | skill_created, skill_major_update, aeo_evaluation_required, user_feedback_collected | DTO订阅, JS引用 | DTO订阅存在但规则无trigger.actions定义 |
| N024 | AEO双轨运营编排 - 自动区分AI效果运营和功能质量运营，分别执行评测 | aeo_evaluation_required, skill_test_triggered | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| N025 | AEO用户反馈自动收录 - 主动检测用户质疑、澄清、重复修改等信号，自动收录为问题 | user_message_received, conversation_turn_completed | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| N026 | AEO洞察到整改闭环 - 当问题频率达到阈值时，自动生成短期/中期/长期整改方案并跟踪执行 | aeo_issue_frequency_threshold_exceeded, n020_analysis_completed | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| N028 | 技能变更自动向量化 - 技能增删改合并迭代时，自动识别必要文档并向量化 | skill_created, skill_updated, skill_merged, skill_iterated | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| N029 | 模型API Key池管理 - 多Key并行调度、失效自动切换、负载均衡 | api_key_rate_limit, api_key_invalid, api_key_expired, model_request_initiated | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| N034 | 强制从文件系统实际计数规则，禁止推断或缓存，确保DTO规则识别准确 | 无 | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| N034 | 规则识别与计数准确性校验，禁止将规则类别数误认为规则总数 | 无 | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| N035 | 监控所有规则的触发情况，检测未触发规则并报告原因 | 无 | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| N035 | 规则触发完整性监控，检查未触发规则并报告原因 | 无 | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| R006 | 关键决策必经七人议会审议 - 所有新规则、订阅变更、流水线模块更新 | 无 | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| R013 | 能力锚点自动识别 - 识别应固化的能力并触发技能化 | 无 | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| R014 | 主动技能化执行 - 检测到候选技能后自动执行完整技能化流程 | 无 | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| readme_quality | (无描述) | 无 | DTO订阅, JS引用 | DTO订阅存在但规则无trigger.actions定义 |
| rule_2f7dd6e4 | (无描述) | 无 | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| rule.anti-entropy-design-principle-001 | 所有设计和决策必须满足反熵增原则：批判性思维、可扩展、可泛化、可生长。违反此原则的设计必须被拦截。 | design.document.created, design.document.modified, architecture.decision.made, isc.rule.created, skill.created, dto.task.created | 仅JSON声明 | 无DTO订阅/JS执行代码 |
| rule.architecture-diagram-visual-output-001 | 任何架构设计输出除了文本/MD格式外，必须额外生成一份直观的可视化图片并发送给用户。使用Mermaid渲染结构化图表，不 | design.architecture.created, design.architecture.updated | 仅JSON声明 | 无DTO订阅/JS执行代码 |
| rule.architecture-review-pipeline-001 | 任何架构设计方案或模块重构方案，必须经过标准化评审流水线：架构师出方案→工程师验证可落地性→质量分析师验证合理性→循环修 | design.document.created, design.document.modified, architecture.refactor.proposed, module.restructure.proposed, system.failure.refactor_required | 仅JSON声明 | 无DTO订阅/JS执行代码 |
| rule.capability-anchor-auto-register-001 | 新增通用能力（多模态、大模型、IM交互、工具等）时，必须自动写入CAPABILITY-ANCHOR.md。AI不应忘记自 | skill.created, skill.updated, tool.discovered, provider.added, capability.changed | 仅JSON声明 | 无DTO订阅/JS执行代码 |
| rule.interactive-card-context-inference-001 | 当收到用户回复引用的消息体为[Interactive Card]时，不得询问用户卡片内容。必须根据最近发出的消息、当前对 | message.reply.received | 仅JSON声明 | 无DTO订阅/JS执行代码 |
| rule.layered-decoupling-architecture-001 | 所有规则、任务、技能的设计必须明确三层归属：感知层（谁观察/什么探针）、认知层（谁判断/什么引擎）、执行层（谁行动/什么 | design.document.created, design.document.modified, isc.rule.created, skill.created, dto.task.created | 仅JSON声明 | 无DTO订阅/JS执行代码 |
| rule.meta-enforcement-gate-001 | ISC元规则：规则必须有强制执行机制，否则视为未制定。写了但没挂执行的规则等于废纸。 | rule.created, rule.updated, delivery.review_requested | trigger.actions | 无DTO订阅/JS执行代码 |
| rule.parallel-analysis-workflow-001 | 并行分析工作流 - 同时执行多个分析任务提高效率 | analysis.requested | 仅JSON声明 | 无DTO订阅/JS执行代码 |
| rule.parallel-subagent-orchestration-001 | 并行子Agent编排规则 - DTO调度多Agent并行执行复杂工作流 | workflow.requested, complex_task.detected | 仅JSON声明 | 无DTO订阅/JS执行代码 |
| rule.self-correction-to-rule-001 | 当Agent在对话中承认行为缺陷并表达纠偏意图时，必须立即将纠偏固化为ISC规则或技能更新。不依赖关键词匹配，依赖语义意 | agent.behavior.defect_acknowledged | 仅JSON声明 | 无DTO订阅/JS执行代码 |
| rule.visual-output-style-001 | 所有工程图（架构图、集成映射图、数据流图等）必须：1.浅色背景（白色或浅灰）2.中文标注（不接受纯英文）3.颜色柔和不刺 | visual.diagram.generating | 仅JSON声明 | 无DTO订阅/JS执行代码 |
| S005 | 报告输出格式标准 - 飞书卡片 | 无 | DTO订阅 | DTO订阅存在但规则无trigger.actions定义 |
| skill_md_quality | (无描述) | 无 | DTO订阅, JS引用 | DTO订阅存在但规则无trigger.actions定义 |
| vectorization | (无描述) | 无 | DTO订阅, JS引用 | DTO订阅存在但规则无trigger.actions定义 |

## ❌ Unenforced（39条）

| 规则ID | 描述 | 文件 |
|--------|------|------|
| N033 | 禁止自动修改Gateway、飞书、Agent与模型配置，所有此类修改必须用户人工确认后方可执行 | gateway-config-protection-N033.json |
| N036 | 当MEMORY.md丢失或损坏时，从文件系统自动重建规则清单和系统状态 | N036-memory-loss-recovery.json |
| N036 | 记忆丢失后自主恢复，从文件系统重建规则清单，不依赖MEMORY.md | memory-loss-self-recovery-N036.json |
| planning.time-granularity-037 | AI进化速度极快，计划粒度必须以分钟/小时为单位，禁止按日/周/月列计划 | planning.time-granularity-037.json |
| rule-bundle-intent-system-001 | (无描述) | rule-bundle-intent-system-001.json |
| rule.aeo-evaluation-set-registry-001 | AEO评测集注册管理标准 - 统一评测集的收录、分类和检索 | rule.aeo-evaluation-set-registry-001.json |
| rule.auto-evomap-sync-trigger-001 | 自动EvoMap同步触发规则 - 技能创建或更新时同步到EvoMap网络 | rule.auto-evomap-sync-trigger-001.json |
| rule.auto-fix-high-severity-001 | 自动修复高严重度问题 - 严重度高且允许自动修复时执行 | rule.auto-fix-high-severity-001.json |
| rule.auto-github-sync-trigger-001 | 自动GitHub同步触发规则 - 核心系统代码变更时自动提交到GitHub | rule.auto-github-sync-trigger-001.json |
| rule.auto-readme-generation-trigger-001 | 自动README生成触发规则 - 代码文件存在但README缺失时生成 | rule.auto-readme-generation-trigger-001.json |
| rule.auto-skillization-trigger-001 | 自动技能化触发规则 - 技能质量分>=50时自动触发技能化流程 | rule.auto-skillization-trigger-001.json |
| rule.auto-vectorization-trigger-001 | 自动向量化触发规则 - SKILL.md存在且未向量化时触发 | rule.auto-vectorization-trigger-001.json |
| rule.cron-task-model-requirement-001 | 定时任务必须指定模型规则 - GLM-5优先，Claude-Sonnet备选 | rule.cron-task-model-requirement-001.json |
| rule.cron-task-model-selection-002 | CRON定时任务模型选择标准 - 根据任务类型自动选择最优模型 | rule.cron-task-model-selection-002.json |
| rule.dual-channel-message-guarantee-001 | 双通道消息投递保证 - 关键消息必须双通道确认送达 | rule.dual-channel-message-guarantee-001.json |
| rule.github-api-skill-001 | GitHub API技能 - 自动处理token、分页、限流 | rule.github-api-skill-001.json |
| rule.glm-vision-priority-001 | 图像视频需求优先调用GLM-4V-Plus规则 - 根治遗忘 | rule.glm-vision-priority-001.json |
| rule.http-skills-suite-001 | HTTP技能套件 - GitHub API、EvoMap A2A、文件下载、API聚合 | rule.http-skills-suite-001.json |
| rule.isc-change-auto-trigger-alignment-001 | ISC规则变更自动触发对齐检查 - 规则新增/修改/删除时自动执行对齐 | rule.isc-change-auto-trigger-alignment-001.json |
| rule.isc-creation-gate-001 | ISC规则创建闸门 - 创建时强制验证，拒绝不符合标准的规则 | rule.isc-creation-gate-001.json |
| rule.isc-dto-handshake-001 | ISC-DTO定期握手机制 - 每30分钟互相扫描对齐 | rule.isc-dto-handshake-001.json |
| rule.isc-naming-convention-001 | ISC规则命名公约 - 严格执行R001-R005标准格式 | rule.isc-naming-convention-001.json |
| rule.isc-skill-index-auto-update-001 | 技能索引自动更新 - 技能创建/修改/删除时自动更新SKILL_INDEX.md | rule.isc-skill-index-auto-update-001.json |
| rule.isc-skill-usage-protocol-001 | 技能使用协议 - 使用任何技能前必须先读取SKILL.md确认用法，禁止凭猜测调用 | rule.isc-skill-usage-protocol-001.json |
| rule.isc-standard-format-001 | ISC规则文件格式统一标准 - 确保ISC-DTO无缝对接 | rule.isc-standard-format-001.json |
| rule.multi-agent-communication-priority-001 | 多Agent并行与用户沟通优先规则 - 所有任务使用多Agent并行，主Agent沟通始终畅通 | rule.multi-agent-communication-priority-001.json |
| rule.pipeline-report-filter-001 | 流水线汇报过滤规则 - 静默常规技能版本更新，仅汇报同步失败或重大发布 | rule.pipeline-report-filter-001.json |
| rule.seef-subskill-orchestration-001 | DTO直接调度SEEF七大子技能，SEEF仅作为子技能库 | rule.seef-subskill-orchestration-001.json |
| rule.skill-mandatory-skill-md-001 | 技能强制SKILL.md规则 - 所有技能目录必须包含SKILL.md文件，否则禁止进入流水线 | rule.skill-mandatory-skill-md-001.json |
| rule.skill-quality-001 | 禁止占位符技能 - 技能必须有实质性实现 | rule.skill-quality-001.json |
| rule.vectorization.aeo-auto-001 | AEO评测用例必须向量化 - 所有evaluation-sets/*.json文件必须生成1024维智谱向量 | rule.vectorization.aeo-auto-001.json |
| rule.vectorization.knowledge-auto-001 | 知识文件必须向量化 - 所有knowledge/*.json文件必须生成1024维智谱向量 | rule.vectorization.knowledge-auto-001.json |
| rule.vectorization.memory-auto-001 | 记忆必须向量化 - 所有记忆文件必须生成1024维智谱向量 | rule.vectorization.memory-auto-001.json |
| rule.vectorization.skill-auto-001 | 技能必须向量化 - 所有SKILL.md文件必须生成1024维智谱向量 | rule.vectorization.skill-auto-001.json |
| rule.vectorization.skill-cleanup-003 | 技能向量清理规则 - 删除时立即删除对应向量文件，定期清理孤儿向量（源文件不存在但向量存在） | rule.vectorization.skill-cleanup-003.json |
| rule.vectorization.skill-lifecycle-002 | 技能生命周期向量化规则 - 覆盖created, updated, merged, fixed事件，全量连续执行，不分批 | rule.vectorization.skill-lifecycle-002.json |
| rule.vectorization.unified-standard-001 | 统一使用智谱向量化标准 - 禁止TF-IDF，强制使用智谱Embedding API(1024维) | rule.vectorization.unified-standard-001.json |
| rule.zhipu-capability-router-001 | 智谱能力自动路由 - 根据输入模态自动选择模型 | rule.zhipu-capability-router-001.json |
| skill.evolution.auto-trigger | 技能变更时自动触发SEEF进化流水线 | rule.skill.evolution.auto-trigger.json |

---

## 📊 统计

| 指标 | 数值 |
|------|------|
| 规则总数 | 87 |
| ✅ Enforced | 0 (0.0%) |
| ⚠️ Partially-Enforced | 48 (55.2%) |
| ❌ Unenforced | 39 (44.8%) |
| **实际执行率** | **0.0%** |
| **无任何绑定率** | **44.8%** |

## 💡 关键发现

1. **87条规则中仅0条有完整执行机制**，实际执行率0.0%
2. 48条规则有部分绑定（多数仅有DTO订阅但无trigger.actions），属于"挂了名但没挂枪"
3. 39条规则完全无执行绑定，是纯文档存在
4. DTO订阅覆盖了73条规则，但订阅≠执行——多数订阅文件仅做事件路由，无实际enforcement逻辑

## 🎯 建议

1. 对partially-enforced规则补充trigger.actions定义
2. 对unenforced规则评估：保留有价值的 → 补执行机制；无价值的 → 归档或删除
3. 建立规则执行覆盖率CI检查，新增规则必须同时提交执行代码
