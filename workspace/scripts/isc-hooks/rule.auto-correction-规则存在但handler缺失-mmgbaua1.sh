#!/usr/bin/env bash
# ISC Hook: rule.auto-correction-规则存在但handler缺失-mmgbaua1
# Description: 自动纠偏规则。根因: 缺少对应ISC规则。原始缺陷: 规则存在但handler缺失，应该自动创建handler并补验证
set -euo pipefail
RULE_ID="rule.auto-correction-规则存在但handler缺失-mmgbaua1"

# Check: every rule with action.handler has a corresponding handler file/script
RULES_PATH="/root/.openclaw/workspace/skills/isc-core/rules"
MISSING=0
CHECKED=0
DETAILS=""
for rf in "$RULES_PATH"/rule.*.json; do
  HANDLER=$(python3 -c "import json;d=json.load(open('$rf'));h=d.get('action',{});print(h.get('handler','')if isinstance(h,dict) else '')" 2>/dev/null)
  if [ -n "$HANDLER" ]; then
    CHECKED=$((CHECKED+1))
    # Check if handler script exists in hooks
    if [ ! -f "/root/.openclaw/workspace/scripts/isc-hooks/${HANDLER}.sh" ] && [ ! -f "/root/.openclaw/workspace/scripts/${HANDLER}.sh" ]; then
      MISSING=$((MISSING+1))
      DETAILS="$DETAILS $HANDLER"
    fi
  fi
done
if [ "$MISSING" -gt 0 ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"$MISSING handler(s) missing:$DETAILS\"}"
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"All $CHECKED handlers have scripts\"}"
fi
