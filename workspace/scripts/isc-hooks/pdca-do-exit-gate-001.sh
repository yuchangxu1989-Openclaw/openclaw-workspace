#!/usr/bin/env bash
# ISC Handler: pdca-do-exit-gate-001
# Do阶段出口：验证执行产物已提交且测试通过
set -euo pipefail

INPUT="${1:-/dev/stdin}"
PAYLOAD=$(cat "$INPUT" 2>/dev/null || echo "$1")

DELIVERABLES=$(echo "$PAYLOAD" | jq -r '.task.deliverables // empty' 2>/dev/null)
DELIVERABLES_LEN=$(echo "$PAYLOAD" | jq -r '.task.deliverables | length // 0' 2>/dev/null)
COMMITTED=$(echo "$PAYLOAD" | jq -r '.task.committed // false' 2>/dev/null)
TESTS_PASSED=$(echo "$PAYLOAD" | jq -r '.task.tests_passed // false' 2>/dev/null)

ERRORS=()

if [ -z "$DELIVERABLES" ] || [ "$DELIVERABLES" = "null" ] || [ "$DELIVERABLES_LEN" = "0" ]; then
  ERRORS+=("执行产物(deliverables)为空")
fi

if [ "$COMMITTED" != "true" ]; then
  ERRORS+=("产物未提交(committed≠true)")
fi

if [ "$TESTS_PASSED" != "true" ]; then
  ERRORS+=("测试未通过(tests_passed≠true)")
fi

if [ ${#ERRORS[@]} -gt 0 ]; then
  jq -n --argjson errors "$(printf '%s\n' "${ERRORS[@]}" | jq -R . | jq -s .)" \
    '{pass: false, gate: "pdca-do-exit", errors: $errors}'
  exit 1
fi

jq -n '{pass: true, gate: "pdca-do-exit", errors: []}'
exit 0
