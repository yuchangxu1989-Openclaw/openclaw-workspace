#!/usr/bin/env bash
# ISC Handler: pdca-check-exit-gate-001
# Check阶段出口：验证检查报告已生成且指标已记录
set -euo pipefail

INPUT="${1:-/dev/stdin}"
PAYLOAD=$(cat "$INPUT" 2>/dev/null || echo "$1")

CHECK_REPORT=$(echo "$PAYLOAD" | jq -r '.task.check_report // empty' 2>/dev/null)
METRICS=$(echo "$PAYLOAD" | jq -r '.task.metrics // empty' 2>/dev/null)

ERRORS=()

if [ -z "$CHECK_REPORT" ] || [ "$CHECK_REPORT" = "null" ]; then
  ERRORS+=("检查报告(check_report)未生成")
fi

if [ -z "$METRICS" ] || [ "$METRICS" = "null" ] || [ "$METRICS" = "{}" ] || [ "$METRICS" = "[]" ]; then
  ERRORS+=("指标(metrics)未记录")
fi

if [ ${#ERRORS[@]} -gt 0 ]; then
  jq -n --argjson errors "$(printf '%s\n' "${ERRORS[@]}" | jq -R . | jq -s .)" \
    '{pass: false, gate: "pdca-check-exit", errors: $errors}'
  exit 1
fi

jq -n '{pass: true, gate: "pdca-check-exit", errors: []}'
exit 0
