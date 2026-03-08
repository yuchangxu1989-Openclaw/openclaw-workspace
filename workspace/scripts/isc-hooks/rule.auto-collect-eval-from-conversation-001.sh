#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.auto-collect-eval-from-conversation-001"
TRANSCRIPT="${1:-}"
STATUS="pass"
DETAIL="eval auto-collection hook checked"
if [[ -n "$TRANSCRIPT" && -f "$TRANSCRIPT" ]]; then
  if grep -Eqi '(评估|eval|评分|feedback|打分)' "$TRANSCRIPT"; then
    DETAIL="conversation contains eval signals; eligible for auto-collect"
  else
    STATUS="fail"
    DETAIL="no eval signal found in conversation"
  fi
else
  DETAIL="TODO: integrate with runtime conversation stream"
fi
printf '{"rule_id":"%s","status":"%s","detail":"%s"}\n' "$RULE_ID" "$STATUS" "$DETAIL"
