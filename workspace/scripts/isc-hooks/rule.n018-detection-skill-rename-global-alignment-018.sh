#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.n018-detection-skill-rename-global-alignment-018"
WORKSPACE="/root/.openclaw/workspace"

# 检测: 技能引用是否存在断链(引用了不存在的技能路径)
BROKEN=0
CHECKED=0
for f in "$WORKSPACE"/skills/isc-core/rules/rule.*.json; do
  CHECKED=$((CHECKED+1))
  PATHS=$(python3 -c "
import json,re
d=json.load(open('$f'))
s=json.dumps(d)
paths=re.findall(r'skills/[a-zA-Z0-9_-]+/SKILL\.md', s)
for p in paths:
  print(p)
" 2>/dev/null)
  for p in $PATHS; do
    [ ! -f "$WORKSPACE/$p" ] && BROKEN=$((BROKEN+1))
  done
done
if [ "$BROKEN" -gt 0 ]; then
  echo '{"rule_id":"'$RULE_ID'","status":"fail","detail":"'$BROKEN' broken skill path references found"}'
else
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"All skill path references valid (checked '$CHECKED' rules)"}'
fi

