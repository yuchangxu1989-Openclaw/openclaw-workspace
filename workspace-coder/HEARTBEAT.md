# HEARTBEAT.md

# Keep this file empty (or with only comments) to skip heartbeat API calls.

# Add tasks below when you want the agent to check something periodically.

## Periodic Checks

### ISC-INTENT-EVAL-001 Gate Integrity (weekly)
- Verify `.openclaw/gate_intent_eval.py` exists and is executable
- Verify `.openclaw/isc-intent-eval-rule.md` exists
- Verify `skills/architecture-review-pipeline/SKILL.md` references the gate
- Verify AGENTS.md contains ISC-INTENT-EVAL-001 section
- Run `bash .openclaw/tests/run_tests.sh` — all 6 tests must pass
- If any check fails: alert immediately, do not wait for next heartbeat
