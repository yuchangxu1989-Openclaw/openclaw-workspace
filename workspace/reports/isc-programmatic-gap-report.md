# ISC规则程序化缺口分析报告

## 统计总览
- 总规则数：156
- A类（已程序化）：31
- B类（可且应程序化）：48
- C类（需设计后程序化）：21
- D类（不适合程序化）：56

## B类详细清单
| 规则ID | 规则名 | 建议程序化方式 | 优先级 |
|---|---|---|---|
| rule.auto-github-sync-trigger-001 | auto_github_sync | git hook（pre-commit/post-commit） | P0 |
| rule.git-commit-dispatch-001 | - | git hook（pre-commit/post-commit） | P0 |
| rule.intent-ic4-ic5-boundary-001.json | IC4/IC5意图边界判定规则 | git hook（pre-commit/post-commit） | P0 |
| rule.intent-post-commit-quality-gate-h8z2sz | intent_post-commit-quality-gate | git hook（pre-commit/post-commit） | P0 |
| rule.isc-skill-permission-classification-031 | 技能权限分级体系 | git hook（pre-commit/post-commit） | P0 |
| rule.memory-digest-must-verify-001 | - | git hook（pre-commit/post-commit） | P0 |
| rule.self-correction-to-rule-001 | 缺陷根因分析与修复 | git hook（pre-commit/post-commit） | P0 |
| skill.evolution.auto-trigger | 技能进化自动触发 | git hook（pre-commit/post-commit） | P0 |
| N007-v2 | source_file_delivery_method | 事件监听（completion事件等） | P1 |
| dispatch-auto-report-001 | 批量派发后自动汇报 | 事件监听（completion事件等） | P1 |
| rule.architecture-diagram-visual-output-001 | - | 事件监听（completion事件等） | P1 |
| rule.cras-dual-channel-001 | - | 事件监听（completion事件等） | P1 |
| rule.detection-report-feishu-card-001 | report_feishu_card_format | 事件监听（completion事件等） | P1 |
| rule.intent-pdf输出标准-fyhznt | intent_pdf输出标准 | 事件监听（completion事件等） | P1 |
| rule.isc-creation-gate-001 | isc_creation_validation_gate | 事件监听（completion事件等） | P1 |
| rule.n020-auto-universal-root-cause-analysis-020 | universal_root_cause_and_gap_analysis | 事件监听（completion事件等） | P1 |
| rule.n022-detection-architecture-design-isc-compliance-audit-022 | architecture_design_isc_compliance_audit | 事件监听（completion事件等） | P1 |
| rule.n033-gateway-config-protection | - | 事件监听（completion事件等） | P1 |
| rule.n036-memory-loss-recovery | memory_loss_self_recovery | startup自检 | P1 |
| rule.skill-distribution-auto-classify-001 | 技能本地/可销售自动分类 | 事件监听（completion事件等） | P1 |
| rule.sprint-closure-acceptance-001.json | Sprint收工验收门禁 | 事件监听（completion事件等） | P1 |
| rule.task-orchestration-quality-001.json | - | startup自检 | P1 |
| rule.threshold-alert-routing-001 | - | 事件监听（completion事件等） | P1 |
| rule.tracker-sync-gate-001.json | PROJECT-TRACKER 同步门禁 | startup自检 | P1 |
| rule.vectorization-auto-trigger-001 | resource_lifecycle_auto_vectorization | 事件监听（completion事件等） | P1 |
| rule.visual-output-style-001 | - | 事件监听（completion事件等） | P1 |
| ISC-MAIN-AGENT-DELEGATION-001 | 主Agent委派铁律 | 定时扫描cron | P2 |
| ISC-SKILL-QUALITY-001 | skill_no_placeholder | 定时扫描cron | P2 |
| isc-skill-distribution-separation-001 | 技能内部/外销分发分离 | 定时扫描cron | P2 |
| rule.cron-task-model-requirement-001 | cron_task_model_requirement | 定时扫描cron | P2 |
| rule.design-document-delivery-pipeline-001 | design_document_delivery_pipeline | 定时扫描cron | P2 |
| rule.isc-evomap-mandatory-security-scan-032 | EvoMap同步清单强制安全扫描 | 定时扫描cron | P2 |
| rule.isc-rule-creation-dedup-gate-001 | - | 定时扫描cron | P2 |
| rule.isc-skill-security-gate-030 | 技能安全准出标准 | 定时扫描cron | P2 |
| rule.isc-standard-format-001 | isc_standard_file_format | 定时扫描cron | P2 |
| rule.n034-rule-identity-accuracy | rule_identity_accuracy_validation | 定时扫描cron | P2 |
| rule.n035-rule-trigger-completeness | rule_trigger_completeness_monitor | 定时扫描cron | P2 |
| rule.project-mgmt-lesson-capture-001.json | 项目管理经验沉淀门禁 | 定时扫描cron | P2 |
| rule.report-readability-001 | ISC-REPORT-READABILITY-001 | 定时扫描cron | P2 |
| rule.subagent-report-queue-001.json | - | 定时扫描cron | P2 |
| rule.vectorization-standard-enforcement-001 | unified_vectorization_standard_enforcement | 定时扫描cron | P2 |
| N006 | skill_name_bilingual_display | 其他 | P3 |
| rule.auto-collect-eval-from-conversation-001 | - | 其他 | P3 |
| rule.design-document-structure-001 | design_document_structure_standard | 其他 | P3 |
| rule.interactive-card-context-inference-001 | - | 其他 | P3 |
| rule.n017-detection-cras-recurring-pattern-auto-resolve-017 | cras_recurring_pattern_auto_resolve | 其他 | P3 |
| rule.n025-aeo-feedback-auto-collection-025 | aeo_feedback_auto_collection | 其他 | P3 |
| rule.subagent-checkpoint-gate-001 | - | 其他 | P3 |

## C类清单
- ISC-DOC-QUALITY-GATE-001｜重大文档双Agent质量门禁：需要先定义可观测信号、状态机与判定阈值，再落地自动化检查/执行。
- ISC-FILE-SEND-INTENT-001｜发文件意图自动匹配：需要先定义可观测信号、状态机与判定阈值，再落地自动化检查/执行。
- rule.design-document-narrative-review-001｜design_document_narrative_review：需要先定义可观测信号、状态机与判定阈值，再落地自动化检查/执行。
- rule.discovery-must-trigger-rule-creation-001｜发现问题必须同步创建规则：需要先定义可观测信号、状态机与判定阈值，再落地自动化检查/执行。
- rule.eval-driven-development-loop-001｜eval_driven_development_loop：需要先定义可观测信号、状态机与判定阈值，再落地自动化检查/执行。
- rule.eval-must-include-multi-turn-001｜评测集必须包含多轮对话：需要先定义可观测信号、状态机与判定阈值，再落地自动化检查/执行。
- rule.evalset-cron-daily-generation-001｜-：需要先定义可观测信号、状态机与判定阈值，再落地自动化检查/执行。
- rule.intent-agent-orchestration-design-standard-p3nxat｜intent_agent-orchestration-design-standard：需要先定义可观测信号、状态机与判定阈值，再落地自动化检查/执行。
- rule.intent-mece命名原则-86o70p｜intent_mece命名原则：需要先定义可观测信号、状态机与判定阈值，再落地自动化检查/执行。
- rule.intent-type-convergence-001｜-：需要先定义可观测信号、状态机与判定阈值，再落地自动化检查/执行。
- rule.intent-unknown-discovery-001｜-：需要先定义可观测信号、状态机与判定阈值，再落地自动化检查/执行。
- rule.intent-任务分配策略-jrw5uo｜intent_任务分配策略：需要先定义可观测信号、状态机与判定阈值，再落地自动化检查/执行。
- rule.layered-decoupling-architecture-001｜-：需要先定义可观测信号、状态机与判定阈值，再落地自动化检查/执行。
- rule.caijuedian-tribunal-001｜裁决殿：需要先定义可观测信号、状态机与判定阈值，再落地自动化检查/执行。
- rule.n026-aeo-insight-to-action-026｜aeo_insight_to_action：需要先定义可观测信号、状态机与判定阈值，再落地自动化检查/执行。
- rule.naming-mece-consistency-001｜naming_mece_consistency_check：需要先定义可观测信号、状态机与判定阈值，再落地自动化检查/执行。
- rule.parallel-subagent-orchestration-001｜parallel_subagent_orchestration：需要先定义可观测信号、状态机与判定阈值，再落地自动化检查/执行。
- rule.pipeline-benchmark-design-document-alignment-001｜pipeline_benchmark_design_document_alignment：需要先定义可观测信号、状态机与判定阈值，再落地自动化检查/执行。
- rule.pipeline-benchmark-design-document-layered-001｜pipeline_benchmark_design_document_layered：需要先定义可观测信号、状态机与判定阈值，再落地自动化检查/执行。
- rule.quality-over-efficiency-over-cost-001.json｜-：需要先定义可观测信号、状态机与判定阈值，再落地自动化检查/执行。
- rule.skill-no-direct-llm-call-001｜技能禁止直接调用LLM API：需要先定义可观测信号、状态机与判定阈值，再落地自动化检查/执行。

## D类清单
- ISC-AUTO-QA-001｜开发产出自动质量核查：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- ISC-COMPLETION-HANDLER-001｜Completion Event程序化处理：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- ISC-SPAWN-TASKBOARD-HOOK-001｜Spawn必须登记TaskBoard：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- intent-directive-dispatch-001｜Intent Directive → 本地任务编排 Task Dispatch：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- intent-reflect-dispatch-001｜Intent Reflect → CRAS Analysis Dispatch：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- intent-ruleify-dispatch-001｜Intent Ruleify → ISC Rule Draft Dispatch：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.aeo-e2e-decision-pipeline-test-001｜全局决策流水线端到端AEO测试门禁：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.auto-correction-规则存在但handler缺失-mmgbaua1｜自动纠偏: 规则存在但handler缺失：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.auto-evomap-sync-trigger-001｜auto_evomap_sync：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.auto-fix-high-severity-001｜auto_fix_high_severity：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.auto-skillization-trigger-001｜auto_skillization：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.capability-anchor-lifecycle-sync-001｜技能生命周期能力锚点同步：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.coding-quality-thinking-001｜-：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.day2-gap1-cron-event-bridge｜cron_event_bridge_dispatch：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.eval-data-source-redline-001｜-：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.failure-pattern-alert-001｜故障模式告警：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.five-layer-event-model-001｜-：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.glm-vision-priority-001｜glm_vision_priority：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.intent-aeo-quality-gate-001｜-：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.intent-anti-entropy-001｜-：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.intent-cras-e系统架构与交付约束-21ztnb｜intent_cras-e系统架构与交付约束：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.intent-day2-gap2-dispatcher-intent-route-validation-t84891｜intent_day2-gap2-dispatcher-intent-route-validation：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.intent-directive-consumption-001｜-：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.intent-dispatchengine-api-usage-gvhcmy｜intent_dispatchengine-api-usage：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.intent-doc-quality-gate-001质量门禁规则-wrsequ｜intent_doc-quality-gate-001质量门禁规则：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.intent-isc-main-agent-delegation-001委派守卫-vczzrl｜intent_isc-main-agent-delegation-001委派守卫：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.intent-p0-regression-tracking-qmsnw4｜intent_p0-regression-tracking：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.intent-reflect-consumption-001｜-：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.intent-ruleify-consumption-001｜-：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.intent-任务调度机制-yuiao8｜intent_任务调度机制：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.intent-会话记忆机制-f2lei｜intent_会话记忆机制：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.intent-规则命名规范与去重技能-pop4vq｜intent_规则命名规范与去重技能：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.isc-lto-handshake-001｜isc_dto_periodic_handshake：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.isc-rule-auto-decompose-001｜isc_rule_auto_decompose：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.isc-rule-modified-dedup-scan-001｜规则修改去重扫描：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.isc-skill-index-auto-update-001｜isc_skill_index_auto_update：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.must-verify-config-before-coding-001｜编码前必须查配置：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.n016-decision-auto-repair-loop-post-pipeline-016｜auto_repair_loop_post_pipeline：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.n023-auto-aeo-evaluation-standard-generation-023｜aeo_auto_evaluation_standard_generation：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.n024-aeo-dual-track-orchestration-024｜aeo_dual_track_orchestration：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.n029-model-api-key-pool-management-029｜model_api_key_pool_management：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.pipeline-benchmark-analysis-requested-001｜pipeline_benchmark_analysis_requested：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.pipeline-benchmark-defect-acknowledged-001｜pipeline_benchmark_defect_acknowledged：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.pipeline-benchmark-evomap-security-scan-001｜pipeline_benchmark_evomap_security_scan：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.pipeline-benchmark-skill-created-alignment-001｜pipeline_benchmark_skill_created_alignment：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.pipeline-benchmark-skill-publish-security-gate-001｜pipeline_benchmark_skill_publish_security_gate：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.pipeline-benchmark-workflow-requested-001｜pipeline_benchmark_workflow_requested：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.project-artifact-gate-001.json｜项目产物沉淀门禁：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.report-snapshot-lock-001｜评测报告快照锁定：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.scenario-acceptance-gate-001｜-：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.seef-skill-registered-001｜seef_skill_registered：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.seef-subskill-orchestration-001｜seef_subskill_dto_orchestration：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.semantic-intent-event-001｜-：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.umr-domain-routing-001｜user_message_domain_routing：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.umr-intent-routing-001｜user_message_intent_routing：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。
- rule.zhipu-capability-router-001｜zhipu_capability_auto_router：偏思维模型/设计原则/认知约束，缺少稳定输入输出与可验证机器判据。