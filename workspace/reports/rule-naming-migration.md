# Rule Naming Migration Report

Date: 2026-03-06

## Renamed: 27 files

| Old Filename | New Filename | Old ID | New ID |
|---|---|---|---|
| N034-rule-identity-accuracy.json | rule.n034-rule-identity-accuracy.json | N034 | rule.n034-rule-identity-accuracy |
| N035-rule-trigger-completeness.json | rule.n035-rule-trigger-completeness.json | N035 | rule.n035-rule-trigger-completeness |
| N036-memory-loss-recovery.json | rule.n036-memory-loss-recovery.json | N036 | rule.n036-memory-loss-recovery |
| aeo-dual-track-orchestration-024.json | rule.n024-aeo-dual-track-orchestration-024.json | N024 | rule.n024-aeo-dual-track-orchestration-024 |
| aeo-feedback-auto-collection-025.json | rule.n025-aeo-feedback-auto-collection-025.json | N025 | rule.n025-aeo-feedback-auto-collection-025 |
| aeo-insight-to-action-026.json | rule.n026-aeo-insight-to-action-026.json | N026 | rule.n026-aeo-insight-to-action-026 |
| arch.feedback-must-close-003.json | rule.arch-feedback-must-close-003.json | arch.feedback-must-close-003 | rule.arch-feedback-must-close-003 |
| arch.gate-before-action-001.json | rule.arch-gate-before-action-001.json | arch.gate-before-action-001 | rule.arch-gate-before-action-001 |
| arch.machine-over-human-004.json | rule.arch-machine-over-human-004.json | arch.machine-over-human-004 | rule.arch-machine-over-human-004 |
| arch.real-data-gate-005.json | rule.arch-real-data-gate-005.json | arch.real-data-gate-005 | rule.arch-real-data-gate-005 |
| arch.rule-equals-code-002.json | rule.arch-rule-equals-code-002.json | arch.rule-equals-code-002 | rule.arch-rule-equals-code-002 |
| auto-aeo-evaluation-standard-generation-023.json | rule.n023-auto-aeo-evaluation-standard-generation-023.json | N023 | rule.n023-auto-aeo-evaluation-standard-generation-023 |
| auto-skill-change-vectorization-028.json | rule.n028-auto-skill-change-vectorization-028.json | N028 | rule.n028-auto-skill-change-vectorization-028 |
| auto-skill-md-generation-019.json | rule.n019-auto-skill-md-generation-019.json | N019 | rule.n019-auto-skill-md-generation-019 |
| auto-universal-root-cause-analysis-020.json | rule.n020-auto-universal-root-cause-analysis-020.json | N020 | rule.n020-auto-universal-root-cause-analysis-020 |
| decision-auto-repair-loop-post-pipeline-016.json | rule.n016-decision-auto-repair-loop-post-pipeline-016.json | N016 | rule.n016-decision-auto-repair-loop-post-pipeline-016 |
| detection-architecture-design-isc-compliance-audit-022.json | rule.n022-detection-architecture-design-isc-compliance-audit-022.json | N022 | rule.n022-detection-architecture-design-isc-compliance-audit-022 |
| detection-cras-recurring-pattern-auto-resolve-017.json | rule.n017-detection-cras-recurring-pattern-auto-resolve-017.json | N017 | rule.n017-detection-cras-recurring-pattern-auto-resolve-017 |
| detection-skill-rename-global-alignment-018.json | rule.n018-detection-skill-rename-global-alignment-018.json | N018 | rule.n018-detection-skill-rename-global-alignment-018 |
| evomap-mandatory-security-scan-032.json | rule.isc-evomap-mandatory-security-scan-032.json | isc-evomap-mandatory-security-scan-032 | rule.isc-evomap-mandatory-security-scan-032 |
| gateway-config-protection-N033.json | rule.n033-gateway-config-protection.json | NO_ID | rule.n033-gateway-config-protection |
| model-api-key-pool-management-029.json | rule.n029-model-api-key-pool-management-029.json | N029 | rule.n029-model-api-key-pool-management-029 |
| planning.time-granularity-037.json | rule.planning-time-granularity-037.json | planning.time-granularity-037 | rule.planning-time-granularity-037 |
| rule-bundle-intent-system-001.json | SPLIT into 4 files |  |  |
| skill-permission-classification-031.json | rule.isc-skill-permission-classification-031.json | isc-skill-permission-classification-031 | rule.isc-skill-permission-classification-031 |
| skill-security-gate-030.json | rule.isc-skill-security-gate-030.json | isc-skill-security-gate-030 | rule.isc-skill-security-gate-030 |
| user-message-domain-routing-001.json | rule.umr-domain-routing-001.json | UMR002 | rule.umr-domain-routing-001 |
| user-message-intent-routing-001.json | rule.umr-intent-routing-001.json | UMR001 | rule.umr-intent-routing-001 |

## Bundle Split

rule-bundle-intent-system-001.json → 4 individual files:

- rule.intent-type-convergence-001.json (id: rule.intent-type-convergence-001)
- rule.intent-aeo-quality-gate-001.json (id: rule.intent-aeo-quality-gate-001)
- rule.intent-unknown-discovery-001.json (id: rule.intent-unknown-discovery-001)
- rule.intent-anti-entropy-001.json (id: rule.intent-anti-entropy-001)
