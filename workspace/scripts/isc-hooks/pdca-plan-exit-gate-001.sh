#!/usr/bin/env bash
# ISC Handler: pdca-plan-exit-gate-001
# Plan阶段出口：验证计划文档已产出且评审通过
set -euo pipefail

INPUT="${1:-/dev/stdin}"
PAYLOAD=$(cat "$INPUT" 2>/dev/null || echo "$1")

GOAL=$(echo "$PAYLOAD" | jq -r '.task.goal // empty' 2>/dev/null)
DEADLINE=$(echo "$PAYLOAD" | jq -r '.task.deadline // empty' 2>/dev/null)
COST_BOUNDARY=$(echo "$PAYLOAD" | jq -r '.task.cost_boundary // empty' 2>/dev/null)
ACCEPTANCE=$(echo "$PAYLOAD" | jq -r '.task.acceptance_criteria // empty' 2>/dev/null)
REVIEW_PASSED=$(echo "$PAYLOAD" | jq -r '.task.review_passed // false' 2>/dev/null)

ERRORS=()
MISSING=()

[ -z "$GOAL" ] || [ "$GOAL" = "null" ] && MISSING+=("goal")
[ -z "$DEADLINE" ] || [ "$DEADLINE" = "null" ] && MISSING+=("deadline")
[ -z "$COST_BOUNDARY" ] || [ "$COST_BOUNDARY" = "null" ] && MISSING+=("cost_boundary")
[ -z "$ACCEPTANCE" ] || [ "$ACCEPTANCE" = "null" ] && MISSING+=("acceptance_criteria")

if [ ${#MISSING[@]} -gt 0 ]; then
  ERRORS+=("计划文档缺失字段: $(IFS=,; echo "${MISSING[*]}")")
fi

if [ "$REVIEW_PASSED" != "true" ]; then
  ERRORS+=("评审未通过(review_passed≠true)")
fi

if [ ${#ERRORS[@]} -gt 0 ]; then
  jq -n --argjson errors "$(printf '%s\n' "${ERRORS[@]}" | jq -R . | jq -s .)" \
    '{pass: false, gate: "pdca-plan-exit", errors: $errors}'
  exit 1
fi

jq -n '{pass: true, gate: "pdca-plan-exit", errors: []}'
exit 0
