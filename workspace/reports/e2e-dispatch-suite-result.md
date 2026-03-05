# E2E Event Dispatch Suite Report

**生成时间**: 2026-03-05T18:31:01.599Z
**总耗时**: 82ms
**通过率**: 100.0% (12/12)

## 概览

| 指标 | 值 |
|------|----|
| 总Case数 | 12 |
| 通过 | 12 |
| 失败 | 0 |
| 通过率 | 100.0% |

## 详细结果

### ✅ e2e-001: 技能创建-版本合理-通过

- **状态**: PASS
- **耗时**: 6ms
- **规则匹配**: ✓ (rule.arch-gate-before-action-001, rule.capability-anchor-lifecycle-sync-001, rule.lingxiaoge-is-generic-skill-001, rule.skill-distribution-auto-classify-001, rule.skill-must-use-llm-context-001, rule.skill-no-direct-llm-call-001, rule.version-integrity-gate-001)
- **Handler调用**: ✓ (auto_trigger, enforcement-engine, log-action, log_only, capability-anchor-sync, log-action, log-action, classify-skill-distribution, log-action, log_only, document-structure-check, log-action, log_only, check-version-integrity, log-action)
- **结果匹配**: ✓ (实际: pass)

### ✅ e2e-002: 技能创建-版本虚标-拦截

- **状态**: PASS
- **耗时**: 4ms
- **规则匹配**: ✓ (rule.arch-gate-before-action-001, rule.capability-anchor-lifecycle-sync-001, rule.lingxiaoge-is-generic-skill-001, rule.skill-distribution-auto-classify-001, rule.skill-must-use-llm-context-001, rule.skill-no-direct-llm-call-001, rule.version-integrity-gate-001)
- **Handler调用**: ✓ (auto_trigger, enforcement-engine, log-action, log_only, capability-anchor-sync, log-action, log-action, classify-skill-distribution, log-action, log_only, document-structure-check, log-action, log_only, check-version-integrity, log-action)
- **结果匹配**: ✓ (实际: block)

### ✅ e2e-003: 技能修改-能力锚点同步

- **状态**: PASS
- **耗时**: 2ms
- **规则匹配**: ✓ (rule.capability-anchor-lifecycle-sync-001, rule.skill-distribution-auto-classify-001, rule.skill-must-use-llm-context-001, rule.skill-no-direct-llm-call-001, rule.version-integrity-gate-001)
- **Handler调用**: ✓ (log_only, capability-anchor-sync, log-action, classify-skill-distribution, log-action, log_only, document-structure-check, log-action, log_only, check-version-integrity, log-action)
- **结果匹配**: ✓ (实际: [object Object])

### ✅ e2e-004: ISC规则创建-命名错误-不通过

- **状态**: PASS
- **耗时**: 3ms
- **规则匹配**: ✓ (rule.anti-entropy-design-principle-001, rule.arch-gate-before-action-001, rule.arch-rule-equals-code-002, rule.isc-naming-convention-001, rule.isc-rule-auto-decompose-001, rule.layered-decoupling-architecture-001, rule.layered-end-to-end-principle-001, rule.n034-rule-identity-accuracy, rule.n035-rule-trigger-completeness, rule.naming-mece-consistency-001)
- **Handler调用**: ✓ (gate_check, quality_gate, anti-entropy-check, log-action, auto_trigger, enforcement-engine, log-action, auto_trigger, enforcement-audit, log-action, log, naming-convention-check, log-action, log-action, gate_check, block_on_fail, log-action, gate_check, auto_sync, log-action, auto_trigger, completeness-check, log-action, naming-convention-check, log-action)
- **结果匹配**: ✓ (实际: block)

### ✅ e2e-005: ISC规则创建-命名正确-通过

- **状态**: PASS
- **耗时**: 3ms
- **规则匹配**: ✓ (rule.anti-entropy-design-principle-001, rule.arch-gate-before-action-001, rule.arch-rule-equals-code-002, rule.isc-naming-convention-001, rule.isc-rule-auto-decompose-001, rule.layered-decoupling-architecture-001, rule.layered-end-to-end-principle-001, rule.n034-rule-identity-accuracy, rule.n035-rule-trigger-completeness, rule.naming-mece-consistency-001)
- **Handler调用**: ✓ (gate_check, quality_gate, anti-entropy-check, log-action, auto_trigger, enforcement-engine, log-action, auto_trigger, enforcement-audit, log-action, log, naming-convention-check, log-action, log-action, gate_check, block_on_fail, log-action, gate_check, auto_sync, log-action, auto_trigger, completeness-check, log-action, naming-convention-check, log-action)
- **结果匹配**: ✓ (实际: pass)

### ✅ e2e-006: 基础设施修改-依赖方向违规-拦截

- **状态**: PASS
- **耗时**: 1ms
- **规则匹配**: ✓ (rule.dependency-direction-check-001)
- **Handler调用**: ✓ (log_only, check-dependency-direction, log-action)
- **结果匹配**: ✓ (实际: block)

### ✅ e2e-007: 设计文档创建-结构合格-通过

- **状态**: PASS
- **耗时**: 1ms
- **规则匹配**: ✓ (rule.design-document-structure-001)
- **Handler调用**: ✓ (document-structure-check, log-action)
- **结果匹配**: ✓ (实际: pass)

### ✅ e2e-008: 技能创建-分类检测-local

- **状态**: PASS
- **耗时**: 3ms
- **规则匹配**: ✓ (rule.arch-gate-before-action-001, rule.capability-anchor-lifecycle-sync-001, rule.lingxiaoge-is-generic-skill-001, rule.skill-distribution-auto-classify-001, rule.skill-must-use-llm-context-001, rule.skill-no-direct-llm-call-001, rule.version-integrity-gate-001)
- **Handler调用**: ✓ (auto_trigger, enforcement-engine, log-action, log_only, capability-anchor-sync, log-action, log-action, classify-skill-distribution, log-action, log_only, document-structure-check, log-action, log_only, check-version-integrity, log-action)
- **结果匹配**: ✓ (实际: local)

### ✅ e2e-009: 技能修改-版本跳级-拦截

- **状态**: PASS
- **耗时**: 2ms
- **规则匹配**: ✓ (rule.capability-anchor-lifecycle-sync-001, rule.skill-distribution-auto-classify-001, rule.skill-must-use-llm-context-001, rule.skill-no-direct-llm-call-001, rule.version-integrity-gate-001)
- **Handler调用**: ✓ (log_only, capability-anchor-sync, log-action, classify-skill-distribution, log-action, log_only, document-structure-check, log-action, log_only, check-version-integrity, log-action)
- **结果匹配**: ✓ (实际: block)

### ✅ e2e-010: ISC规则修改-去重扫描触发

- **状态**: PASS
- **耗时**: 1ms
- **规则匹配**: ✓ (rule.isc-naming-convention-001, rule.isc-rule-modified-dedup-scan-001)
- **Handler调用**: ✓ (log, naming-convention-check, log-action, log_only, dedup-scan, log-action)
- **结果匹配**: ✓ (实际: scanned)

### ✅ e2e-011: 评测完成-报告快照锁定

- **状态**: PASS
- **耗时**: 1ms
- **规则匹配**: ✓ (rule.report-snapshot-lock-001)
- **Handler调用**: ✓ (log_only, report-snapshot, log-action)
- **结果匹配**: ✓ (实际: snapshot_locked)

### ✅ e2e-012: 故障模式检测-告警通知

- **状态**: PASS
- **耗时**: 1ms
- **规则匹配**: ✓ (rule.failure-pattern-alert-001)
- **Handler调用**: ✓ (log_only, notify-alert, log-action)
- **结果匹配**: ✓ (实际: Alert written: Rule rule.failure-pattern-alert-001 triggered by system.failure.pattern_detected)

