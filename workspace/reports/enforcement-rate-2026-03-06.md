# ISC Enforcement Rate Report - 2026-03-06

## Summary

| Metric | Value |
|--------|-------|
| Total rules | 118 |
| Enforced (handler exists & runnable) | 36 |
| Not enforced | 82 |
| **Enforcement rate** | **30.5%** |
| Target | ≥20% |
| Status | ✅ ACHIEVED |

## Enforced Rules (36)

| # | Rule ID | Handler |
|---|---------|---------|
| 1 | `rule.anti-entropy-design-principle-001` | `handlers/anti-entropy-check.js` |
| 2 | `rule.arch-real-data-gate-005` | `handlers/eval-quality-check.js` |
| 3 | `rule.auto-collect-eval-from-conversation-001` | `handlers/eval-quality-check.js` |
| 4 | `rule.auto-readme-generation-trigger-001` | `handlers/document-structure-check.js` |
| 5 | `rule.coding-quality-thinking-001` | `handlers/eval-quality-check.js` |
| 6 | `rule.design-document-delivery-pipeline-001` | `handlers/document-structure-check.js` |
| 7 | `rule.design-document-narrative-review-001` | `handlers/document-structure-check.js` |
| 8 | `rule.design-document-structure-001` | `handlers/document-structure-check.js` |
| 9 | `rule.eval-data-source-redline-001` | `handlers/eval-quality-check.js` |
| 10 | `rule.eval-driven-development-loop-001` | `handlers/eval-quality-check.js` |
| 11 | `rule.eval-must-include-multi-turn-001` | `handlers/eval-quality-check.js` |
| 12 | `rule.eval-sample-auto-collection-001` | `handlers/eval-quality-check.js` |
| 13 | `rule.intent-aeo-quality-gate-001` | `handlers/eval-quality-check.js` |
| 14 | `rule.intent-anti-entropy-001` | `handlers/anti-entropy-check.js` |
| 15 | `rule.isc-evomap-mandatory-security-scan-032` | `handlers/completeness-check.js` |
| 16 | `rule.isc-naming-convention-001` | `handlers/naming-convention-check.js` |
| 17 | `rule.isc-rule-creation-dedup-gate-001` | `scripts/check-rule-dedup.js` |
| 18 | `rule.isc-skill-usage-protocol-001` | `handlers/document-structure-check.js` |
| 19 | `rule.n018-detection-skill-rename-global-alignment-018` | `handlers/naming-convention-check.js` |
| 20 | `rule.n019-auto-skill-md-generation-019` | `handlers/document-structure-check.js` |
| 21 | `rule.n023-auto-aeo-evaluation-standard-generation-023` | `handlers/eval-quality-check.js` |
| 22 | `rule.n024-aeo-dual-track-orchestration-024` | `handlers/eval-quality-check.js` |
| 23 | `rule.n025-aeo-feedback-auto-collection-025` | `handlers/eval-quality-check.js` |
| 24 | `rule.n026-aeo-insight-to-action-026` | `handlers/eval-quality-check.js` |
| 25 | `rule.n035-rule-trigger-completeness` | `handlers/completeness-check.js` |
| 26 | `rule.naming-mece-consistency-001` | `handlers/naming-convention-check.js` |
| 27 | `rule.quality-over-efficiency-over-cost-001.json` | `handlers/eval-quality-check.js` |
| 28 | `ISC-SKILL-QUALITY-001` | `handlers/eval-quality-check.js` |
| 29 | `rule.skill-distribution-auto-classify-001` | `handlers/document-structure-check.js` |
| 30 | `rule.skill-mandatory-skill-md-001` | `handlers/completeness-check.js` |
| 31 | `rule.skill-must-use-llm-context-001` | `handlers/document-structure-check.js` |
| 32 | `rule.task-orchestration-quality-001.json` | `handlers/eval-quality-check.js` |
| 33 | `rule.vectorization-aeo-created-001` | `handlers/eval-quality-check.js` |
| 34 | `rule.vectorization-auto-trigger-001` | `handlers/eval-quality-check.js` |
| 35 | `rule.vectorization.aeo-auto-001` | `handlers/eval-quality-check.js` |
| 36 | `rule.vectorization.skill-auto-001` | `handlers/document-structure-check.js` |

## Not Enforced (82)

<details><summary>Click to expand</summary>

| # | Rule ID |
|---|---------|
| 1 | `rule.arch-feedback-must-close-003` |
| 2 | `rule.arch-gate-before-action-001` |
| 3 | `rule.arch-machine-over-human-004` |
| 4 | `rule.arch-rule-equals-code-002` |
| 5 | `rule.architecture-diagram-visual-output-001` |
| 6 | `rule.architecture-review-pipeline-001` |
| 7 | `rule.auto-evomap-sync-trigger-001` |
| 8 | `rule.auto-fix-high-severity-001` |
| 9 | `rule.auto-github-sync-trigger-001` |
| 10 | `rule.auto-skillization-trigger-001` |
| 11 | `rule.capability-anchor-auto-register-001` |
| 12 | `rule.council-lingxiaoge-trigger-001` |
| 13 | `rule.cras-dual-channel-001` |
| 14 | `rule.cron-task-model-requirement-001` |
| 15 | `R006` |
| 16 | `S005` |
| 17 | `rule.discovery-must-trigger-rule-creation-001` |
| 18 | `rule.five-layer-event-model-001` |
| 19 | `rule.glm-vision-priority-001` |
| 20 | `rule.intent-ic4-ic5-boundary-001.json` |
| 21 | `rule.intent-type-convergence-001` |
| 22 | `rule.intent-unknown-discovery-001` |
| 23 | `N007-v2` |
| 24 | `rule.interactive-card-context-inference-001` |
| 25 | `rule.isc-change-auto-trigger-alignment-001` |
| 26 | `rule.isc-creation-gate-001` |
| 27 | `rule.isc-dto-handshake-001` |
| 28 | `rule.isc-rule-auto-decompose-001` |
| 29 | `rule.isc-skill-index-auto-update-001` |
| 30 | `rule.isc-skill-permission-classification-031` |
| 31 | `rule.isc-skill-security-gate-030` |
| 32 | `rule.isc-standard-format-001` |
| 33 | `rule.knowledge-must-be-executable-001` |
| 34 | `rule.layered-decoupling-architecture-001` |
| 35 | `rule.layered-end-to-end-principle-001` |
| 36 | `rule.lingxiaoge-is-generic-skill-001` |
| 37 | `rule.memory-digest-must-verify-001` |
| 38 | `rule.meta-enforcement-gate-001` |
| 39 | `rule.multi-agent-communication-priority-001` |
| 40 | `rule.must-verify-config-before-coding-001` |
| 41 | `rule.n016-decision-auto-repair-loop-post-pipeline-016` |
| 42 | `rule.n017-detection-cras-recurring-pattern-auto-resolve-017` |
| 43 | `rule.n020-auto-universal-root-cause-analysis-020` |
| 44 | `rule.n022-detection-architecture-design-isc-compliance-audit-022` |
| 45 | `rule.n028-auto-skill-change-vectorization-028` |
| 46 | `rule.n029-model-api-key-pool-management-029` |
| 47 | `rule.n033-gateway-config-protection` |
| 48 | `rule.n034-rule-identity-accuracy` |
| 49 | `rule.n036-memory-loss-recovery` |
| 50 | `N006` |
| 51 | `rule.parallel-analysis-workflow-001` |
| 52 | `rule.parallel-subagent-orchestration-001` |
| 53 | `rule.pipeline-report-filter-001` |
| 54 | `rule.planning-time-granularity-037` |
| 55 | `rule.scenario-acceptance-gate-001` |
| 56 | `rule.seef-skill-registered-001` |
| 57 | `rule.seef-subskill-orchestration-001` |
| 58 | `rule.self-correction-to-rule-001` |
| 59 | `rule.semantic-intent-event-001` |
| 60 | `isc-skill-distribution-separation-001` |
| 61 | `rule.skill-no-direct-llm-call-001` |
| 62 | `skill.evolution.auto-trigger` |
| 63 | `rule.subagent-checkpoint-gate-001` |
| 64 | `rule.trust-code-not-memory-001` |
| 65 | `rule.umr-domain-routing-001` |
| 66 | `rule.umr-intent-routing-001` |
| 67 | `rule.vectorization-knowledge-created-001` |
| 68 | `rule.vectorization-memory-created-001` |
| 69 | `rule.vectorization-skill-created-001` |
| 70 | `rule.vectorization-skill-deleted-001` |
| 71 | `rule.vectorization-skill-fixed-001` |
| 72 | `rule.vectorization-skill-merged-001` |
| 73 | `rule.vectorization-skill-updated-001` |
| 74 | `rule.vectorization-standard-enforcement-001` |
| 75 | `rule.vectorization.knowledge-auto-001` |
| 76 | `rule.vectorization.memory-auto-001` |
| 77 | `rule.vectorization.skill-cleanup-003` |
| 78 | `rule.vectorization.skill-lifecycle-002` |
| 79 | `rule.vectorization.unified-standard-001` |
| 80 | `rule.version-integrity-gate-001` |
| 81 | `rule.visual-output-style-001` |
| 82 | `rule.zhipu-capability-router-001` |

</details>
