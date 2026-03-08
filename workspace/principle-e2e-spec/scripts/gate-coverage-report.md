# P2E Gate Coverage Report
**Cases file**: /root/.openclaw/workspace-analyst/principle-e2e-spec/05-test-cases.json
**Total cases**: 15
**Total gates**: 25

| Status | Count | % |
|--------|-------|---|
| 🔴 Zero coverage | 8 | 32% |
| ⚠️  Thin (1 case) | 7 | 28% |
| ✅ Adequate (≥2)  | 10 | 40% |

**🚨 HARD Gates with ZERO coverage (2)**: HG-004, HG-006
**⚡ Special Rules with ZERO coverage (2)**: SR-001, SR-003

## Gate Detail Table

| Gate ID | Type | Check | Covered By | Status |
|---------|------|-------|-----------|--------|
| AG-001 | ADVISORY | cras.knowledge_ingestion (=1.0) | p2e-tc-009, p2e-tc-013 | ✅ OK |
| AG-002 | ADVISORY | cras.suggestion_relevance (≥0.70) | p2e-tc-009, p2e-tc-013 | ✅ OK |
| AG-003 | ADVISORY | cras.historical_linking (≥0.60) | p2e-tc-009, p2e-tc-013 | ✅ OK |
| AG-004 | ADVISORY | lep.dto_failure_linkage (≥0.85) | — | 🔴 ZERO |
| AG-005 | ADVISORY | event.priority_ordering (=1.0) | — | 🔴 ZERO |
| HG-001 | HARD | intent.type_classification (≥0.90) | p2e-tc-001, p2e-tc-002, p2e-tc-003, p2e-tc-004, p2e-tc-005, p2e-tc-006, p2e-tc-007, p2e-tc-008, p2e-tc-009, p2e-tc-010, p2e-tc-011, p2e-tc-012, p2e-tc-013, p2e-tc-014, p2e-tc-015 | ✅ OK |
| HG-002 | HARD | isc.draft_generation (=1.0) | p2e-tc-001, p2e-tc-002, p2e-tc-003, p2e-tc-004, p2e-tc-006, p2e-tc-007, p2e-tc-008, p2e-tc-009, p2e-tc-010, p2e-tc-011, p2e-tc-012, p2e-tc-014, p2e-tc-015 | ✅ OK |
| HG-003 | HARD | dto.dag_validity (=1.0) | p2e-tc-001, p2e-tc-002, p2e-tc-003, p2e-tc-004, p2e-tc-013 | ✅ OK |
| HG-004 | HARD | aeo.track_selection (=1.0) | — | 🔴 ZERO |
| HG-005 | HARD | test.functional_pass (=1.0) | p2e-tc-012 | ⚠️ THIN |
| HG-006 | HARD | test.boundary_safety (=1.0) | — | 🔴 ZERO |
| HG-007 | HARD | test.regression_clean (=1.0) | p2e-tc-008, p2e-tc-012 | ✅ OK |
| HG-008 | HARD | release.atomicity (=1.0) | p2e-tc-001, p2e-tc-002, p2e-tc-003, p2e-tc-004, p2e-tc-015 | ✅ OK |
| HG-009 | HARD | release.version_tracked (=1.0) | p2e-tc-001, p2e-tc-002, p2e-tc-003, p2e-tc-004, p2e-tc-015 | ✅ OK |
| SG-001 | SOFT | intent.multi_intent_coverage (≥0.80) | p2e-tc-006 | ⚠️ THIN |
| SG-002 | SOFT | isc.confidence_calibration (≥0.85) | p2e-tc-007 | ⚠️ THIN |
| SG-003 | SOFT | dto.fallback_exists (=1.0) | — | 🔴 ZERO |
| SG-004 | SOFT | aeo.coverage_completeness (≥0.90) | — | 🔴 ZERO |
| SG-005 | SOFT | lep.exec_id_uniqueness (=1.0) | p2e-tc-014 | ⚠️ THIN |
| SG-006 | SOFT | lep.wal_completeness (=1.0) | p2e-tc-014 | ⚠️ THIN |
| SG-007 | SOFT | test.latency_p95 (≤30s) | p2e-tc-010 | ⚠️ THIN |
| SG-008 | SOFT | release.notification_sent (=1.0) | p2e-tc-001, p2e-tc-002, p2e-tc-003, p2e-tc-004, p2e-tc-015 | ✅ OK |
| SR-001 | SPECIAL | silent_failure_detection (FORCE_FAIL) | — | 🔴 ZERO |
| SR-002 | SPECIAL | security_risk_human_approval (FORCE_PARTIAL) | p2e-tc-011 | ⚠️ THIN |
| SR-003 | SPECIAL | regression_break_zero_tolerance (FORCE_FAIL) | — | 🔴 ZERO |