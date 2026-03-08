# Principle-to-Enforcement E2E Report

- Source: `/root/.openclaw/workspace-coder/sandbox/principle_enforcement_e2e/tests/fail_case.json`
- Intent: `unknown` (0.35)
- Final Status: **FAIL**
- Release Decision: **BLOCK**

## Intent Basis
- LLM as primary: `True`
- insufficient joint evidence for both principle/ruling/constraint and enforcement/gate semantics

## Autonomy Expansion Chain
- ❌ `intent` status=`FAIL` present=`True`
- ✅ `event` status=`PASS` present=`True`
- ✅ `isc` status=`PASS` present=`True`
- ✅ `dto` status=`PASS` present=`True`
- ✅ `cras` status=`PASS` present=`True`
- ✅ `aeo` status=`PASS` present=`True`
- ✅ `lep` status=`PASS` present=`True`
- ✅ `test` status=`PASS` present=`True`
- ❌ `gate` status=`FAIL` present=`True`
- ❌ `release` status=`BLOCKED` present=`True`

## Gate
- Recommendation: 通过
- Failure: FAIL-CLOSED: no LLM intent-recognition foundation, cannot report pass.
