# 黄灯 ISC 规则缺失 Handler 分级报告

范围：`skills/isc-core/rules/rule.*.json`

- 扫描规则总数：105
- 缺失/无效 handler 规则数：105
- 分级统计：P0=70，P1=35，P2=0

## P0

| 规则 | 文件 | 问题 | handler |
|---|---|---|---|
| `ISC-SKILL-QUALITY-001` | `skills/isc-core/rules/rule.quality-skill-no-placeholder-001.json` | missing handler | `-` |
| `N007-v2` | `skills/isc-core/rules/rule.interaction-source-file-delivery-007.json` | missing handler | `-` |
| `isc-skill-distribution-separation-001` | `skills/isc-core/rules/rule.skill-distribution-separation-001.json` | missing handler | `-` |
| `rule.aeo-e2e-decision-pipeline-test-001` | `skills/isc-core/rules/rule.aeo-e2e-decision-pipeline-test-001.json` | missing handler | `-` |
| `rule.anti-entropy-design-principle-001` | `skills/isc-core/rules/rule.anti-entropy-design-principle-001.json` | missing handler | `-` |
| `rule.arch-feedback-must-close-003` | `skills/isc-core/rules/rule.arch-feedback-must-close-003.json` | missing handler | `-` |
| `rule.arch-gate-before-action-001` | `skills/isc-core/rules/rule.arch-gate-before-action-001.json` | missing handler | `-` |
| `rule.arch-machine-over-human-004` | `skills/isc-core/rules/rule.arch-machine-over-human-004.json` | missing handler | `-` |
| `rule.arch-real-data-gate-005` | `skills/isc-core/rules/rule.arch-real-data-gate-005.json` | missing handler | `-` |
| `rule.arch-rule-equals-code-002` | `skills/isc-core/rules/rule.arch-rule-equals-code-002.json` | missing handler | `-` |
| `rule.architecture-diagram-visual-output-001` | `skills/isc-core/rules/rule.architecture-diagram-visual-output-001.json` | missing handler | `-` |
| `rule.architecture-review-pipeline-001` | `skills/isc-core/rules/rule.architecture-review-pipeline-001.json` | missing handler | `-` |
| `rule.capability-anchor-auto-register-001` | `skills/isc-core/rules/rule.capability-anchor-auto-register-001.json` | missing handler | `-` |
| `rule.cras-dual-channel-001` | `skills/isc-core/rules/rule.cras-dual-channel-001.json` | missing handler | `-` |
| `rule.cron-task-model-requirement-001` | `skills/isc-core/rules/rule.cron-task-model-requirement-001.json` | missing handler | `-` |
| `rule.design-document-delivery-pipeline-001` | `skills/isc-core/rules/rule.design-document-delivery-pipeline-001.json` | missing handler | `-` |
| `rule.design-document-narrative-review-001` | `skills/isc-core/rules/rule.design-document-narrative-review-001.json` | missing handler | `-` |
| `rule.discovery-must-trigger-rule-creation-001` | `skills/isc-core/rules/rule.discovery-must-trigger-rule-creation-001.json` | missing handler | `-` |
| `rule.eval-data-source-redline-001` | `skills/isc-core/rules/rule.eval-data-source-redline-001.json` | missing handler | `-` |
| `rule.eval-driven-development-loop-001` | `skills/isc-core/rules/rule.eval-driven-development-loop-001.json` | missing handler | `-` |
| `rule.five-layer-event-model-001` | `skills/isc-core/rules/rule.five-layer-event-model-001.json` | missing handler | `-` |
| `rule.intent-aeo-quality-gate-001` | `skills/isc-core/rules/rule.intent-aeo-quality-gate-001.json` | missing handler | `-` |
| `rule.intent-ic4-ic5-boundary-001.json` | `skills/isc-core/rules/rule.intent-ic4-ic5-boundary-001.json` | missing handler | `-` |
| `rule.interactive-card-context-inference-001` | `skills/isc-core/rules/rule.interactive-card-context-inference-001.json` | missing handler | `-` |
| `rule.isc-creation-gate-001` | `skills/isc-core/rules/rule.isc-creation-gate-001.json` | missing handler | `-` |
| `rule.isc-evomap-mandatory-security-scan-032` | `skills/isc-core/rules/rule.isc-evomap-mandatory-security-scan-032.json` | missing handler | `-` |
| `rule.isc-naming-convention-001` | `skills/isc-core/rules/rule.isc-naming-convention-001.json` | missing handler | `-` |
| `rule.isc-rule-creation-dedup-gate-001` | `skills/isc-core/rules/rule.isc-rule-creation-dedup-gate-001.json` | missing handler | `-` |
| `rule.isc-skill-permission-classification-031` | `skills/isc-core/rules/rule.isc-skill-permission-classification-031.json` | missing handler | `-` |
| `rule.isc-skill-security-gate-030` | `skills/isc-core/rules/rule.isc-skill-security-gate-030.json` | missing handler | `-` |
| `rule.isc-skill-usage-protocol-001` | `skills/isc-core/rules/rule.isc-skill-usage-protocol-001.json` | missing handler | `-` |
| `rule.isc-standard-format-001` | `skills/isc-core/rules/rule.isc-standard-format-001.json` | missing handler | `-` |
| `rule.layered-decoupling-architecture-001` | `skills/isc-core/rules/rule.layered-decoupling-architecture-001.json` | missing handler | `-` |
| `rule.caijuedian-tribunal-001` | `skills/isc-core/rules/rule.caijuedian-tribunal-001.json` | missing handler | `-` |
| `rule.meta-enforcement-gate-001` | `skills/isc-core/rules/rule.meta-enforcement-gate-001.json` | missing handler | `-` |
| `rule.multi-agent-communication-priority-001` | `skills/isc-core/rules/rule.multi-agent-communication-priority-001.json` | missing handler | `-` |
| `rule.n016-decision-auto-repair-loop-post-pipeline-016` | `skills/isc-core/rules/rule.n016-decision-auto-repair-loop-post-pipeline-016.json` | missing handler | `-` |
| `rule.n017-detection-cras-recurring-pattern-auto-resolve-017` | `skills/isc-core/rules/rule.n017-detection-cras-recurring-pattern-auto-resolve-017.json` | missing handler | `-` |
| `rule.n018-detection-skill-rename-global-alignment-018` | `skills/isc-core/rules/rule.n018-detection-skill-rename-global-alignment-018.json` | missing handler | `-` |
| `rule.n019-auto-skill-md-generation-019` | `skills/isc-core/rules/rule.n019-auto-skill-md-generation-019.json` | missing handler | `-` |
| `rule.n020-auto-universal-root-cause-analysis-020` | `skills/isc-core/rules/rule.n020-auto-universal-root-cause-analysis-020.json` | missing handler | `-` |
| `rule.n022-detection-architecture-design-isc-compliance-audit-022` | `skills/isc-core/rules/rule.n022-detection-architecture-design-isc-compliance-audit-022.json` | missing handler | `-` |
| `rule.n023-auto-aeo-evaluation-standard-generation-023` | `skills/isc-core/rules/rule.n023-auto-aeo-evaluation-standard-generation-023.json` | missing handler | `-` |
| `rule.n024-aeo-dual-track-orchestration-024` | `skills/isc-core/rules/rule.n024-aeo-dual-track-orchestration-024.json` | missing handler | `-` |
| `rule.n026-aeo-insight-to-action-026` | `skills/isc-core/rules/rule.n026-aeo-insight-to-action-026.json` | missing handler | `-` |
| `rule.n029-model-api-key-pool-management-029` | `skills/isc-core/rules/rule.n029-model-api-key-pool-management-029.json` | missing handler | `-` |
| `rule.n033-gateway-config-protection` | `skills/isc-core/rules/rule.n033-gateway-config-protection.json` | missing handler | `-` |
| `rule.n034-rule-identity-accuracy` | `skills/isc-core/rules/rule.n034-rule-identity-accuracy.json` | missing handler | `-` |
| `rule.n036-memory-loss-recovery` | `skills/isc-core/rules/rule.n036-memory-loss-recovery.json` | missing handler | `-` |
| `rule.naming-mece-consistency-001` | `skills/isc-core/rules/rule.naming-mece-consistency-001.json` | missing handler | `-` |
| `rule.parallel-subagent-orchestration-001` | `skills/isc-core/rules/rule.parallel-subagent-orchestration-001.json` | missing handler | `-` |
| `rule.planning-time-granularity-037` | `skills/isc-core/rules/rule.planning-time-granularity-037.json` | missing handler | `-` |
| `rule.project-mgmt-lesson-capture-001.json` | `skills/isc-core/rules/rule.project-mgmt-lesson-capture-001.json` | missing handler | `-` |
| `rule.project-mgmt-startup-checklist-001.json` | `skills/isc-core/rules/rule.project-mgmt-startup-checklist-001.json` | missing handler | `-` |
| `rule.public-skill-classification-001` | `skills/isc-core/rules/rule.public-skill-classification-001.json` | missing handler | `-` |
| `rule.public-skill-quality-gate-001` | `skills/isc-core/rules/rule.public-skill-quality-gate-001.json` | missing handler | `-` |
| `rule.quality-over-efficiency-over-cost-001.json` | `skills/isc-core/rules/rule.quality-over-efficiency-over-cost-001.json` | missing handler | `-` |
| `rule.scenario-acceptance-gate-001` | `skills/isc-core/rules/rule.scenario-acceptance-gate-001.json` | missing handler | `-` |
| `rule.self-correction-to-rule-001` | `skills/isc-core/rules/rule.self-correction-to-rule-001.json` | missing handler | `-` |
| `rule.skill-mandatory-skill-md-001` | `skills/isc-core/rules/rule.skill-mandatory-skill-md-001.json` | missing handler | `-` |
| `rule.skill-no-direct-llm-call-001` | `skills/isc-core/rules/rule.skill-no-direct-llm-call-001.json` | missing handler | `-` |
| `rule.subagent-checkpoint-gate-001` | `skills/isc-core/rules/rule.subagent-checkpoint-gate-001.json` | missing handler | `-` |
| `rule.task-orchestration-quality-001.json` | `skills/isc-core/rules/rule.task-orchestration-quality-001.json` | missing handler | `-` |
| `rule.umr-domain-routing-001` | `skills/isc-core/rules/rule.umr-domain-routing-001.json` | missing handler | `-` |
| `rule.umr-intent-routing-001` | `skills/isc-core/rules/rule.umr-intent-routing-001.json` | missing handler | `-` |
| `rule.vectorization-auto-trigger-001` | `skills/isc-core/rules/rule.vectorization-auto-trigger-001.json` | missing handler | `-` |
| `rule.vectorization-standard-enforcement-001` | `skills/isc-core/rules/rule.vectorization-standard-enforcement-001.json` | missing handler | `-` |
| `rule.version-integrity-gate-001` | `skills/isc-core/rules/rule.version-integrity-gate-001.json` | missing handler | `-` |
| `rule.visual-output-style-001` | `skills/isc-core/rules/rule.visual-output-style-001.json` | missing handler | `-` |
| `rule.zhipu-capability-router-001` | `skills/isc-core/rules/rule.zhipu-capability-router-001.json` | missing handler | `-` |

## P1

| 规则 | 文件 | 问题 | handler |
|---|---|---|---|
| `N006` | `skills/isc-core/rules/rule.naming-skill-bilingual-display-006.json` | missing handler | `-` |
| `rule.auto-collect-eval-from-conversation-001` | `skills/isc-core/rules/rule.auto-collect-eval-from-conversation-001.json` | missing handler | `-` |
| `rule.auto-evomap-sync-trigger-001` | `skills/isc-core/rules/rule.auto-evomap-sync-trigger-001.json` | missing handler | `-` |
| `rule.auto-fix-high-severity-001` | `skills/isc-core/rules/rule.auto-fix-high-severity-001.json` | missing handler | `-` |
| `rule.auto-github-sync-trigger-001` | `skills/isc-core/rules/rule.auto-github-sync-trigger-001.json` | missing handler | `-` |
| `rule.auto-skillization-trigger-001` | `skills/isc-core/rules/rule.auto-skillization-trigger-001.json` | missing handler | `-` |
| `rule.capability-anchor-lifecycle-sync-001` | `skills/isc-core/rules/rule.capability-anchor-lifecycle-sync-001.json` | missing handler | `-` |
| `rule.coding-quality-thinking-001` | `skills/isc-core/rules/rule.coding-quality-thinking-001.json` | missing handler | `-` |
| `rule.dependency-direction-check-001` | `skills/isc-core/rules/rule.dependency-direction-check-001.json` | missing handler | `-` |
| `rule.design-document-structure-001` | `skills/isc-core/rules/rule.design-document-structure-001.json` | missing handler | `-` |
| `rule.detection-report-feishu-card-001` | `skills/isc-core/rules/rule.detection-report-feishu-card-001.json` | missing handler | `-` |
| `rule.eval-must-include-multi-turn-001` | `skills/isc-core/rules/rule.eval-must-include-multi-turn-001.json` | missing handler | `-` |
| `rule.eval-sample-auto-collection-001` | `skills/isc-core/rules/rule.eval-sample-auto-collection-001.json` | missing handler | `-` |
| `rule.failure-pattern-alert-001` | `skills/isc-core/rules/rule.failure-pattern-alert-001.json` | missing handler | `-` |
| `rule.glm-vision-priority-001` | `skills/isc-core/rules/rule.glm-vision-priority-001.json` | missing handler | `-` |
| `rule.intent-anti-entropy-001` | `skills/isc-core/rules/rule.intent-anti-entropy-001.json` | missing handler | `-` |
| `rule.intent-type-convergence-001` | `skills/isc-core/rules/rule.intent-type-convergence-001.json` | missing handler | `-` |
| `rule.intent-unknown-discovery-001` | `skills/isc-core/rules/rule.intent-unknown-discovery-001.json` | missing handler | `-` |
| `rule.isc-change-auto-trigger-alignment-001` | `skills/isc-core/rules/rule.isc-change-auto-trigger-alignment-001.json` | missing handler | `-` |
| `rule.isc-lto-handshake-001` | `skills/isc-core/rules/rule.isc-lto-handshake-001.json` | missing handler | `-` |
| `rule.isc-rule-auto-decompose-001` | `skills/isc-core/rules/rule.isc-rule-auto-decompose-001.json` | missing handler | `-` |
| `rule.isc-rule-modified-dedup-scan-001` | `skills/isc-core/rules/rule.isc-rule-modified-dedup-scan-001.json` | missing handler | `-` |
| `rule.isc-skill-index-auto-update-001` | `skills/isc-core/rules/rule.isc-skill-index-auto-update-001.json` | missing handler | `-` |
| `rule.knowledge-must-be-executable-001` | `skills/isc-core/rules/rule.knowledge-must-be-executable-001.json` | missing handler | `-` |
| `rule.memory-digest-must-verify-001` | `skills/isc-core/rules/rule.memory-digest-must-verify-001.json` | missing handler | `-` |
| `rule.must-verify-config-before-coding-001` | `skills/isc-core/rules/rule.must-verify-config-before-coding-001.json` | missing handler | `-` |
| `rule.n025-aeo-feedback-auto-collection-025` | `skills/isc-core/rules/rule.n025-aeo-feedback-auto-collection-025.json` | missing handler | `-` |
| `rule.n035-rule-trigger-completeness` | `skills/isc-core/rules/rule.n035-rule-trigger-completeness.json` | missing handler | `-` |
| `rule.pipeline-report-filter-001` | `skills/isc-core/rules/rule.pipeline-report-filter-001.json` | missing handler | `-` |
| `rule.report-snapshot-lock-001` | `skills/isc-core/rules/rule.report-snapshot-lock-001.json` | missing handler | `-` |
| `rule.seef-skill-registered-001` | `skills/isc-core/rules/rule.seef-skill-registered-001.json` | missing handler | `-` |
| `rule.seef-subskill-orchestration-001` | `skills/isc-core/rules/rule.seef-subskill-orchestration-001.json` | missing handler | `-` |
| `rule.semantic-intent-event-001` | `skills/isc-core/rules/rule.semantic-intent-event-001.json` | missing handler | `-` |
| `rule.skill-distribution-auto-classify-001` | `skills/isc-core/rules/rule.skill-distribution-auto-classify-001.json` | missing handler | `-` |
| `skill.evolution.auto-trigger` | `skills/isc-core/rules/rule.skill.evolution.auto-trigger.json` | missing handler | `-` |

## P2

_无_
