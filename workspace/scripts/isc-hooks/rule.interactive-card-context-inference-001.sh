#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.interactive-card-context-inference-001"
PAYLOAD="${1:-}"
STATUS="pass"
DETAIL="interactive card context inference checked"
if [[ -n "$PAYLOAD" && -f "$PAYLOAD" ]]; then
  if jq -e '.context // .conversation_id // .thread_id' "$PAYLOAD" >/dev/null 2>&1; then
    DETAIL="context fields detected for card inference"
  else
    STATUS="fail"
    DETAIL="missing context/thread linkage fields"
  fi
else
  DETAIL="TODO: bind to card callback payload"
fi
printf '{"rule_id":"%s","status":"%s","detail":"%s"}\n' "$RULE_ID" "$STATUS" "$DETAIL"
