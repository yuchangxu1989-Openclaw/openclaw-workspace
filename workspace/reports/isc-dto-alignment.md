# ISC-DTO 对齐报告

**生成时间**: 2026-03-05 01:46

## 摘要

| 指标 | 数量 |
|------|------|
| ISC规则总数 | 86 |
| DTO订阅总数 | 82 |
| 已对齐（双向完整） | 26 |
| **修复：补充trigger** | **47** |
| **修复：新增DTO订阅** | **13** |
| 无匹配规则的订阅 | 9 |

## 修复详情

### 1. 补充trigger的规则 (47条)

- `rule.skill-quality-001` ← 订阅 `isc-rule-skill-quality-001.json`
- `rule_2f7dd6e4` ← 订阅 `isc-rule_2f7dd6e4.json`
- `rule.aeo-evaluation-set-registry-001` ← 订阅 `isc-rule-aeo-evaluation-set-registry-001.json`
- `rule.seef-subskill-orchestration-001` ← 订阅 `isc-rule-seef-subskill-orchestration-001.json`
- `rule.isc-skill-usage-protocol-001` ← 订阅 `isc-rule-isc-skill-usage-protocol-001.json`
- `isc-rule-timeout-retry` ← 订阅 `isc-isc-rule-timeout-retry.json`
- `R013` ← 订阅 `isc-R013.json`
- `isc-skill-permission-classification-031` ← 订阅 `isc-isc-skill-permission-classification-031.json`
- `rule.github-api-skill-001` ← 订阅 `isc-rule-github-api-skill-001.json`
- `isc-naming-gene-files` ← 订阅 `isc-isc-naming-gene-files.json`
- `rule.auto-skillization-trigger-001` ← 订阅 `isc-rule-auto-skillization-trigger-001.json`
- `rule.auto-vectorization-trigger-001` ← 订阅 `isc-rule-auto-vectorization-trigger-001.json`
- `rule.skill-mandatory-skill-md-001` ← 订阅 `isc-rule-skill-mandatory-skill-md-001.json`
- `isc-naming-constants` ← 订阅 `isc-isc-naming-constants.json`
- `evomap_sync` ← 订阅 `isc-evomap_sync.json`
- `rule.http-skills-suite-001` ← 订阅 `isc-rule-http-skills-suite-001.json`
- `rule.isc-standard-format-001` ← 订阅 `isc-rule-isc-standard-format-001.json`
- `R006` ← 订阅 `isc-R006.json`
- `rule.vectorization.knowledge-auto-001` ← 订阅 `isc-rule-vectorization-knowledge-auto-001.json`
- `rule.multi-agent-communication-priority-001` ← 订阅 `isc-rule-multi-agent-communication-priority-001.json`
- `skill_md_quality` ← 订阅 `isc-skill_md_quality.json`
- `isc-naming-skill-dir` ← 订阅 `isc-isc-naming-skill-dir.json`
- `N006` ← 订阅 `isc-N006.json`
- `S005` ← 订阅 `isc-S005.json`
- `rule.zhipu-capability-router-001` ← 订阅 `isc-rule-zhipu-capability-router-001.json`
- `rule.pipeline-report-filter-001` ← 订阅 `isc-rule-pipeline-report-filter-001.json`
- `rule.isc-creation-gate-001` ← 订阅 `isc-rule-isc-creation-gate-001.json`
- `rule.isc-naming-convention-001` ← 订阅 `isc-rule-isc-naming-convention-001.json`
- `rule.vectorization.skill-cleanup-003` ← 订阅 `isc-rule-vectorization-skill-cleanup-003.json`
- `rule.vectorization.aeo-auto-001` ← 订阅 `isc-rule-vectorization-aeo-auto-001.json`
- `rule.cron-task-model-selection-002` ← 订阅 `isc-rule-cron-task-model-selection-002.json`
- `rule.vectorization.skill-auto-001` ← 订阅 `isc-rule-vectorization-skill-auto-001.json`
- `readme_quality` ← 订阅 `isc-readme_quality.json`
- `rule.auto-readme-generation-trigger-001` ← 订阅 `isc-rule-auto-readme-generation-trigger-001.json`
- `isc-rule-missing-resource` ← 订阅 `isc-isc-rule-missing-resource.json`
- `rule.dual-channel-message-guarantee-001` ← 订阅 `isc-rule-dual-channel-message-guarantee-001.json`
- `rule.isc-change-auto-trigger-alignment-001` ← 订阅 `isc-rule-isc-change-auto-trigger-alignment-001.json`
- `rule.vectorization.memory-auto-001` ← 订阅 `isc-vectorization.json`
- `planning.time-granularity-037` ← 订阅 `isc-planning-time-granularity-037.json`
- `ISC-SKILL-QUALITY-001` ← 订阅 `isc-ISC-SKILL-QUALITY-001.json`
- `isc-detect-repeated-error` ← 订阅 `isc-isc-detect-repeated-error.json`
- `R014` ← 订阅 `isc-R014.json`
- `rule.isc-dto-handshake-001` ← 订阅 `isc-rule-isc-dto-handshake-001.json`
- `rule.vectorization.memory-auto-001` ← 订阅 `isc-rule-vectorization-memory-auto-001.json`
- `rule.auto-fix-high-severity-001` ← 订阅 `isc-rule-auto-fix-high-severity-001.json`
- `rule.vectorization.skill-lifecycle-002` ← 订阅 `isc-rule-vectorization-skill-lifecycle-002.json`
- `rule.vectorization.unified-standard-001` ← 订阅 `isc-rule-vectorization-unified-standard-001.json`

### 2. 新增DTO订阅 (13条)

- `isc-anti-entropy-design-principle-001.json` → 规则 `rule.anti-entropy-design-principle-001`
- `isc-capability-anchor-auto-register-001.json` → 规则 `rule.capability-anchor-auto-register-001`
- `isc-self-correction-to-rule-001.json` → 规则 `rule.self-correction-to-rule-001`
- `isc-meta-enforcement-gate-001.json` → 规则 `rule.meta-enforcement-gate-001`
- `isc-rule-recognition-accuracy-N034.json` → 规则 `rule-recognition-accuracy-N034`
- `isc-architecture-review-pipeline-001.json` → 规则 `rule.architecture-review-pipeline-001`
- `isc-architecture-diagram-visual-output-001.json` → 规则 `rule.architecture-diagram-visual-output-001`
- `isc-interactive-card-context-inference-001.json` → 规则 `rule.interactive-card-context-inference-001`
- `isc-rule-trigger-integrity-N035.json` → 规则 `rule-trigger-integrity-N035`
- `isc-layered-decoupling-architecture-001.json` → 规则 `rule.layered-decoupling-architecture-001`
- `isc-gateway-config-protection-N033.json` → 规则 `gateway-config-protection-N033`
- `isc-visual-output-style-001.json` → 规则 `rule.visual-output-style-001`
- `isc-memory-loss-self-recovery-N036.json` → 规则 `memory-loss-self-recovery-N036`

### 3. 无匹配规则的订阅 (9条, needs_manual_review)

- `vectorization-skill-deleted.json` → 搜索ID `vectorization-skill-deleted` ⚠️ 需人工审查
- `vectorization-skill-updated.json` → 搜索ID `vectorization-skill-updated` ⚠️ 需人工审查
- `vectorization-knowledge-created.json` → 搜索ID `vectorization-knowledge-created` ⚠️ 需人工审查
- `seef-skill-registered.json` → 搜索ID `seef-skill-registered` ⚠️ 需人工审查
- `vectorization-memory-created.json` → 搜索ID `vectorization-memory-created` ⚠️ 需人工审查
- `vectorization-aeo-created.json` → 搜索ID `vectorization-aeo-created` ⚠️ 需人工审查
- `vectorization-skill-created.json` → 搜索ID `vectorization-skill-created` ⚠️ 需人工审查
- `vectorization-skill-fixed.json` → 搜索ID `vectorization-skill-fixed` ⚠️ 需人工审查
- `vectorization-skill-merged.json` → 搜索ID `vectorization-skill-merged` ⚠️ 需人工审查

---
*自动生成，由ISC-DTO对齐子代理执行*
