#!/usr/bin/env bash
# ISC Hook: rule.intent-ic4-ic5-boundary-001 — IC4/IC5意图边界判定
# 检测意图分类规则定义是否完整（定义、示例、判定逻辑）
set -euo pipefail
RULE_ID="rule.intent-ic4-ic5-boundary-001"
WORKSPACE="${WORKSPACE:-/root/.openclaw/workspace}"
RULE_FILE="$WORKSPACE/skills/isc-core/rules/rule.intent-ic4-ic5-boundary-001.json"

if [ ! -f "$RULE_FILE" ]; then
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"fail\", \"detail\":\"Rule definition file not found\"}"
  exit 1
fi

# 检查规则JSON中必须包含的关键字段
REQUIRED_FIELDS=("definitions" "decision_rule" "badcases")
MISSING=()
for field in "${REQUIRED_FIELDS[@]}"; do
  if ! grep -q "\"$field\"" "$RULE_FILE"; then
    MISSING+=("$field")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"fail\", \"detail\":\"Missing required fields: ${MISSING[*]}\"}"
  exit 1
fi

# 检查是否有badcase覆盖
BADCASE_COUNT=$(python3 -c "import json; d=json.load(open('$RULE_FILE')); print(len(d.get('badcases',[])))" 2>/dev/null || echo 0)
if [ "$BADCASE_COUNT" -lt 1 ]; then
  echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"fail\", \"detail\":\"No badcases defined for boundary validation\"}"
  exit 1
fi

echo "{\"rule_id\":\"$RULE_ID\", \"status\":\"pass\", \"detail\":\"IC4/IC5 boundary rule complete with $BADCASE_COUNT badcases\"}"
exit 0
