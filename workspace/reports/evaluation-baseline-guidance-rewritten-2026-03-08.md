# Evaluation Baseline Guidance

**Purpose**: define the baseline metrics, rules, and example verdicts for user-facing evaluation.

**Scope**: workspace-only evaluation guidance. This document does **not** change runtime config and does **not** imply full acceptance by itself.

---

## Chapter 1. Metrics

### 1.1 Top 3 north-star metrics

#### Metric 1 — Prepared Refresh Coverage
- **Numeric target**: **100%**
- **Calculation formula**:  
  `prepared_refresh_coverage = prepared_for_refresh_cases / total_unique_cases`
- **Current evidence**: `17 / 17 = 100%`
- **Why it matters**: all baseline cases are actually prepared for refresh; no cases are left outside the refresh path.

#### Metric 2 — Real-Dialog + High-Rigor Share
- **Numeric target**: **100%**
- **Calculation formula**:  
  `real_dialog_high_rigor_share = real_dialog_high_rigor_cases / total_unique_cases`
- **Current evidence**: `17 / 17 = 100%`
- **Why it matters**: the baseline must be built from real-dialog evidence and kept at high-rigor standard, not synthetic-only cases.

#### Metric 3 — Strong/Partial Real-Conversation Coverage
- **Numeric target**: **>= 36.4%**
- **Calculation formula**:  
  `strong_partial_real_conv_coverage = (strong_case_count + partial_case_count) / total_cases`
- **Current evidence**: `(3 + 1) / 11 = 4 / 11 = 36.4%`
- **Why it matters**: proves real recent conversations are mapping into the evalset with non-trivial quality, instead of only weak matches.

### 1.2 Process metrics

#### Metric 4 — Ledger Selection Rate
- **Numeric target**: **>= 50%**
- **Calculation formula**:  
  `ledger_selection_rate = selected_count / candidate_count`
- **Current evidence**: `4 / 7 = 57.1%`
- **Interpretation rule**: the ledger is active and selecting meaningful recent conversations into the evaluation path.

#### Metric 5 — Ledger Freshness
- **Numeric target**: **<= 24h**
- **Calculation formula**:  
  `ledger_freshness_hours = computed_at - freshest_conversation_at`
- **Current evidence**: freshest conversation falls inside the reported last-24h window.
- **Interpretation rule**: if freshness exceeds 24h, treat the baseline as stale for user-facing claims.

#### Metric 6 — Strict Autonomy Evidence Completeness
- **Numeric target**: **9 / 9 required evidence flags** for any case claimed as strict end-to-end autonomy pass
- **Calculation formula**:  
  `strict_evidence_completeness = satisfied_required_flags / 9`
- **Required flags**:  
  `request_observed, admitted, plan_materialized, execution_attempted, external_effect_verified, completion_verified, on_failure_badcase_written, audit_trace_present, no_hidden_manual_patch`
- **Interpretation rule**: if the result is below `9/9`, verdict must remain `fail` or `insufficient_evidence`, never `strict pass`.

#### Metric 7 — Capability Distribution Completeness
- **Numeric target**: **7 / 7 covered capabilities present in refresh set**
- **Calculation formula**:  
  `capability_distribution_completeness = covered_capability_types / required_capability_types`
- **Current evidence**: `7 / 7 = 100%` across `intent_expansion, event_completion, task_expansion, rca_analysis, gap_assessment, fix_proposal, dispatch_verification`
- **Interpretation rule**: do not call the baseline complete if one of the required capability groups is missing.

---

## Chapter 2. Evaluation principles and rules

### 2.1 Core principles

1. **Metrics first, narrative second.**  
   Start with measurable pass/fail status. Use prose only to explain the metrics.

2. **Feature progress is not acceptance.**  
   A feature can look improved while the evaluation chain is still incomplete or unreliable.

3. **Real-dialog evidence is preferred.**  
   Baseline cases should come from real conversations whenever possible.

4. **Fail closed on missing evidence.**  
   Missing proof is not partial proof. If a required artifact is absent, do not upgrade the verdict.

5. **One metric, one formula.**  
   Every user-facing metric must have a plain numeric target and an explicit formula.

### 2.2 Verdict rules

#### Rule A — When the baseline can be called healthy
Call the baseline **healthy** only when all of the following are true:
- prepared refresh coverage = `100%`
- real-dialog + high-rigor share = `100%`
- ledger freshness is within `24h`
- ledger selection rate meets target
- all required capability groups are present

#### Rule B — When the baseline is only partially healthy
Call the baseline **partial** when:
- refresh coverage is complete, but
- real-conversation mapping quality is still limited, or
- freshness/selection is acceptable but not strong enough for broad confidence, or
- evidence exists but some claims still cannot be upgraded to a pass verdict.

#### Rule C — When strict autonomy claims are allowed
Call a case **strict end-to-end autonomy proven** only when `strict_evidence_completeness = 9/9` for that same case.

If any required flag is missing, the verdict must be:
- `fail`, or
- `insufficient_evidence`

#### Rule D — What must never be claimed
Do **not** claim any of the following without metric support:
- “fully accepted”
- “strict autonomy proven”
- “complete coverage”
- “production-ready evaluation closure”

### 2.3 Evidence rules

1. **Prefer generated artifacts over recollection.**  
   Cite reports, ledgers, refresh summaries, and machine-readable snapshots.

2. **Use the latest canonical artifact for each metric.**  
   Do not mix old narrative wording with newer metric outputs if they conflict.

3. **Separate baseline health from case-level verdicts.**  
   A strong baseline does not automatically mean every case passes.

4. **Separate coverage from correctness.**  
   A case being present in the refresh path is not the same as the case being solved correctly.

---

## Chapter 3. Golden evaluation case examples

### Example 1 — Full metric pass for baseline refresh
**Observed evidence**:
- `prepared_for_refresh_cases = 17`
- `total_unique_cases = 17`
- `real_dialog_high_rigor_cases = 17`
- `required_capability_types = 7`
- `covered_capability_types = 7`

**Calculated metrics**:
- refresh coverage = `17/17 = 100%`
- real-dialog + high-rigor share = `17/17 = 100%`
- capability distribution completeness = `7/7 = 100%`

**Verdict**: **baseline refresh path passes**

**Reason**: the refresh set is complete, high-rigor, real-dialog grounded, and capability-balanced.

### Example 2 — Partial pass for real-conversation coverage
**Observed evidence**:
- `strong_case_count = 3`
- `partial_case_count = 1`
- `total_cases = 11`

**Calculated metric**:
- strong/partial real-conv coverage = `(3 + 1) / 11 = 36.4%`

**Verdict**: **partial pass**

**Reason**: real recent conversations are reaching the evalset with meaningful matches, but most cases are still weakly matched, so broad coverage claims would be premature.

### Example 3 — Ledger active but not enough for overclaiming
**Observed evidence**:
- `candidate_count = 7`
- `selected_count = 4`
- `dropped_count = 3`
- freshest conversation is within the last-24h window

**Calculated metric**:
- ledger selection rate = `4 / 7 = 57.1%`

**Verdict**: **process healthy, claim scope still limited**

**Reason**: the ingestion and selection loop is alive and recent, but that alone does not prove every capability or every case is solved.

### Example 4 — Strict autonomy must fail closed
**Observed evidence**:
- strict snapshot checker exists
- sample failing snapshot remains `insufficient_evidence`
- multiple required evidence flags remain false

**Calculated metric**:
- strict evidence completeness `< 9/9`

**Verdict**: **not strict pass**

**Reason**: a strict autonomy claim requires every required evidence flag for the same case. Missing artifacts force a non-pass verdict.

---

## Chapter 4. Supplemental info

### Source artifacts used for this baseline
- `reports/evalset-batch-refresh-report.md`
- `reports/evalset-batch-refresh-report.json`
- `reports/real-conv-evalset-coverage-report.md`
- `reports/real-conv-evalset-coverage-report.json`
- `reports/last24h-ledger-report.md`
- `reports/strict-global-autonomy-evidence-review-2026-03-08.md`

### Writing standard for future updates
When updating this document:
- keep Chapter 1 first
- keep every metric tied to a number and formula
- keep rules short and enforceable
- add examples only if they show a concrete pass/partial/fail decision
- avoid long overview sections before the metrics

---

## Structural rewrite summary

### What changed
- Replaced the old grand-overview narrative with a **4-chapter user-facing structure**.
- Moved **metrics to Chapter 1** and split them into:
  - **Top 3 north-star metrics**
  - **Process metrics**
- Rewrote principles into **short rules with explicit claim boundaries**.
- Converted abstract discussion into **golden pass/partial/fail examples** with formulas.
- Reduced background narration and made the document **Feishu-sync ready**.

### Where the prior version was too verbose or poorly prioritized
- It started with a long status narrative before giving measurable standards.
- It mixed **verdict framing, objections, evidence mapping, and next actions** before clearly defining success metrics.
- It repeated similar ideas in multiple sections, especially around “partial, not done” and “real progress but not full closure.”
- It was optimized for reconciliation and debate, not for a user quickly needing:
  1. what metrics matter,
  2. what the pass rules are,
  3. what a good example looks like.
- It used too much abstract framing before concrete formulas, making it harder to reuse as a standing baseline guidance doc.
