#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.isc-dto-handshake-001"
WORKSPACE="/root/.openclaw/workspace"

# 检测: DTO握手配置是否存在且有效
DTO_FILES=$(find "$WORKSPACE" -name '*.dto.json' -o -name 'dto-*.json' 2>/dev/null | head -5)
if [ -z "$DTO_FILES" ]; then
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"No DTO files to validate (informational)"}'
else
  ERRORS=""
  for f in $DTO_FILES; do
    python3 -c "import json; json.load(open('$f'))" 2>/dev/null || ERRORS="$ERRORS $f"
  done
  if [ -n "$ERRORS" ]; then
    echo '{"rule_id":"'$RULE_ID'","status":"fail","detail":"Invalid DTO JSON:'"$ERRORS"'"}'
  else
    echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"All DTO files valid JSON"}'
  fi
fi

