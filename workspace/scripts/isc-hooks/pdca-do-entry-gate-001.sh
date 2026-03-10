#!/usr/bin/env bash
# ISC Handler: pdca-do-entry-gate-001
# Do阶段入口：验证Plan已通过审批且资源已就绪
set -euo pipefail

INPUT="${1:-/dev/stdin}"
PAYLOAD=$(cat "$INPUT" 2>/dev/null || echo "$1")

PLAN_EXIT_PASSED=$(echo "$PAYLOAD" | jq -r '.task.plan_exit_passed // false' 2>/dev/null)
RESOURCES_READY=$(echo "$PAYLOAD" | jq -r '.task.resources_ready // false' 2>/dev/null)

ERRORS=()

if [ "$PLAN_EXIT_PASSED" != "true" ]; then
  ERRORS+=("Plan阶段未通过审批(plan_exit_passed≠true)")
fi

if [ "$RESOURCES_READY" != "true" ]; then
  ERRORS+=("资源未就绪(resources_ready≠true)")
fi

if [ ${#ERRORS[@]} -gt 0 ]; then
  jq -n --argjson errors "$(printf '%s\n' "${ERRORS[@]}" | jq -R . | jq -s .)" \
    '{pass: false, gate: "pdca-do-entry", errors: $errors}'
  exit 1
fi

jq -n '{pass: true, gate: "pdca-do-entry", errors: []}'
exit 0
