# IntentScanner Benchmark Report (Day 1 Baseline)

**Date**: 2026-03-05  
**Method**: regex_fallback (no LLM)  
**Samples**: 80  

## Summary

| Metric | Value |
|--------|-------|
| Overall Accuracy | **73.8%** (59/80) |
| Avg Latency | 0.04ms |
| Total Time | 3ms |

## Per-Category Precision / Recall / F1

| Category | Precision | Recall | F1 | Support |
|----------|-----------|--------|----|---------|
| IC1 | 93.8% | 71.4% | 81.1% | 21 |
| IC2 | 66.7% | 26.7% | 38.1% | 15 |
| IC3 | 94.1% | 100.0% | 97.0% | 16 |
| IC4 | 100.0% | 94.1% | 97.0% | 17 |
| IC5 | 100.0% | 72.7% | 84.2% | 11 |

## Accuracy by Difficulty

| Difficulty | Accuracy | Correct/Total |
|------------|----------|---------------|
| easy | 73.3% | 33/45 |
| medium | 84.2% | 16/19 |
| hard | 62.5% | 10/16 |

## Confusion Matrix

| Actual \ Pred | IC1 | IC2 | IC3 | IC4 | IC5 | NONE |
|---|---|---|---|---|---|---|
| **IC1** | 15 | 0 | 0 | 0 | 0 | 6 |
| **IC2** | 0 | 4 | 0 | 0 | 0 | 11 |
| **IC3** | 0 | 0 | 16 | 0 | 0 | 0 |
| **IC4** | 1 | 0 | 0 | 16 | 0 | 0 |
| **IC5** | 0 | 2 | 1 | 0 | 8 | 0 |
| **NONE** | 0 | 0 | 0 | 0 | 0 | 0 |

## Key Observations

1. **Regex fallback has patterns for all IC categories**
2. IC1 emotion keywords have decent recall for obvious cases but cannot distinguish sub-intents (positive/negative/frustration)
3. IC2 rule keywords provide partial coverage but match too broadly (e.g., "查看配置" triggers config_protection false positive)
4. IC3/IC4/IC5 now have regex patterns for baseline matching
5. Many IC5 samples contain IC1/IC2 keywords and get misclassified to those categories
6. **This baseline establishes the floor**: regex = ~73.8% overall. LLM mode target: >80%

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
| IB-011 | IC4 | IC4 | ✅ | hard | IC4 |
| IB-012 | IC1 | NONE | ❌ | medium | - |
| IB-013 | IC1 | IC1 | ✅ | medium | IC1, IC4 |
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
| IB-032 | IC3 | IC3 | ✅ | easy | IC3 |
| IB-033 | IC3 | IC3 | ✅ | easy | IC3 |
| IB-034 | IC3 | IC3 | ✅ | easy | IC3 |
| IB-035 | IC3 | IC3 | ✅ | easy | IC3 |
| IB-036 | IC3 | IC3 | ✅ | easy | IC3 |
| IB-037 | IC3 | IC3 | ✅ | easy | IC3 |
| IB-038 | IC3 | IC3 | ✅ | easy | IC3 |
| IB-039 | IC3 | IC3 | ✅ | easy | IC3 |
| IB-040 | IC3 | IC3 | ✅ | easy | IC3 |
| IB-041 | IC3 | IC3 | ✅ | medium | IC3 |
| IB-042 | IC3 | IC3 | ✅ | medium | IC3 |
| IB-043 | IC3 | IC3 | ✅ | hard | IC3 |
| IB-044 | IC3 | IC3 | ✅ | hard | IC3 |
| IB-045 | IC3 | IC3 | ✅ | medium | IC3 |
| IB-046 | IC3 | IC3 | ✅ | medium | IC3 |
| IB-047 | IC4 | IC4 | ✅ | easy | IC4 |
| IB-048 | IC4 | IC4 | ✅ | easy | IC4 |
| IB-049 | IC4 | IC4 | ✅ | easy | IC4 |
| IB-050 | IC4 | IC4 | ✅ | easy | IC4 |
| IB-051 | IC4 | IC4 | ✅ | easy | IC4 |
| IB-052 | IC4 | IC4 | ✅ | medium | IC4 |
| IB-053 | IC4 | IC1 | ❌ | easy | IC1, IC4 |
| IB-054 | IC4 | IC4 | ✅ | easy | IC4 |
| IB-055 | IC4 | IC4 | ✅ | easy | IC4 |
| IB-056 | IC4 | IC4 | ✅ | easy | IC4 |
| IB-057 | IC4 | IC4 | ✅ | easy | IC4 |
| IB-058 | IC1 | NONE | ❌ | hard | - |
| IB-059 | IC1 | IC1 | ✅ | hard | IC1 |
| IB-060 | IC4 | IC4 | ✅ | hard | IC4 |
| IB-061 | IC4 | IC4 | ✅ | medium | IC4 |
| IB-062 | IC4 | IC4 | ✅ | hard | IC4 |
| IB-063 | IC5 | IC5 | ✅ | easy | IC5, IC1 |
| IB-064 | IC5 | IC5 | ✅ | easy | IC5, IC1, IC3 |
| IB-065 | IC5 | IC5 | ✅ | easy | IC5 |
| IB-066 | IC5 | IC5 | ✅ | easy | IC5 |
| IB-067 | IC5 | IC5 | ✅ | easy | IC5, IC1, IC3 |
| IB-068 | IC5 | IC3 | ❌ | easy | IC3, IC5 |
| IB-069 | IC1 | IC1 | ✅ | hard | IC1 |
| IB-070 | IC3 | IC3 | ✅ | hard | IC3 |
| IB-071 | IC4 | IC4 | ✅ | hard | IC4 |
| IB-072 | IC5 | IC5 | ✅ | medium | IC5 |
| IB-073 | IC5 | IC5 | ✅ | medium | IC5 |
| IB-074 | IC5 | IC5 | ✅ | medium | IC5, IC3 |
| IB-075 | IC1 | NONE | ❌ | hard | - |
| IB-076 | IC1 | NONE | ❌ | hard | - |
| IB-077 | IC1 | IC1 | ✅ | hard | IC1 |
| IB-078 | IC4 | IC4 | ✅ | medium | IC4 |
| IB-079 | IC5 | IC2 | ❌ | medium | IC2, IC1, IC5 |
| IB-080 | IC5 | IC2 | ❌ | hard | IC2, IC5 |

</details>
