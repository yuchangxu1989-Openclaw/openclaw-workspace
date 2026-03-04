# ISC规则精简与分级报告

**执行时间**: 2026-03-05 01:45 CST

**分级标准**: 两档制（P0_gate + P1_process），无P2。上线后全部是基线，不允许穿透。

## 统计总览

| 类别 | 数量 |
|------|------|
| 原始规则总数 | 63 |
| 废弃（移入_deprecated） | 24 |
| **保留** | **63** |
| P0_gate（交付门禁，硬拦） | 22 |
| P1_process（流程自动化，先挂触发器） | 41 |

## 废弃规则（24条）

| 文件 | 废弃原因 |
|------|----------|
| `memory-loss-self-recovery-N036.json` | Duplicate of N036-memory-loss-recovery.json (less complete, no id) |
| `rule-recognition-accuracy-N034.json` | Duplicate of N034-rule-identity-accuracy.json (less complete) |
| `rule-trigger-integrity-N035.json` | Duplicate of N035-rule-trigger-completeness.json (less complete) |
| `rule.aeo-evaluation-set-registry-001.json` | Empty shell (no trigger/action), covered by N023 auto evaluation standard generation |
| `rule.auto-vectorization-trigger-001.json` | Redundant with N028 (skill-change-auto-vectorization) and vectorization.skill-auto-001 |
| `rule.cron-task-model-selection-002.json` | Redundant with rule.cron-task-model-requirement-001 (same topic, less specific) |
| `rule.decision-capability-anchor-013.json` | Redundant with rule.capability-anchor-auto-register-001 (more complete) |
| `rule.decision-custom-2f7dd6e4.json` | Empty shell with random hash ID, no description or trigger |
| `rule.decision-proactive-skillization-014.json` | Redundant with rule.auto-skillization-trigger-001 (same function) |
| `rule.dual-channel-message-guarantee-001.json` | Empty shell (no trigger, no action), aspirational without enforcement |
| `rule.evomap-sync-trigger-001.json` | Empty shell, replaced by rule.auto-evomap-sync-trigger-001.json |
| `rule.github-api-skill-001.json` | Not a rule - describes a skill capability, no enforcement logic |
| `rule.http-skills-suite-001.json` | Not a rule - skill suite catalog, no enforcement logic |
| `rule.isc-detect-repeated-error-001.json` | Empty shell (no id, no description, no trigger, no action) |
| `rule.isc-naming-constants-001.json` | Empty shell, covered by rule.isc-naming-convention-001 |
| `rule.isc-naming-gene-files-001.json` | Empty shell, covered by rule.isc-naming-convention-001 |
| `rule.isc-naming-skill-dir-001.json` | Empty shell, covered by rule.isc-naming-convention-001 |
| `rule.isc-rule-missing-resource-001.json` | Empty shell (no description), unclear scope |
| `rule.isc-rule-timeout-retry-001.json` | Empty shell (no description), generic retry without specific scope |
| `rule.parallel-analysis-workflow-001.json` | Redundant with rule.parallel-subagent-orchestration-001 (same pattern) |
| `rule.readme-quality-check-001.json` | Empty (no description/trigger), covered by auto-readme-generation-trigger-001 |
| `rule.skill-md-quality-check-001.json` | Empty (no description/trigger), covered by N019 auto-skill-md-generation |
| `rule.skill-quality-001.json` | Duplicate of rule.quality-skill-no-placeholder-001.json (same name: skill_no_placeholder) |
| `rule.vectorization-trigger-001.json` | Empty shell, replaced by specific vectorization.* rules |

## P0_gate 规则（22条）- 交付门禁，硬拦

- **`N034`** — 规则计数必须从文件系统实际计数，禁止推断
- **`isc-evomap-mandatory-security-scan-032`** — EvoMap同步强制安全扫描
- **`gateway-config-protection-N033.json`** — 敏感配置修改必须用户确认，禁止自动修改
- **`N029`** — API Key池管理，失效自动切换
- **`planning.time-granularity-037`** — AI计划以分钟/小时为单位，禁止按日/周/月
- **`rule.anti-entropy-design-principle-001`** — 反熵增设计原则，所有设计必须满足四项检查
- **`rule.architecture-review-pipeline-001`** — 架构设计必须经标准评审流水线
- **`rule.cron-task-model-requirement-001`** — 定时任务必须指定模型
- **`R006`** — 关键决策必经七人议会审议
- **`N007-v2`** — 源文件交付标准，必须直接发送文件
- **`rule.interactive-card-context-inference-001`** — 收到Interactive Card回复时禁止反问，必须推断
- **`rule.isc-creation-gate-001`** — ISC规则创建闸门，拒绝不合格规则
- **`rule.isc-naming-convention-001`** — ISC规则命名公约，严格执行标准格式
- **`rule.isc-skill-usage-protocol-001`** — 使用技能前必须先读SKILL.md，禁止凭猜测调用
- **`rule.isc-standard-format-001`** — ISC规则文件格式统一标准
- **`rule.layered-decoupling-architecture-001`** — 三层解耦架构，感知/认知/执行层必须明确归属
- **`rule.meta-enforcement-gate-001`** — 元规则：规则必须有强制执行机制，否则等于废纸
- **`ISC-SKILL-QUALITY-001`** — 禁止占位符技能，必须有实质性实现
- **`rule.self-correction-to-rule-001`** — Agent承认缺陷时必须固化为ISC规则
- **`rule.skill-mandatory-skill-md-001`** — 技能必须有SKILL.md，否则禁止进入流水线
- **`isc-skill-permission-classification-031`** — 技能权限四维度分级标注
- **`isc-skill-security-gate-030`** — 技能安全准出门禁，发布前必须安全扫描

## P1_process 规则（41条）- 流程自动化

- **`N035`** — 监控所有规则的触发情况，检测未触发规则并报告原因
- **`N036`** — 当MEMORY.md丢失或损坏时，从文件系统自动重建规则清单和系统状态
- **`N024`** — AEO双轨运营编排 - 自动区分AI效果运营和功能质量运营，分别执行评测
- **`N025`** — AEO用户反馈自动收录 - 主动检测用户质疑、澄清、重复修改等信号，自动收录为问题
- **`N026`** — AEO洞察到整改闭环 - 当问题频率达到阈值时，自动生成短期/中期/长期整改方案并跟踪执行
- **`N023`** — AEO自动生成评测标准 - 基于技能类型、历史数据、用户反馈自动生成评测标准和黄金标准
- **`N028`** — 技能变更自动向量化 - 技能增删改合并迭代时，自动识别必要文档并向量化
- **`N019`** — 自动SKILL.md生成 - 代码文件存在但SKILL.md缺失或质量不达标时，由深度思考类模型自动生成
- **`N020`** — 通用根因分析与差距分析 - 针对各类系统问题自动进行深度分析，由DTO驱动闭环解决
- **`N016`** — 流水线后自动修复循环 - 全局自主决策流水线发现问题后，自动循环修复直至稳定
- **`N022`** — 架构设计ISC合规审计 - 自动检查架构设计方案是否符合ISC标准，强制要求完整输出物
- **`N017`** — CRAS重复模式自动解决 - CRAS-B用户洞察分析发现同一问题模式≥2次时，主动根因分析并自动解决
- **`N018`** — 技能重命名全局引用对齐 - 检测到技能/模块重命名或移动时，自动扫描并更新所有引用点
- **`rule.intent-type-convergence-001`** — 意图识别系统必须覆盖且仅覆盖5种收敛类型：(1)正负向情绪意图、(2)规则触发意图、(3)复杂意图（需5轮以上上下文推理）、(4)隐含意图（非明确表达，需推理）...
- **`rule.architecture-diagram-visual-output-001`** — 任何架构设计输出除了文本/MD格式外，必须额外生成一份直观的可视化图片并发送给用户。使用Mermaid渲染结构化图表，不使用AI文生图（CogView等不适合技...
- **`rule.auto-evomap-sync-trigger-001`** — 自动EvoMap同步触发规则 - 技能创建或更新时同步到EvoMap网络
- **`rule.auto-fix-high-severity-001`** — 自动修复高严重度问题 - 严重度高且允许自动修复时执行
- **`rule.auto-github-sync-trigger-001`** — 自动GitHub同步触发规则 - 核心系统代码变更时自动提交到GitHub
- **`rule.auto-readme-generation-trigger-001`** — 自动README生成触发规则 - 代码文件存在但README缺失时生成
- **`rule.auto-skillization-trigger-001`** — 自动技能化触发规则 - 技能质量分>=50时自动触发技能化流程
- **`rule.capability-anchor-auto-register-001`** — 新增通用能力（多模态、大模型、IM交互、工具等）时，必须自动写入CAPABILITY-ANCHOR.md。AI不应忘记自己的能力。
- **`S005`** — 报告输出格式标准 - 飞书卡片
- **`rule.glm-vision-priority-001`** — 图像视频需求优先调用GLM-4V-Plus规则 - 根治遗忘
- **`rule.isc-change-auto-trigger-alignment-001`** — ISC规则变更自动触发对齐检查 - 规则新增/修改/删除时自动执行对齐
- **`rule.isc-dto-handshake-001`** — ISC-DTO定期握手机制 - 每30分钟互相扫描对齐
- **`rule.isc-skill-index-auto-update-001`** — 技能索引自动更新 - 技能创建/修改/删除时自动更新SKILL_INDEX.md
- **`rule.multi-agent-communication-priority-001`** — 多Agent并行与用户沟通优先规则 - 所有任务使用多Agent并行，主Agent沟通始终畅通
- **`N006`** — 技能名称双语展示标准 - 所有汇报涉及skill英文名时必须同时展示中文名
- **`rule.parallel-subagent-orchestration-001`** — 并行子Agent编排规则 - DTO调度多Agent并行执行复杂工作流
- **`rule.pipeline-report-filter-001`** — 流水线汇报过滤规则 - 静默常规技能版本更新，仅汇报同步失败或重大发布
- **`rule.seef-subskill-orchestration-001`** — DTO直接调度SEEF七大子技能，SEEF仅作为子技能库
- **`skill.evolution.auto-trigger`** — 技能变更时自动触发SEEF进化流水线
- **`rule.vectorization.aeo-auto-001`** — AEO评测用例必须向量化 - 所有evaluation-sets/*.json文件必须生成1024维智谱向量
- **`rule.vectorization.knowledge-auto-001`** — 知识文件必须向量化 - 所有knowledge/*.json文件必须生成1024维智谱向量
- **`rule.vectorization.memory-auto-001`** — 记忆必须向量化 - 所有记忆文件必须生成1024维智谱向量
- **`rule.vectorization.skill-auto-001`** — 技能必须向量化 - 所有SKILL.md文件必须生成1024维智谱向量
- **`rule.vectorization.skill-cleanup-003`** — 技能向量清理规则 - 删除时立即删除对应向量文件，定期清理孤儿向量（源文件不存在但向量存在）
- **`rule.vectorization.skill-lifecycle-002`** — 技能生命周期向量化规则 - 覆盖created, updated, merged, fixed事件，全量连续执行，不分批
- **`rule.vectorization.unified-standard-001`** — 统一使用智谱向量化标准 - 禁止TF-IDF，强制使用智谱Embedding API(1024维)
- **`rule.visual-output-style-001`** — 所有工程图（架构图、集成映射图、数据流图等）必须：1.浅色背景（白色或浅灰）2.中文标注（不接受纯英文）3.颜色柔和不刺眼。用户原话：'颜色轻一些，不要纯英文，...
- **`rule.zhipu-capability-router-001`** — 智谱能力自动路由 - 根据输入模态自动选择模型