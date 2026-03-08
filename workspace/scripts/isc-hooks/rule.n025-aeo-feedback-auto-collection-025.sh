#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.n025-aeo-feedback-auto-collection-025"
INPUT="${1:-}"
STATUS="pass"
DETAIL="aeo feedback collection checked"
if [[ -n "$INPUT" && -f "$INPUT" ]]; then
  if grep -Eqi '(feedback|建议|满意|不满意|评价|aeo)' "$INPUT"; then
    DETAIL="feedback indicators found for auto collection"
  else
    STATUS="fail"
    DETAIL="no feedback indicator found"
  fi
else
  DETAIL="TODO: connect to AEO post-response callback"
fi
printf '{"rule_id":"%s","status":"%s","detail":"%s"}\n' "$RULE_ID" "$STATUS" "$DETAIL"
