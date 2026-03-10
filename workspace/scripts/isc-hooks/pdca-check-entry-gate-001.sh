#!/usr/bin/env bash
# ISC Handler: pdca-check-entry-gate-001
# Check阶段入口：验证Do阶段产出存在且状态为done
set -euo pipefail

INPUT="${1:-/dev/stdin}"
PAYLOAD=$(cat "$INPUT" 2>/dev/null || echo "$1")

# Parse fields
DELIVERABLES=$(echo "$PAYLOAD" | jq -r '.task.deliverables // empty' 2>/dev/null)
DO_STATUS=$(echo "$PAYLOAD" | jq -r '.task.do_phase_status // .task.phase_status // empty' 2>/dev/null)
EVALUATOR=$(echo "$PAYLOAD" | jq -r '.task.evaluator_agent // empty' 2>/dev/null)
EXECUTOR=$(echo "$PAYLOAD" | jq -r '.task.executor_agent // empty' 2>/dev/null)

ERRORS=()

# Check deliverables exist and non-empty
if [ -z "$DELIVERABLES" ] || [ "$DELIVERABLES" = "null" ] || [ "$DELIVERABLES" = "[]" ]; then
  ERRORS+=("Do阶段产出(deliverables)不存在或为空")
fi

# Check do phase status is done
if [ "$DO_STATUS" != "done" ]; then
  ERRORS+=("Do阶段状态不是done，当前状态: ${DO_STATUS:-未设置}")
fi

# Check evaluator != executor (role separation)
if [ -n "$EVALUATOR" ] && [ -n "$EXECUTOR" ] && [ "$EVALUATOR" = "$EXECUTOR" ]; then
  ERRORS+=("评测者与执行者不能为同一agent: $EVALUATOR")
fi

if [ ${#ERRORS[@]} -gt 0 ]; then
  jq -n --argjson errors "$(printf '%s\n' "${ERRORS[@]}" | jq -R . | jq -s .)" \
    '{pass: false, gate: "pdca-check-entry", errors: $errors}'
  exit 1
fi

jq -n '{pass: true, gate: "pdca-check-entry", errors: []}'
exit 0
