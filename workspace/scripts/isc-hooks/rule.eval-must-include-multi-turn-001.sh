#!/usr/bin/env bash
# ISC Hook: rule.eval-must-include-multi-turn-001
# Description: IC3-IC5意图本质依赖上下文，单轮评测无法验证真实能力。评测集必须同时包含单轮和多轮格式，多轮样本占比不低于40%。任何评测集变更必须自动触发benchma
set -euo pipefail
RULE_ID="rule.eval-must-include-multi-turn-001"

# Check: eval datasets include multi-turn samples (>= 40%)
EVAL_DIR="/root/.openclaw/workspace/eval"
if [ -d "$EVAL_DIR" ]; then
  for ef in "$EVAL_DIR"/*.json; do
    [ -f "$ef" ] || continue
    MULTI=$(python3 -c "
import json,sys
try:
  d=json.load(open('$ef'))
  items=d if isinstance(d,list) else d.get('samples',d.get('data',[]))
  total=len(items)
  multi=sum(1 for i in items if isinstance(i,dict) and len(i.get('turns',i.get('messages',[])))>1)
  ratio=multi/total if total>0 else 0
  print(f'{ratio:.2f}|{multi}|{total}')
except: print('0|0|0')
" 2>/dev/null)
    RATIO=$(echo "$MULTI" | cut -d'|' -f1)
    if [ "$(echo "$RATIO < 0.40" | bc 2>/dev/null)" = "1" ]; then
      echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"Multi-turn ratio $RATIO < 0.40 in $(basename $ef)\"}"
      exit 0
    fi
  done
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"All eval datasets meet multi-turn threshold\"}"
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"No eval directory\"}"
fi
