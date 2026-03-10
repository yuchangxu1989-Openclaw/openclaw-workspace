# Concise Evaluation Baseline Guidance

**Purpose**: one concise, doc-ready baseline for evaluating whether a capability is truly ready.  
**Use rule**: never collapse all evaluation evidence into one generic “passed” claim.

---

## 1. Metrics

### 1.1 Top 3 North-Star Metrics

| Name | Target | Formula |
|---|---|---|
| Infra Pass Rate | 100% on required evaluation chain | `passed_infra_checks / total_required_infra_checks` |
| Function Pass Rate | ≥ 90% on golden cases | `passed_function_cases / total_function_cases` |
| Global Autonomy Pass Rate | 100% on required system-level gates | `passed_global_autonomy_gates / total_required_global_autonomy_gates` |

### 1.2 Process Metrics

| Name | Target | Formula |
|---|---|---|
| Evidence Coverage | 100% for required dimensions | `dimensions_with_evidence / required_dimensions` |
| Golden Case Coverage | 100% of P0/P1 golden cases included | `golden_cases_executed / required_golden_cases` |
| Contradiction Resolution Rate | 100% of major contradictions resolved before publish | `resolved_major_contradictions / total_major_contradictions` |
| Badcase Closure Rate | trending up; P0 badcases = 0 before sign-off | `closed_badcases / total_badcases` |
| Evaluation Freshness | all sign-off evidence within current review window | `fresh_evidence_items / total_signoff_evidence_items` |
| Publish Safety Rate | 100%; no overclaiming statements | `safe_status_statements / total_status_statements` |

---

## 2. Principles and Rules

### 2.1 Core Principles

1. **Metrics before narrative**: verdict follows measurable gates, not confidence language.
2. **Three-gate separation**: infra, function, and global autonomy must be judged independently.
3. **MECE evidence structure**: no duplicated dimensions, no missing dimensions.
4. **Latest trustworthy evidence wins**: newer reliable evidence overrides older weaker summaries.
5. **No implicit pass inheritance**: function pass does not imply infra pass or autonomy pass.

### 2.2 Hard Rules

#### Rule A: Three-gate verdict is mandatory
Every publishable evaluation must explicitly state:
- `infra-pass`
- `function-pass`
- `global-autonomy-pass`
- `overall`

#### Rule B: Overall PASS requires all three gates PASS
Use `overall: PASS` **only if**:
- `infra-pass = PASS`
- `function-pass = PASS`
- `global-autonomy-pass = PASS`

Otherwise use one of:
- `PARTIAL`
- `CONDITIONAL`
- `FEATURE-PASS-ONLY`
- `INFRA-BLOCKED`
- `GLOBAL-AUTONOMY-NOT-PROVEN`

#### Rule C: Evidence must map to the right gate
- Infra evidence: runner trustworthiness, handler discovery, report generation, ingestion correctness, non-fake exits.
- Function evidence: benchmark pass, E2E success, golden-case performance, badcase reduction.
- Global autonomy evidence: system-level health, execution stability, effect loop health, dashboard/gate readiness.

#### Rule D: Unsafe wording is prohibited unless all three gates pass
Do not use these words without 3/3 pass:
- done
- fully accepted
- gate-ready
- evaluation closed
- passed

#### Rule E: Scores cannot replace gate verdicts
A composite score, summary score, or “conditional pass” score is not equivalent to full acceptance.

---

## 3. Golden Cases

### 3.1 Golden Case 1: Full Accept
**Condition**:
- infra evidence trustworthy
- function golden cases pass target
- global autonomy healthy

**Expected verdict**:
- `infra-pass: PASS`
- `function-pass: PASS`
- `global-autonomy-pass: PASS`
- `overall: PASS`

### 3.2 Golden Case 2: Feature Works but Infra Is Not Reliable
**Condition**:
- feature benchmarks look good
- runner/report/ingestion path still contested

**Expected verdict**:
- `infra-pass: FAIL` or `CONTESTED`
- `function-pass: PASS`
- `global-autonomy-pass: NOT_PROVEN` or actual result
- `overall: FEATURE-PASS-ONLY` or `CONDITIONAL`

### 3.3 Golden Case 3: Feature Works but System-Level Autonomy Not Proven
**Condition**:
- infra chain trustworthy
- feature works
- dashboard/system health still warning

**Expected verdict**:
- `infra-pass: PASS`
- `function-pass: PASS`
- `global-autonomy-pass: NOT_PROVEN`
- `overall: CONDITIONAL`

### 3.4 Golden Case 4: Mixed Legacy Reports with High Score
**Condition**:
- older report says “83/100 conditional pass” or similar
- latest gate-separated evidence shows unresolved gaps

**Expected verdict**:
- do **not** translate score into PASS
- reframe into explicit 3-gate verdict

---

## 4. Supplemental

### 4.1 Canonical Publish Template

```md
## Evaluation Verdict

- infra-pass: PASS | FAIL | CONTESTED
- function-pass: PASS | PARTIAL | FAIL
- global-autonomy-pass: PASS | NOT_PROVEN | FAIL
- overall: PASS only if all three are PASS; otherwise PARTIAL / CONDITIONAL / FEATURE-PASS-ONLY / INFRA-BLOCKED

## Evidence
- Infra:
- Function:
- Global autonomy:

## Safe summary
...
```

### 4.2 One-Line Summary Template

```text
Status: infra-pass=X, function-pass=Y, global-autonomy-pass=Z, overall=W.
```

### 4.3 Minimal Review Checklist

- Are the top 3 north-star metrics explicitly stated?
- Is each evidence item mapped to the correct gate?
- Are any unsafe words used without 3/3 pass?
- Are all required golden cases included?
- Is the final statement consistent with the gate verdicts?
