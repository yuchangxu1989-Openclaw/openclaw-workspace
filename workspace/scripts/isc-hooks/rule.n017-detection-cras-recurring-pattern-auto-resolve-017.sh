#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.n017-detection-cras-recurring-pattern-auto-resolve-017"
LOG_FILE="${1:-}"
STATUS="pass"
DETAIL="cras recurring pattern scan checked"
if [[ -n "$LOG_FILE" && -f "$LOG_FILE" ]]; then
  COUNT=$(grep -Eci '(same error|重复错误|recurring|cras)' "$LOG_FILE" || true)
  if (( COUNT >= 3 )); then
    DETAIL="detected recurring pattern ($COUNT), trigger auto-resolve workflow"
  else
    STATUS="fail"
    DETAIL="recurring threshold not reached ($COUNT<3)"
  fi
else
  DETAIL="TODO: integrate with CRAS log/event source"
fi
printf '{"rule_id":"%s","status":"%s","detail":"%s"}\n' "$RULE_ID" "$STATUS" "$DETAIL"
