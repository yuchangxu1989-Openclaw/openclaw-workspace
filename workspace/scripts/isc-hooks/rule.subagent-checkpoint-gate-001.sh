#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.subagent-checkpoint-gate-001"
STATE="${1:-}"
STATUS="pass"
DETAIL="subagent checkpoint gate checked"
if [[ -n "$STATE" && -f "$STATE" ]]; then
  if jq -e '.checkpoint // .milestone // .handoff' "$STATE" >/dev/null 2>&1; then
    DETAIL="checkpoint evidence found"
  else
    STATUS="fail"
    DETAIL="missing checkpoint/milestone evidence"
  fi
else
  DETAIL="TODO: wire to subagent runtime state store"
fi
printf '{"rule_id":"%s","status":"%s","detail":"%s"}\n' "$RULE_ID" "$STATUS" "$DETAIL"
