#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.intent-directive-consumption-001"
RULE_FILE="skills/isc-core/rules/rule.intent-directive-consumption-001.json"
DETAIL="ok"
STATUS="pass"
if [ ! -f "$RULE_FILE" ]; then
  STATUS="fail"
  DETAIL="rule file missing: $RULE_FILE"
else
  # TODO: implement rule-specific runtime checks by inspecting dispatcher logs / context files.
  # skeleton: verify rule metadata exists and file is valid json.
  if ! python3 - <<'PY2' "$RULE_FILE" >/dev/null 2>&1
import json,sys
json.load(open(sys.argv[1],'r',encoding='utf-8'))
PY2
  then
    STATUS="fail"
    DETAIL="invalid json in $RULE_FILE"
  fi
fi
printf '{"rule_id":"%s","status":"%s","detail":"%s"}
' "$RULE_ID" "$STATUS" "$DETAIL"
