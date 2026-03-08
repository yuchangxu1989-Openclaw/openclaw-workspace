#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.umr-intent-routing-001"
ROOT="/root/.openclaw/workspace"
RULE_FILE="$ROOT/skills/isc-core/rules/rule.umr-intent-routing-001.json"
STATUS="pass"
DETAIL="skeleton check passed"
if [[ ! -f "$RULE_FILE" ]]; then
  STATUS="fail"
  DETAIL="rule file missing: $RULE_FILE"
else
  # TODO: implement full semantic enforcement for $RULE_ID
  if ! grep -q '"action"' "$RULE_FILE"; then
    STATUS="fail"
    DETAIL="rule action field missing"
  fi
fi
printf '{"rule_id":"%s","status":"%s","detail":"%s"}
' "$RULE_ID" "$STATUS" "$DETAIL"
