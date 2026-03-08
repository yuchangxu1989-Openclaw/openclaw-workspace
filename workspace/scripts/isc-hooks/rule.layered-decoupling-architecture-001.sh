#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.layered-decoupling-architecture-001"
WORKSPACE="/root/.openclaw/workspace"

# 检测: 规则是否标注了三层归属(感知/认知/执行)
RULES_DIR="$WORKSPACE/skills/isc-core/rules"
MISSING=0
TOTAL=0
for f in "$RULES_DIR"/rule.*.json; do
  TOTAL=$((TOTAL+1))
  HAS=$(python3 -c "
import json
d=json.load(open('$f'))
s=json.dumps(d)
if '感知' in s or 'perception' in s.lower():
  if '认知' in s or 'cognition' in s.lower():
    if '执行' in s or 'execution' in s.lower():
      print('ok')
" 2>/dev/null)
  [ -z "$HAS" ] && MISSING=$((MISSING+1))
done
if [ "$MISSING" -gt "$((TOTAL/2))" ]; then
  echo '{"rule_id":"'$RULE_ID'","status":"fail","detail":"'$MISSING'/'$TOTAL' rules lack explicit 3-layer attribution"}'
else
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"'$((TOTAL-MISSING))'/'$TOTAL' rules have 3-layer attribution"}'
fi

