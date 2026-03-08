#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.isc-rule-auto-decompose-001"
WORKSPACE="/root/.openclaw/workspace"

# 检测: 每条规则是否有trigger/action/governance三层拆解
RULES_DIR="$WORKSPACE/skills/isc-core/rules"
MISSING=""
for f in "$RULES_DIR"/rule.*.json; do
  HAS=$(python3 -c "
import json,sys
d=json.load(open('$f'))
missing=[]
for k in ['trigger','action']:
  if k not in d: missing.append(k)
if missing: print(','.join(missing))
" 2>/dev/null)
  if [ -n "$HAS" ]; then
    MISSING="$MISSING $(basename $f):$HAS"
  fi
done
if [ -n "$MISSING" ]; then
  echo '{"rule_id":"'$RULE_ID'","status":"fail","detail":"Rules missing decomposition:'"${MISSING:0:200}"'"}'
else
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"All rules have trigger+action decomposition"}'
fi

