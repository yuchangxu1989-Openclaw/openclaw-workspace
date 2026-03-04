# L3 Pipeline E2E Benchmark Report

**Date:** 2026-03-04  
**Cases:** 38 | **Passed:** 36 | **Failed:** 2

## Summary Metrics

| Metric | Result |
|--------|--------|
| 端到端正确率 | 36/38 (94.7%) |
| 规则匹配准确率 | 36/38 (94.7%) |
| 熔断有效率 | 6/6 (100.0%) |
| 降级正确率 | 4/4 (100.0%) |
| 平均延迟 | 11.9ms |

## By Difficulty

| Difficulty | Passed | Failed | Rate |
|------------|--------|--------|------|
| easy | 17 | 2 | 89.5% |
| medium | 15 | 0 | 100.0% |
| hard | 4 | 0 | 100.0% |

## Failed Cases

- **PB-002**: Rules: expected <=0, got 1 (actual: rules=1, breaks=0, dispatches=0)
- **PB-009**: Rules: expected >=1, got 0 (actual: rules=0, breaks=0, dispatches=0)

## All Cases

| ID | Diff | Result | Duration | Scenario |
|----|------|--------|----------|----------|
| PB-001 | easy | ✅ | 11ms | skill.created → matches 2+ ISC rules (anti-entropy, layered- |
| PB-002 | easy | ❌ | 1ms | skill.updated → match but condition fails (no new_capability |
| PB-003 | easy | ✅ | 2ms | execution_failed → match but condition evaluates false |
| PB-004 | easy | ✅ | 1ms | design.document.created → 3 rules fire (arch-review, anti-en |
| PB-005 | easy | ✅ | 5ms | isc.rule.created → anti-entropy + layered-decoupling rules f |
| PB-006 | easy | ✅ | 1ms | evomap.sync.request → security scan rule fires |
| PB-007 | easy | ✅ | 1ms | message.reply.received → match but condition fails |
| PB-008 | easy | ✅ | 1ms | skill.publish → security gate rule fires |
| PB-009 | easy | ❌ | 1ms | analysis.requested → parallel-analysis rule fires |
| PB-010 | easy | ✅ | 1ms | defect_acknowledged → self-correction rule fires |
| PB-011 | easy | ✅ | 1ms | Unknown event → no matches, safe skip |
| PB-012 | easy | ✅ | 0ms | Noise event → zero matches |
| PB-013 | easy | ✅ | 1ms | Deep-nested unknown → no match |
| PB-014 | medium | ✅ | 1ms | skill.created depth=10 → circuit break |
| PB-015 | medium | ✅ | 1ms | execution_failed depth=6 → circuit break |
| PB-016 | medium | ✅ | 1ms | depth=100 → definite circuit break |
| PB-017 | medium | ✅ | 1ms | depth=5 (=max) → NOT broken, normal processing |
| PB-018 | easy | ✅ | 2ms | depth=0 → normal processing |
| PB-019 | medium | ✅ | 3ms | Batch: 3 matchable events → 6+ total rule matches |
| PB-020 | medium | ✅ | 5ms | Batch: 3 events → 5+ rule matches |
| PB-021 | medium | ✅ | 2ms | Batch: 2 matchable + 1 noise → 3+ rule matches |
| PB-022 | hard | ✅ | 2ms | Batch: 1 circuit-breaks + 1 processes → partial break |
| PB-023 | medium | ✅ | 136ms | user.message → IntentScanner triggered |
| PB-024 | medium | ✅ | 139ms | conversation.new → intent scan triggered |
| PB-025 | medium | ✅ | 122ms | chat.incoming → intent scan triggered |
| PB-026 | medium | ✅ | 1ms | dialog.started → intent scan triggered |
| PB-027 | easy | ✅ | 1ms | design.document.modified → 3 rules fire |
| PB-028 | easy | ✅ | 1ms | skill_renamed → N018 rename alignment rule fires |
| PB-029 | easy | ✅ | 1ms | workflow.requested → parallel-subagent rule fires |
| PB-030 | easy | ✅ | 1ms | Empty events → pipeline does nothing |
| PB-031 | hard | ✅ | 2ms | 5-event batch: 4 matchable + 1 noise → 7+ rule matches |
| PB-032 | hard | ✅ | 1ms | All events exceed depth → all circuit-broken |
| PB-033 | hard | ✅ | 1ms | Conversation at high depth → circuit break, no intent scan |
| PB-034 | medium | ✅ | 0ms | L3_PIPELINE_ENABLED=false → entire pipeline skipped |
| PB-035 | medium | ✅ | 0ms | L3_RULEMATCHER_ENABLED=false → no rule matching |
| PB-036 | medium | ✅ | 1ms | L3_INTENTSCANNER_ENABLED=false → no intent scanning |
| PB-037 | medium | ✅ | 0ms | L3_EVENTBUS_ENABLED=false → no events consumed |
| PB-038 | easy | ✅ | 1ms | api_key_rate_limit → match but condition fails evaluation |
