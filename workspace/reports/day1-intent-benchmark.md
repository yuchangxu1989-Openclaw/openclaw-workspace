# IntentScanner Benchmark Report (Day 1 Baseline)

**Date**: 2026-03-05  
**Method**: regex_fallback (no LLM)  
**Samples**: 80  

## Summary

| Metric | Value |
|--------|-------|
| Overall Accuracy | **23.8%** (19/80) |
| Avg Latency | 0.03ms |
| Total Time | 2ms |

## Per-Category Precision / Recall / F1

| Category | Precision | Recall | F1 | Support |
|----------|-----------|--------|----|---------|
| IC1 | 78.9% | 71.4% | 75.0% | 21 |
| IC2 | 66.7% | 26.7% | 38.1% | 15 |
| IC3 | N/A% | 0.0% | N/A% | 16 |
| IC4 | N/A% | 0.0% | N/A% | 17 |
| IC5 | N/A% | 0.0% | N/A% | 11 |

## Accuracy by Difficulty

| Difficulty | Accuracy | Correct/Total |
|------------|----------|---------------|
| easy | 22.2% | 10/45 |
| medium | 31.6% | 6/19 |
| hard | 18.8% | 3/16 |

## Confusion Matrix

| Actual \ Pred | IC1 | IC2 | IC3 | IC4 | IC5 | NONE |
|---|---|---|---|---|---|---|
| **IC1** | 15 | 0 | 0 | 0 | 0 | 6 |
| **IC2** | 0 | 4 | 0 | 0 | 0 | 11 |
| **IC3** | 0 | 0 | 0 | 0 | 0 | 16 |
| **IC4** | 1 | 0 | 0 | 0 | 0 | 16 |
| **IC5** | 3 | 2 | 0 | 0 | 0 | 6 |
| **NONE** | 0 | 0 | 0 | 0 | 0 | 0 |

## Key Observations

1. **Regex fallback only has patterns for IC1 and IC2** — IC3, IC4, IC5 have 0% recall by design (no regex rules)
2. IC1 emotion keywords have decent recall for obvious cases but cannot distinguish sub-intents (positive/negative/frustration)
3. IC2 rule keywords provide partial coverage but match too broadly (e.g., "查看配置" triggers config_protection false positive)
4. All IC3 (complex), IC4 (implicit), IC5 (composite) samples fall to NONE — these require LLM reasoning
5. Many IC5 samples contain IC1/IC2 keywords and get misclassified to those categories
6. **This baseline establishes the floor**: regex = ~23.8% overall. LLM mode target: >80%

## Detailed Results

<details><summary>All 80 results</summary>

| ID | Expected | Predicted | ✓ | Diff | Intents |
|----|----------|-----------|---|------|---------|
| IB-001 | IC1 | IC1 | ✅ | easy | IC1 |
| IB-002 | IC1 | IC1 | ✅ | easy | IC1 |
| IB-003 | IC1 | IC1 | ✅ | easy | IC1 |
| IB-004 | IC1 | IC1 | ✅ | easy | IC1 |
| IB-005 | IC1 | NONE | ❌ | easy | - |
| IB-006 | IC1 | IC1 | ✅ | easy | IC1 |
| IB-007 | IC1 | IC1 | ✅ | easy | IC1 |
| IB-008 | IC1 | IC1 | ✅ | easy | IC1 |
| IB-009 | IC1 | NONE | ❌ | easy | - |
| IB-010 | IC1 | IC1 | ✅ | medium | IC1 |
| IB-011 | IC4 | NONE | ❌ | hard | - |
| IB-012 | IC1 | NONE | ❌ | medium | - |
| IB-013 | IC1 | IC1 | ✅ | medium | IC1 |
| IB-014 | IC1 | IC1 | ✅ | medium | IC1 |
| IB-015 | IC1 | IC1 | ✅ | easy | IC1 |
| IB-016 | IC1 | IC1 | ✅ | easy | IC1 |
| IB-017 | IC2 | NONE | ❌ | easy | - |
| IB-018 | IC2 | NONE | ❌ | easy | - |
| IB-019 | IC2 | NONE | ❌ | easy | - |
| IB-020 | IC2 | NONE | ❌ | easy | - |
| IB-021 | IC2 | IC2 | ✅ | easy | IC2 |
| IB-022 | IC2 | NONE | ❌ | easy | - |
| IB-023 | IC2 | NONE | ❌ | medium | - |
| IB-024 | IC2 | NONE | ❌ | easy | - |
| IB-025 | IC2 | NONE | ❌ | easy | - |
| IB-026 | IC2 | NONE | ❌ | easy | - |
| IB-027 | IC2 | IC2 | ✅ | medium | IC2 |
| IB-028 | IC2 | NONE | ❌ | hard | - |
| IB-029 | IC2 | NONE | ❌ | hard | - |
| IB-030 | IC2 | IC2 | ✅ | medium | IC2 |
| IB-031 | IC2 | IC2 | ✅ | medium | IC2 |
| IB-032 | IC3 | NONE | ❌ | easy | - |
| IB-033 | IC3 | NONE | ❌ | easy | - |
| IB-034 | IC3 | NONE | ❌ | easy | - |
| IB-035 | IC3 | NONE | ❌ | easy | - |
| IB-036 | IC3 | NONE | ❌ | easy | - |
| IB-037 | IC3 | NONE | ❌ | easy | - |
| IB-038 | IC3 | NONE | ❌ | easy | - |
| IB-039 | IC3 | NONE | ❌ | easy | - |
| IB-040 | IC3 | NONE | ❌ | easy | - |
| IB-041 | IC3 | NONE | ❌ | medium | - |
| IB-042 | IC3 | NONE | ❌ | medium | - |
| IB-043 | IC3 | NONE | ❌ | hard | - |
| IB-044 | IC3 | NONE | ❌ | hard | - |
| IB-045 | IC3 | NONE | ❌ | medium | - |
| IB-046 | IC3 | NONE | ❌ | medium | - |
| IB-047 | IC4 | NONE | ❌ | easy | - |
| IB-048 | IC4 | NONE | ❌ | easy | - |
| IB-049 | IC4 | NONE | ❌ | easy | - |
| IB-050 | IC4 | NONE | ❌ | easy | - |
| IB-051 | IC4 | NONE | ❌ | easy | - |
| IB-052 | IC4 | NONE | ❌ | medium | - |
| IB-053 | IC4 | IC1 | ❌ | easy | IC1 |
| IB-054 | IC4 | NONE | ❌ | easy | - |
| IB-055 | IC4 | NONE | ❌ | easy | - |
| IB-056 | IC4 | NONE | ❌ | easy | - |
| IB-057 | IC4 | NONE | ❌ | easy | - |
| IB-058 | IC1 | NONE | ❌ | hard | - |
| IB-059 | IC1 | IC1 | ✅ | hard | IC1 |
| IB-060 | IC4 | NONE | ❌ | hard | - |
| IB-061 | IC4 | NONE | ❌ | medium | - |
| IB-062 | IC4 | NONE | ❌ | hard | - |
| IB-063 | IC5 | IC1 | ❌ | easy | IC1 |
| IB-064 | IC5 | IC1 | ❌ | easy | IC1 |
| IB-065 | IC5 | NONE | ❌ | easy | - |
| IB-066 | IC5 | NONE | ❌ | easy | - |
| IB-067 | IC5 | IC1 | ❌ | easy | IC1 |
| IB-068 | IC5 | NONE | ❌ | easy | - |
| IB-069 | IC1 | IC1 | ✅ | hard | IC1 |
| IB-070 | IC3 | NONE | ❌ | hard | - |
| IB-071 | IC4 | NONE | ❌ | hard | - |
| IB-072 | IC5 | NONE | ❌ | medium | - |
| IB-073 | IC5 | NONE | ❌ | medium | - |
| IB-074 | IC5 | NONE | ❌ | medium | - |
| IB-075 | IC1 | NONE | ❌ | hard | - |
| IB-076 | IC1 | NONE | ❌ | hard | - |
| IB-077 | IC1 | IC1 | ✅ | hard | IC1 |
| IB-078 | IC4 | NONE | ❌ | medium | - |
| IB-079 | IC5 | IC2 | ❌ | medium | IC2, IC1 |
| IB-080 | IC5 | IC2 | ❌ | hard | IC2 |

</details>
