# AEO / Global Autonomy Evaluation Standard v2.0

**Version**: 2.0.0  
**Created**: 2026-03-08  
**Supersedes**: `01-evaluation-model.md` (v1.0), informal three-gate narrative in `evaluation-state-narrative-2026-03-08.md`  
**Scope**: End-to-end evaluation of the OpenClaw system's **AEO (Agent Effect Operations)**, **Global Autonomy**, and **「言出法随」(Principle-to-Enforcement)** capabilities.  
**Constraint**: Does NOT modify `openclaw.json`.

---

## 0. Design Philosophy

The v1.0 standard suffered from three critical weaknesses:

1. **Coarseness**: binary PASS/FAIL or three-level verdicts (SUCCESS / PARTIAL / FAIL) collapsed multi-dimensional behavior into single labels, losing diagnostic signal.
2. **Qualitative ambiguity**: phrases like "partial pass" or "conditional accept" left room for interpretation drift.
3. **Pipeline-only scope**: the standard measured pipeline-stage correctness but not the end-to-end autonomy loop the system is supposed to deliver.

**v2.0 fixes this** by defining:

- **7 orthogonal scoring dimensions**, each with 0–100 continuous scores
- **Per-dimension thresholds** with 5-level grading (A/B/C/D/F)
- **Composite score** with weighted aggregation and hard-floor rules
- **Coverage matrix** requiring minimum breadth before any pass claim
- **Execution-chain complexity taxonomy** that rewards harder E2E paths
- **Proactive-completion metrics** that measure system initiative
- **Intent/event richness index** that prevents gaming via trivial test cases
- **Machine-readable verdict schema** with deterministic pass/fail semantics

---

## 1. Scoring Dimensions (7 Axes)

Each dimension produces a score in `[0, 100]`. Scores are absolute, not relative.

### Dimension Summary

| # | Dimension ID | Name | Weight | Hard Floor | What It Measures |
|---|---|---|---|---|---|
| D1 | `intent_fidelity` | Intent Fidelity | 20% | 60 | Does the system correctly understand and classify user intent? |
| D2 | `execution_closure` | Execution Closure | 25% | 55 | Does the system autonomously complete the full execution chain? |
| D3 | `governance_enforcement` | Governance Enforcement | 15% | 50 | Are safety/governance gates active, fail-closed, and auditable? |
| D4 | `proactive_completion` | Proactive Completion | 10% | 40 | Does the system anticipate needs and act without explicit prompting? |
| D5 | `eval_infrastructure` | Evaluation Infrastructure | 10% | 45 | Is the measurement chain itself trustworthy and operational? |
| D6 | `coverage_breadth` | Coverage Breadth | 10% | 50 | Does evidence span diverse intent types, complexity levels, and failure modes? |
| D7 | `resilience_recovery` | Resilience & Recovery | 10% | 40 | Does the system detect, recover from, and learn from failures? |
| — | — | **Total** | **100%** | — | — |

### Hard Floor Rule

> If **any** dimension score falls **below its Hard Floor**, the overall verdict is capped at **CONDITIONAL** regardless of composite score. This prevents a strong dimension from masking a catastrophic weakness.

---

## 2. Dimension Definitions & Metric Decomposition

### D1: Intent Fidelity (weight=20%, floor=60)

Measures the system's ability to correctly parse, classify, and semantically preserve user intent across the full intent taxonomy.

| Metric ID | Metric Name | Measurement | Target | Weight within D1 |
|---|---|---|---|---|
| D1.1 | Intent Type Accuracy | `correct_type_classifications / total_classified` × 100 | ≥ 92 | 30% |
| D1.2 | Entity Extraction F1 | Harmonic mean of precision and recall on target/scope/constraint entities | ≥ 85 | 20% |
| D1.3 | Multi-Intent Recall | `intents_detected / intents_present` in multi-intent utterances × 100 | ≥ 80 | 15% |
| D1.4 | Paraphrase Consistency | Agreement rate across 10 semantic variants of same instruction | ≥ 88 | 15% |
| D1.5 | False Positive Rate | `non_P2E_misclassified_as_P2E / total_non_P2E` × 100 (lower=better) | ≤ 5 | 10% |
| D1.6 | IC-Category Coverage | `IC_categories_with_≥3_samples / total_IC_categories` × 100 | ≥ 80 | 10% |

**D1 Score** = Σ(metric_i × weight_i), with D1.5 inverted: `score = max(0, 100 - FPR × 20)`.

**Required sample minimums**:
- D1.1: ≥ 50 classified samples
- D1.3: ≥ 15 multi-intent utterances
- D1.4: ≥ 5 paraphrase groups of ≥ 10 variants each
- D1.6: All 5 IC categories (IC1–IC5) must have ≥ 3 samples; any category with 0 samples → D1.6 = 0

---

### D2: Execution Closure (weight=25%, floor=55)

The most critical dimension. Measures whether the system can autonomously complete the full lifecycle: **detect → admit → plan → execute → verify → close**.

| Metric ID | Metric Name | Measurement | Target | Weight within D2 |
|---|---|---|---|---|
| D2.1 | Admission SLA Hit Rate | `requests_admitted_within_5s / total_requests` × 100 | ≥ 90 | 15% |
| D2.2 | Plan Materialization Rate | `requests_with_concrete_plan / requests_admitted` × 100 | ≥ 95 | 15% |
| D2.3 | Execution Completion Rate | `executions_completed / executions_started` × 100 | ≥ 85 | 20% |
| D2.4 | External Effect Verification Rate | `effects_externally_confirmed / effects_expected` × 100 | ≥ 70 | 20% |
| D2.5 | Silent Failure Rate | `silent_failures / total_executions` × 100 (lower=better) | ≤ 2 | 15% |
| D2.6 | Autonomous Closure Rate | `fully_autonomous_completions / total_completions` × 100 (no hidden manual patches) | ≥ 75 | 15% |

**D2 Score** = Σ(metric_i × weight_i), with D2.5 inverted: `score = max(0, 100 - silent_failure_rate × 50)`.

**Required evidence per case** (must be present in verdict artifacts):
```
✓ request_observed_at     (timestamp)
✓ request_admitted_at     (timestamp, or null + reason)
✓ plan_materialized_at    (timestamp + plan_hash)
✓ execution_started_at    (timestamp + exec_id)
✓ execution_completed_at  (timestamp + exit_status)
✓ effect_verified_at      (timestamp + verification_method)
✓ manual_patch_flag       (boolean)
✓ closure_type            (enum: autonomous | assisted | failed | abandoned)
```

---

### D3: Governance Enforcement (weight=15%, floor=50)

Measures whether safety, compliance, and access-control mechanisms are active in real execution paths — not just unit-tested.

| Metric ID | Metric Name | Measurement | Target | Weight within D3 |
|---|---|---|---|---|
| D3.1 | Hard Gate Activation Rate | `hard_gates_that_fired_when_expected / hard_gate_trigger_scenarios` × 100 | ≥ 95 | 25% |
| D3.2 | Fail-Closed Correctness | `gates_that_blocked_when_criteria_failed / gates_that_should_have_blocked` × 100 | = 100 | 25% |
| D3.3 | Audit Trail Completeness | `decisions_with_full_audit_record / total_governance_decisions` × 100 | ≥ 90 | 20% |
| D3.4 | Side-Effect Classification Accuracy | `correctly_classified_destructive_actions / total_destructive_actions` × 100 | ≥ 90 | 15% |
| D3.5 | Rollback Success Rate | `successful_rollbacks / rollback_attempts` × 100 | ≥ 80 | 15% |

**D3 Score** = Σ(metric_i × weight_i).

**D3.2 is a hard-zero rule**: if D3.2 < 100 (any gate failed to block when it should have), D3 score is capped at 49, which will trigger the Hard Floor violation for D3 (floor=50).

---

### D4: Proactive Completion (weight=10%, floor=40)

Measures the system's ability to anticipate user needs, self-initiate follow-up actions, and fill gaps without being explicitly asked.

| Metric ID | Metric Name | Measurement | Target | Weight within D4 |
|---|---|---|---|---|
| D4.1 | Follow-Up Action Generation Rate | `proactive_follow_ups_generated / opportunities_for_follow_up` × 100 | ≥ 60 | 30% |
| D4.2 | Proactive Action Acceptance Rate | `user_accepted_proactive_actions / proactive_actions_proposed` × 100 | ≥ 70 | 30% |
| D4.3 | Anticipatory Error Prevention | `pre-emptive_validations_that_prevented_failure / preventable_failure_scenarios` × 100 | ≥ 50 | 20% |
| D4.4 | Context Carry-Forward Accuracy | `context_items_correctly_carried / context_items_expected` × 100 | ≥ 85 | 20% |

**D4 Score** = Σ(metric_i × weight_i).

---

### D5: Evaluation Infrastructure (weight=10%, floor=45)

Measures whether the evaluation machinery itself is trustworthy — because if the evaluator is broken, no evaluation conclusion is credible.

| Metric ID | Metric Name | Measurement | Target | Weight within D5 |
|---|---|---|---|---|
| D5.1 | Runner Operational Rate | `successful_runner_executions / runner_invocations` × 100 | ≥ 95 | 25% |
| D5.2 | Schema-Data Alignment | `evalsets_passing_schema_validation / total_evalsets` × 100 | = 100 | 20% |
| D5.3 | Gate Consumption Chain Health | `gates_that_consumed_their_evidence / gates_expected_to_consume` × 100 | ≥ 90 | 20% |
| D5.4 | Eval Result Reproducibility | `reruns_with_same_verdict / total_reruns` × 100 (same input, same config) | ≥ 90 | 20% |
| D5.5 | Eval Data Freshness | `days_since_newest_real_dialog_sample` (lower=better) | ≤ 7 | 15% |

**D5 Score** = Σ(metric_i × weight_i), with D5.5 inverted: `score = max(0, 100 - days × 10)`.

**D5.2 is a hard-zero rule**: if any evalset fails schema validation, D5 is capped at 44, triggering Hard Floor violation.

---

### D6: Coverage Breadth (weight=10%, floor=50)

Prevents gaming the evaluation by testing only easy or narrow scenarios. Enforces diversity across multiple axes.

| Metric ID | Metric Name | Measurement | Target | Weight within D6 |
|---|---|---|---|---|
| D6.1 | Intent Type Coverage | `intent_types_with_≥5_cases / 5_defined_types` × 100 | ≥ 80 | 20% |
| D6.2 | Complexity Level Coverage | `complexity_levels_with_≥3_cases / 4_levels` × 100 | ≥ 75 | 20% |
| D6.3 | Failure Mode Coverage | `failure_modes_tested / 8_defined_failure_modes` × 100 | ≥ 62.5 | 20% |
| D6.4 | Agent/Skill Coverage | `agents_exercised / total_agents` × 100 | ≥ 60 | 15% |
| D6.5 | Real vs Synthetic Ratio | `real_dialog_cases / total_cases` × 100 | ≥ 50 | 15% |
| D6.6 | Richness Index | Computed (see §3) | ≥ 0.60 | 10% |

**D6 Score** = Σ(metric_i × weight_i).

**Complexity levels** (for D6.2):

| Level | Code | Definition | Min Execution Steps |
|---|---|---|---|
| L1 | `TRIVIAL` | Single-step, single-tool, no branching | 1–2 |
| L2 | `STANDARD` | Multi-step, single-tool or simple tool chain | 3–5 |
| L3 | `COMPLEX` | Multi-step, multi-tool, with conditional branching or retry | 6–12 |
| L4 | `EXTREME` | Cross-agent orchestration, multi-day, external side effects, governance gates | 13+ |

**Failure modes** (for D6.3, 8 defined):

1. `INTENT_MISPARSE` — intent type or entity extraction error
2. `ROUTING_FAILURE` — event/handler routing miss
3. `EXECUTION_ERROR` — handler/tool execution failure
4. `SILENT_FAILURE` — no output, no error, no completion
5. `GOVERNANCE_BYPASS` — gate should have blocked but didn't
6. `REGRESSION` — new action broke existing functionality
7. `TIMEOUT` — execution exceeded time boundary
8. `PARTIAL_COMPLETION` — some subtasks done, others not

---

### D7: Resilience & Recovery (weight=10%, floor=40)

Measures the system's robustness under failure and its ability to learn from failures.

| Metric ID | Metric Name | Measurement | Target | Weight within D7 |
|---|---|---|---|---|
| D7.1 | Failure Detection Rate | `failures_detected_by_system / total_actual_failures` × 100 | ≥ 85 | 25% |
| D7.2 | Auto-Recovery Rate | `auto_recovered_failures / recoverable_failures` × 100 | ≥ 60 | 25% |
| D7.3 | Badcase Auto-Generation Rate | `auto_generated_badcases / failure_events` × 100 | ≥ 70 | 20% |
| D7.4 | MTTR (Mean Time to Recovery) | median minutes from failure detection to recovery | ≤ 15 min | 15% |
| D7.5 | Regression Prevention Rate | `regressions_prevented_by_gates / total_potential_regressions` × 100 | ≥ 80 | 15% |

**D7 Score** = Σ(metric_i × weight_i), with D7.4 inverted: `score = max(0, 100 - (MTTR_min - 5) × 5)`.

---

## 3. Intent/Event Richness Index (D6.6)

The Richness Index prevents evaluation gaming by measuring the diversity and complexity of the evaluation corpus. It is a composite of three sub-indices:

### 3.1 Intent Richness (IR)

```
IR = (unique_intent_types_exercised / 5) × 0.4
   + (unique_entity_domains / total_possible_domains) × 0.3
   + (multi_intent_cases / total_cases) × 0.3
```

### 3.2 Event Richness (ER)

```
ER = (unique_event_types_emitted / total_possible_event_types) × 0.5
   + (event_chains_with_≥3_hops / total_event_chains) × 0.3
   + (events_with_priority_variation / total_events) × 0.2
```

### 3.3 Execution Richness (XR)

```
XR = (cases_at_L3_or_L4 / total_cases) × 0.4
   + (unique_tools_exercised / total_available_tools) × 0.3
   + (cross_agent_cases / total_cases) × 0.3
```

### 3.4 Composite Richness Index

```
Richness = (IR + ER + XR) / 3

Interpretation:
  ≥ 0.80 = Excellent richness
  0.60–0.79 = Adequate richness
  0.40–0.59 = Marginal richness (warns of gaming risk)
  < 0.40 = Insufficient richness (blocks any pass claim)
```

---

## 4. Execution-Chain Complexity Score (ECCS)

Each evaluated case receives an ECCS that weights the difficulty of what was tested. This prevents trivial test cases from inflating pass rates.

### 4.1 Per-Case ECCS Calculation

| Factor | Multiplier | Condition |
|---|---|---|
| Base | 1.0 | Always applied |
| Multi-step | +0.5 | ≥ 3 execution steps |
| Multi-tool | +0.5 | ≥ 2 different tools invoked |
| Multi-agent | +1.0 | Crosses agent boundary |
| Conditional branching | +0.5 | Contains if/retry/fallback logic |
| External side effect | +1.0 | Modifies external state (file, API, DB) |
| Governance gate triggered | +0.5 | At least one hard/soft gate fires |
| Real dialog origin | +0.5 | Derived from real user conversation |
| Multi-turn context | +0.5 | Requires ≥ 3 conversation turns of context |
| Failure recovery | +1.0 | Case tests failure detection and recovery |

**ECCS Range**: 1.0 (trivial) to 7.0 (maximum complexity)

### 4.2 Corpus-Level Complexity Score

```
Corpus_ECCS = Σ(case_ECCS_i × case_pass_i) / Σ(case_ECCS_i)
```

This is a **complexity-weighted pass rate** — passing harder cases contributes more.

| Corpus_ECCS | Interpretation |
|---|---|
| ≥ 0.80 | High-rigor pass evidence |
| 0.60–0.79 | Moderate-rigor evidence |
| 0.40–0.59 | Low-rigor evidence (mostly easy cases passing) |
| < 0.40 | Insufficient (trivial cases dominating) |

---

## 5. Composite Score & Verdict Algebra

### 5.1 Composite Score Calculation

```
Composite = Σ(D_i.score × D_i.weight)   for i ∈ {1..7}

Range: [0, 100]
```

### 5.2 Verdict Determination (5 levels, not 3)

The verdict is determined by a **conjunction** of composite score, floor violations, and coverage gates:

| Verdict | Code | Composite Score | Floor Violations | Corpus ECCS | Richness Index |
|---|---|---|---|---|---|
| **FULL PASS** | `FP` | ≥ 82 | 0 | ≥ 0.65 | ≥ 0.60 |
| **STRONG PASS** | `SP` | ≥ 70 | 0 | ≥ 0.50 | ≥ 0.50 |
| **CONDITIONAL** | `CP` | ≥ 55 | ≤ 1 | ≥ 0.40 | ≥ 0.40 |
| **WEAK / CONTESTED** | `WC` | ≥ 40 | ≤ 2 | any | any |
| **FAIL** | `FL` | < 40 | any | any | any |

### 5.3 Verdict Rules (precedence order)

1. **Force FAIL**: If D3.2 (Fail-Closed Correctness) < 100% → verdict = `FL` regardless of all other scores.
2. **Force FAIL**: If D5.2 (Schema-Data Alignment) < 100% → verdict = `FL`.
3. **Force FAIL**: If silent failure rate (D2.5 raw) > 10% → verdict = `FL`.
4. **Floor check**: Count dimensions where score < Hard Floor → `floor_violations`.
5. **Apply table above** with computed composite, floor_violations, Corpus_ECCS, Richness.
6. **Tie-break**: If multiple rows match, the highest verdict applies.

### 5.4 Confidence Level

Every verdict is paired with a confidence level based on sample size:

| Total Evaluated Cases | Confidence |
|---|---|
| ≥ 100 | `HIGH` |
| 50–99 | `MEDIUM` |
| 20–49 | `LOW` |
| < 20 | `INSUFFICIENT` — verdict is informational only, cannot be used for acceptance |

---

## 6. Pass/Fail Semantics & Claim Permissions

Each verdict level has strictly defined **claim permissions** — what you are allowed to say based on the evidence.

| Verdict | Allowed Claims | Forbidden Claims |
|---|---|---|
| `FP` | "System demonstrates end-to-end global autonomy at production quality" / "「言出法随」 capability is evidenced" / "AEO evaluation closed with full pass" | — |
| `SP` | "System demonstrates strong autonomy with minor gaps" / "Most E2E paths pass at production quality" / "Evaluation closure is substantially achieved" | "Full autonomy achieved" / "No gaps remain" |
| `CP` | "Engineering scaffolding for autonomy exists with partial evidence" / "Some subsystem E2Es pass" / "Specific governance gates are active" | "System is autonomous" / "Evaluation is closed" / "Ready for unconditional acceptance" |
| `WC` | "Work in progress with measurable partial results" / "Specific components show promise" | Any form of "pass" / "accepted" / "done" / "achieved" |
| `FL` | "Does not meet evaluation criteria" / "Critical gaps identified" | Any positive capability claim |

---

## 7. Evaluation Report Schema (Machine-Readable)

Every evaluation run MUST produce a JSON verdict artifact conforming to this structure:

```jsonc
{
  "$schema": "aeo-global-autonomy-eval-v2",
  "version": "2.0.0",
  "run_id": "run-20260308-001",
  "timestamp": "2026-03-08T08:44:00+08:00",
  "environment": "staging",

  // Corpus statistics
  "corpus": {
    "total_cases": 85,
    "real_dialog_cases": 52,
    "synthetic_cases": 33,
    "complexity_distribution": {
      "L1_trivial": 12,
      "L2_standard": 28,
      "L3_complex": 31,
      "L4_extreme": 14
    },
    "intent_type_distribution": {
      "PRINCIPLE": 18,
      "VERDICT": 15,
      "CONSTRAINT": 22,
      "GOAL": 20,
      "DIRECTIVE": 10
    },
    "corpus_eccs": 0.72,
    "richness_index": 0.68,
    "confidence": "MEDIUM"
  },

  // 7-dimension scores
  "dimensions": {
    "D1_intent_fidelity": {
      "score": 78.5,
      "floor": 60,
      "floor_violated": false,
      "metrics": {
        "D1.1_intent_type_accuracy": { "value": 92.3, "target": 92, "pass": true, "n": 65 },
        "D1.2_entity_extraction_f1": { "value": 87.1, "target": 85, "pass": true, "n": 65 },
        "D1.3_multi_intent_recall": { "value": 76.0, "target": 80, "pass": false, "n": 25 },
        "D1.4_paraphrase_consistency": { "value": 82.0, "target": 88, "pass": false, "n": 50 },
        "D1.5_false_positive_rate": { "value": 3.2, "target_max": 5, "pass": true, "n": 30 },
        "D1.6_ic_category_coverage": { "value": 80.0, "target": 80, "pass": true }
      }
    },
    // ... D2 through D7 follow same structure
  },

  // Composite calculation
  "composite": {
    "score": 71.2,
    "floor_violations": 0,
    "corpus_eccs": 0.72,
    "richness_index": 0.68
  },

  // Verdict
  "verdict": {
    "code": "SP",
    "label": "STRONG PASS",
    "confidence": "MEDIUM",
    "force_fail_triggered": false,
    "force_fail_reason": null,
    "allowed_claims": [
      "System demonstrates strong autonomy with minor gaps",
      "Most E2E paths pass at production quality",
      "Evaluation closure is substantially achieved"
    ],
    "forbidden_claims": [
      "Full autonomy achieved",
      "No gaps remain"
    ]
  },

  // Per-case results (array of case verdicts with ECCS)
  "case_results": [
    {
      "case_id": "p2e-tc-001",
      "intent_type": "CONSTRAINT",
      "complexity_level": "L3",
      "eccs": 4.5,
      "source": "real_dialog",
      "verdict": "PASS",
      "stage_results": { /* per-stage scores */ },
      "evidence": {
        "request_observed_at": "2026-03-07T10:00:00+08:00",
        "request_admitted_at": "2026-03-07T10:00:03+08:00",
        "plan_materialized_at": "2026-03-07T10:00:05+08:00",
        "execution_started_at": "2026-03-07T10:00:06+08:00",
        "execution_completed_at": "2026-03-07T10:00:18+08:00",
        "effect_verified_at": "2026-03-07T10:00:20+08:00",
        "manual_patch_flag": false,
        "closure_type": "autonomous"
      },
      "duration_ms": 20000
    }
  ],

  // Dimensional heatmap for quick visualization
  "heatmap": {
    "D1": "B",
    "D2": "B",
    "D3": "A",
    "D4": "C",
    "D5": "B",
    "D6": "B",
    "D7": "C"
  },

  // Actionable gaps (auto-generated from failing metrics)
  "gaps": [
    {
      "dimension": "D1",
      "metric": "D1.3_multi_intent_recall",
      "current": 76.0,
      "target": 80,
      "gap": -4.0,
      "priority": "P1",
      "suggested_action": "Add 10+ multi-intent training samples covering IC1-IC3 categories"
    }
  ],

  // Metadata
  "metadata": {
    "runner_version": "2.0.0",
    "evaluator": "auto",
    "human_review_required": false,
    "report_artifacts": [
      "reports/aeo-global-autonomy-eval-v2-run-20260308-001.json",
      "reports/aeo-global-autonomy-eval-v2-run-20260308-001.md"
    ]
  }
}
```

---

## 8. Per-Dimension Grade Thresholds

Each dimension score maps to a letter grade:

| Grade | Score Range | Meaning |
|---|---|---|
| **A** | 85–100 | Exceeds target; production-ready |
| **B** | 70–84 | Meets target; minor improvements possible |
| **C** | 55–69 | Below target; material gaps exist |
| **D** | 40–54 | Significantly below target; blocking issues |
| **F** | 0–39 | Critical failure; dimension is non-functional |

**Heatmap notation**: The 7-letter heatmap string (e.g., `BBAACBC`) provides instant diagnostic signal.

---

## 9. Comparison: v1.0 vs v2.0

| Aspect | v1.0 | v2.0 |
|---|---|---|
| Verdict levels | 3 (SUCCESS/PARTIAL/FAIL) | 5 (FP/SP/CP/WC/FL) |
| Scoring | Weighted sum → one number | 7 orthogonal dimensions, each 0–100 |
| Thresholds | Single pass threshold (0.85/0.60) | Per-dimension floors + composite + coverage gates |
| Coverage enforcement | None | Richness Index + complexity coverage + IC-category requirements |
| Complexity accounting | None | Per-case ECCS + corpus-level complexity-weighted pass rate |
| Proactive behavior | Not measured | D4 dimension with 4 metrics |
| Eval infra health | Not measured | D5 dimension with 5 metrics (eval-the-evaluator) |
| Resilience | Mentioned in badcase schema | D7 dimension with 5 metrics |
| Claim permissions | Implicit | Explicit per-verdict allowed/forbidden claims |
| Anti-gaming | None | Richness Index, ECCS, real-dialog ratio, sample minimums |
| Machine readability | Partial (schema existed) | Full JSON verdict schema with all fields |
| Force-fail rules | 1 (hard gate) | 3 explicit force-fail rules |
| Confidence level | None | 4-level based on sample size |
| Diagnostic signal | Low (single verdict) | High (7-letter heatmap + per-metric detail + gap list) |

---

## 10. Execution-Chain Complexity: Worked Examples

### Example A: Simple intent classification test

```
Steps: User says "restart gateway" → system classifies as DIRECTIVE → executes restart
Tools: 1 (exec)
Agents: 1
Branching: none
External effect: yes (service restart)
Gate: none
Source: synthetic
Turns: 1
Recovery: no

ECCS = 1.0 (base) + 0 + 0 + 0 + 0 + 1.0 (external) + 0 + 0 + 0 + 0 = 2.0
Complexity level: L1 (TRIVIAL)
```

### Example B: Cross-agent ISC rule creation from natural language principle

```
Steps: User says "all skills must have test coverage ≥80%" → intent parsed as PRINCIPLE 
     → event emitted → ISC generates rule draft → DTO creates DAG → handler validates 
     → AEO evaluates → gate checks → rule published → notification sent
Tools: 5 (intent parser, ISC generator, DTO planner, AEO evaluator, notification)
Agents: 3 (main, coder, analyst)
Branching: yes (confidence routing)
External effect: yes (rule published, notification sent)
Gate: yes (hard gate on ISC + soft gate on AEO)
Source: real dialog
Turns: 4
Recovery: no

ECCS = 1.0 + 0.5 + 0.5 + 1.0 + 0.5 + 1.0 + 0.5 + 0.5 + 0.5 + 0 = 6.0
Complexity level: L4 (EXTREME)
```

### Example C: Failure recovery scenario

```
Steps: User says "deploy the new rule" → execution fails at handler → system detects failure 
     → auto-generates badcase → retries with fallback → succeeds on retry → verifies
Tools: 3 (handler, badcase generator, fallback handler)
Agents: 2 (main, coder)
Branching: yes (retry/fallback)
External effect: yes (rule deployed)
Gate: yes (hard gate on deployment)
Source: synthetic
Turns: 2
Recovery: yes

ECCS = 1.0 + 0.5 + 0.5 + 1.0 + 0.5 + 1.0 + 0.5 + 0 + 0 + 1.0 = 6.5
Complexity level: L4 (EXTREME)
```

---

## 11. Proactive Completion: Measurement Protocol

D4 (Proactive Completion) requires specific measurement protocols because proactive behavior is harder to evaluate than reactive behavior.

### 11.1 Opportunity Detection

An **opportunity for proactive action** exists when:
- A completed task has an obvious follow-up (e.g., "deployed service" → should verify health)
- A detected anomaly implies a secondary problem (e.g., "schema mismatch" → should check related schemas)
- Context from previous turns implies an unstated need
- A scheduled trigger fires and system should act without being asked

### 11.2 Measurement Method

For each evaluated conversation:

1. **Human annotator** (or strong LLM-as-Judge with calibrated prompt) marks opportunities
2. System's proactive actions are compared against annotated opportunities
3. User acceptance is measured by whether the user:
   - Explicitly approved the action
   - Did not undo the action within 5 minutes
   - Used the result of the action

### 11.3 Anti-Gaming Rules

- **Unsolicited spam penalty**: If ≥ 30% of proactive actions are rejected/undone → D4.2 capped at 40
- **Trivial action penalty**: If ≥ 50% of proactive actions are trivial (e.g., "noted", "acknowledged") → D4.1 capped at 50

---

## 12. Evaluation Cadence & Governance

### 12.1 Evaluation Frequency

| Evaluation Type | Frequency | Min Cases | Required Confidence |
|---|---|---|---|
| **Full evaluation** | Monthly | 80+ | HIGH or MEDIUM |
| **Incremental evaluation** | Weekly | 20+ | LOW acceptable |
| **Smoke test** | Daily (automated) | 5+ | INSUFFICIENT (diagnostic only) |
| **Gate evaluation** | On every release candidate | 30+ | MEDIUM |

### 12.2 Evaluation Invalidation Rules

A previous evaluation verdict is **invalidated** when:
- The evaluation infrastructure (D5) itself changes
- The system under test has a major release (>= semver minor bump)
- A force-fail condition is newly discovered in production
- Evalset schema changes (D5.2 must be re-checked)
- More than 30 days have passed since last full evaluation

### 12.3 Escalation Protocol

| Condition | Action |
|---|---|
| Any dimension drops from B→D or worse between runs | Escalate to team lead |
| Force-fail triggered | Block release, notify owner |
| Confidence = INSUFFICIENT for gate evaluation | Block release until more cases added |
| Richness Index < 0.40 | Reject evaluation as non-representative |

---

## 13. Migration from v1.0

### 13.1 Mapping v1.0 Stages to v2.0 Dimensions

| v1.0 Stage | v2.0 Dimension(s) |
|---|---|
| INTENT | D1 (Intent Fidelity) |
| EVENT | D1 + D6 (event richness sub-index) |
| ISC | D2 (Execution Closure) + D3 (Governance) |
| DTO | D2 (Execution Closure) |
| CRAS | D4 (Proactive Completion) |
| AEO | D5 (Evaluation Infrastructure) |
| LEP | D7 (Resilience & Recovery) |
| TEST | D5 (Evaluation Infrastructure) + D6 (Coverage) |
| GATE | D3 (Governance Enforcement) |
| RELEASE | D2 (Execution Closure) + D3 (Governance) |

### 13.2 Backward Compatibility

v1.0 verdict artifacts are **not compatible** with v2.0. However:
- v1.0 `SUCCESS` ≈ v2.0 `FP` or `SP` (depending on coverage)
- v1.0 `PARTIAL` ≈ v2.0 `CP` or `WC`
- v1.0 `FAIL` ≈ v2.0 `FL`

Existing v1.0 reports should be **re-evaluated** under v2.0 criteria before being cited as evidence.

### 13.3 What Stays from v1.0

- The 10-stage pipeline model remains as the **execution reference architecture**
- The badcase taxonomy (BC-INTENT through BC-REGRESSION) remains valid for D7 badcase classification
- The gate criteria YAML structure can be extended (not replaced) for D3 governance checks
- The verdict and badcase JSON schemas remain valid for stage-level detail within the v2.0 case_results array

---

## 14. Current State Assessment Under v2.0

Based on evidence reviewed in `strict-global-autonomy-evidence-review-2026-03-08.md` and `evaluation-state-narrative-2026-03-08.md`:

### Estimated Current Scores (best-effort, subject to formal measurement)

| Dimension | Estimated Score | Grade | Notes |
|---|---|---|---|
| D1: Intent Fidelity | ~55 | C | IC1-IC3 have zero samples; paraphrase consistency untested |
| D2: Execution Closure | ~35 | F | No production admission SLA evidence; autonomous closure unproven |
| D3: Governance Enforcement | ~62 | C | Gates exist and some fail-closed; rollback/side-effect governance unproven |
| D4: Proactive Completion | ~30 | F | Not systematically measured |
| D5: Eval Infrastructure | ~40 | D | Runner path issues; schema mismatch caused 0/42; freshness marginal |
| D6: Coverage Breadth | ~35 | F | Heavy IC4/IC5 skew; limited L3/L4 cases; real-dialog ratio unclear |
| D7: Resilience & Recovery | ~25 | F | Badcase auto-generation partially exists; MTTR and recovery rate unmeasured |

### Estimated Composite

```
Composite ≈ 55×0.20 + 35×0.25 + 62×0.15 + 30×0.10 + 40×0.10 + 35×0.10 + 25×0.10
         = 11.0 + 8.75 + 9.3 + 3.0 + 4.0 + 3.5 + 2.5
         = 42.05

Floor violations: D2 (35 < 55), D4 (30 < 40), D5 (40 < 45), D6 (35 < 50), D7 (25 < 40) = 5 violations

Verdict: WC (WEAK / CONTESTED) — composite ≥ 40, but 5 floor violations (exceeds CP max of 1)
         Actually, WC requires ≤ 2 floor violations. With 5, verdict = FL (FAIL).

Corrected verdict: FL (FAIL)
Confidence: LOW (estimated, not formally measured)
```

### Honest Interpretation

> **Under v2.0, the system currently scores approximately 42/100 with 5 hard-floor violations, yielding a FAIL verdict.** This is consistent with the v1.0 narrative conclusion of "not proven" but provides much sharper diagnostic signal: the primary weaknesses are in Execution Closure (D2), Proactive Completion (D4), Evaluation Infrastructure (D5), Coverage Breadth (D6), and Resilience (D7). The relative strengths are in Governance Enforcement (D3) and partial Intent Fidelity (D1).

---

## 15. Path to STRONG PASS (SP)

Based on the gap analysis, the minimum improvements needed for SP:

| Dimension | Current | Target for SP (≥70 composite, 0 floor violations) | Gap | Priority |
|---|---|---|---|---|
| D1 | ~55 | 70 | +15 | P1: Add IC1-IC3 samples, paraphrase tests |
| D2 | ~35 | 70 | +35 | **P0**: Build admission SLA instrumentation, autonomous closure evidence |
| D3 | ~62 | 65 | +3 | P2: Add rollback and side-effect governance tests |
| D4 | ~30 | 45 | +15 | P1: Instrument proactive action tracking |
| D5 | ~40 | 50 | +10 | P0: Fix runner paths, schema alignment, add reproducibility tests |
| D6 | ~35 | 55 | +20 | P1: Add L3/L4 cases, failure mode coverage, real dialog ratio |
| D7 | ~25 | 45 | +20 | P1: Instrument failure detection, badcase generation, MTTR tracking |

**Critical path**: D2 (Execution Closure) is the hardest gap to close and has the highest weight. Without significant D2 improvement, SP is unreachable.

---

## Appendix A: Glossary

| Term | Definition |
|---|---|
| **ECCS** | Execution-Chain Complexity Score — per-case difficulty rating (1.0–7.0) |
| **Richness Index** | Composite measure of intent/event/execution diversity (0.0–1.0) |
| **Hard Floor** | Minimum dimension score; violation caps overall verdict |
| **Force Fail** | Condition that immediately sets verdict = FL regardless of scores |
| **Corpus ECCS** | Complexity-weighted pass rate across all cases |
| **IC** | Intent Category (IC1–IC5 as defined in intent taxonomy) |
| **P2E** | Principle-to-Enforcement — the 「言出法随」 capability |
| **AEO** | Agent Effect Operations — evaluation of agent output quality |
| **SLA** | Service Level Agreement — time-bound performance commitment |

---

## Appendix B: Changelog

| Version | Date | Changes |
|---|---|---|
| 1.0.0 | 2026-03-07 | Initial P2E evaluation model (01-evaluation-model.md) |
| 2.0.0 | 2026-03-08 | Complete redesign: 7 dimensions, continuous scoring, ECCS, Richness Index, 5-level verdicts, anti-gaming, claim permissions, machine-readable schema |
