# Closed-Book Gate Validation Results

timestamp: 2026-03-07 15:47 GMT+8
workspace: /root/.openclaw/workspace-analyst

## Deliverables

- principle-e2e-spec/06-gate-criteria.yaml
- principle-e2e-spec/07-runner-integration.md
- principle-e2e-spec/scripts/closed_book_gate.py
- principle-e2e-spec/examples/closed_book_pass.json
- principle-e2e-spec/examples/closed_book_fail_memory.json
- principle-e2e-spec/examples/closed_book_fail_missing_attestation.json
- principle-e2e-spec/README.md (updated)

## Validation Commands

```bash
python3 principle-e2e-spec/scripts/closed_book_gate.py principle-e2e-spec/examples/closed_book_pass.json
python3 principle-e2e-spec/scripts/closed_book_gate.py principle-e2e-spec/examples/closed_book_fail_memory.json
python3 principle-e2e-spec/scripts/closed_book_gate.py principle-e2e-spec/examples/closed_book_fail_missing_attestation.json
```

## Validation Results

### 1) PASS case
- input: `examples/closed_book_pass.json`
- expected: SUCCESS
- actual: SUCCESS
- exit code: 0

### 2) Memory leakage blocked
- input: `examples/closed_book_fail_memory.json`
- expected: FAIL
- actual: FAIL
- exit code: 2
- blocked because:
  - unknown runtime input `memory`
  - denylisted input `memory`
  - `blocked_source_hits.memory != 0`
  - `blocked_source_hits.total != 0`

### 3) Missing attestation blocked (fail-closed)
- input: `examples/closed_book_fail_missing_attestation.json`
- expected: FAIL
- actual: FAIL
- exit code: 3
- blocked because:
  - missing required top-level field `attestation`

## Design Summary

The implementation enforces a unified closed-book gate across LLM eval / P2E / ISC-INTENT-EVAL-001 by requiring:

- explicit `closed_book=true`
- evidence bundle presence
- allowlist-only runtime inputs
- denylist-based leakage blocking for memory / answer / labels
- mandatory redaction before evaluation
- audit completeness
- fail-closed on any missing or unknown field

## Security Posture

- default: deny
- unknown input: deny
- missing evidence: deny
- any blocked source hit: deny
- any redaction miss: deny

Conclusion: minimal implementation completed and verified.
