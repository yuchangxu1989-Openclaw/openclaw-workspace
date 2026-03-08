#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.meta-enforcement-gate-001"
WORKSPACE="/root/.openclaw/workspace"

# 检测: 所有规则是否都有enforcement机制
RULES_DIR="$WORKSPACE/skills/isc-core/rules"
NO_ENFORCE=0
TOTAL=0
for f in "$RULES_DIR"/rule.*.json; do
  TOTAL=$((TOTAL+1))
  HAS=$(python3 -c "import json; d=json.load(open('$f')); print('yes' if d.get('enforcement') or d.get('enforcement_tier') or d.get('action',{}).get('type')=='script' else '')" 2>/dev/null)
  [ -z "$HAS" ] && NO_ENFORCE=$((NO_ENFORCE+1))
done
if [ "$NO_ENFORCE" -gt 0 ]; then
  echo '{"rule_id":"'$RULE_ID'","status":"fail","detail":"'$NO_ENFORCE'/'$TOTAL' rules lack enforcement mechanism"}'
else
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"All '$TOTAL' rules have enforcement mechanism"}'
fi

