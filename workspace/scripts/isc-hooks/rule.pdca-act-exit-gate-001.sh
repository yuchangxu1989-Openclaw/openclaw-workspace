#!/usr/bin/env bash
# Handler: ISC-PDCA-ACT-EXIT-GATE-001
# PDCA Act阶段出口门禁
# 验证：行动已落地 + 改进措施已记录 + 效果已验证
# stdin: JSON  stdout: JSON  exit: 0=pass 1=block 2=error

set -euo pipefail

INPUT=$(cat)

# jq available check
if ! command -v jq &>/dev/null; then
  echo '{"pass":false,"code":"ENV_ERROR","message":"jq not installed"}'
  exit 2
fi

# Extract improvement_actions array
ACTIONS=$(echo "$INPUT" | jq -c '.task.improvement_actions // []')
COUNT=$(echo "$ACTIONS" | jq 'length')

# Gate 1: must have at least one improvement action
if [ "$COUNT" -eq 0 ]; then
  echo '{"pass":false,"code":"NO_ACTIONS","message":"Act阶段无改进措施记录，不允许退出"}'
  exit 1
fi

FAILURES="[]"

for i in $(seq 0 $((COUNT - 1))); do
  ACTION=$(echo "$ACTIONS" | jq -c ".[$i]")
  NAME=$(echo "$ACTION" | jq -r '.name // .description // ("action_" + "'$i'")')

  # Gate 2: 行动已落地 — must have commit_hash or rule_id
  HAS_COMMIT=$(echo "$ACTION" | jq -r '.commit_hash // empty')
  HAS_RULE=$(echo "$ACTION" | jq -r '.rule_id // empty')
  if [ -z "$HAS_COMMIT" ] && [ -z "$HAS_RULE" ]; then
    FAILURES=$(echo "$FAILURES" | jq -c ". + [{\"action\":\"$NAME\",\"reason\":\"无commit_hash或rule_id，行动未落地到代码/规则\"}]")
    continue
  fi

  # Gate 3: 改进措施已记录 — must have description or summary
  HAS_DESC=$(echo "$ACTION" | jq -r '.description // .summary // empty')
  if [ -z "$HAS_DESC" ]; then
    FAILURES=$(echo "$FAILURES" | jq -c ". + [{\"action\":\"$NAME\",\"reason\":\"改进措施缺少description/summary记录\"}]")
    continue
  fi

  # Gate 4: 效果已验证 — must have verified=true or verification_result
  VERIFIED=$(echo "$ACTION" | jq -r '.verified // false')
  HAS_VERIFY_RESULT=$(echo "$ACTION" | jq -r '.verification_result // empty')
  if [ "$VERIFIED" != "true" ] && [ -z "$HAS_VERIFY_RESULT" ]; then
    FAILURES=$(echo "$FAILURES" | jq -c ". + [{\"action\":\"$NAME\",\"reason\":\"效果未验证(verified!=true且无verification_result)\"}]")
  fi
done

FAIL_COUNT=$(echo "$FAILURES" | jq 'length')

if [ "$FAIL_COUNT" -gt 0 ]; then
  jq -nc --argjson failures "$FAILURES" '{
    pass: false,
    code: "ACT_EXIT_BLOCKED",
    message: "Act阶段出口门禁未通过：部分改进措施未满足落地/记录/验证要求",
    total_actions: '"$COUNT"',
    failed_count: '"$FAIL_COUNT"',
    failures: $failures
  }'
  exit 1
fi

jq -nc '{
  pass: true,
  code: "ACT_EXIT_PASS",
  message: "Act阶段出口门禁通过：所有改进措施已落地、已记录、已验证",
  total_actions: '"$COUNT"'
}'
exit 0
