#!/usr/bin/env bash
# ISC Handler: rule.pdca-act-entry-gate-001
# Act阶段入口门禁：验证Check阶段产出存在且评审通过
set -euo pipefail

INPUT="${1:-/dev/stdin}"
PAYLOAD=$(cat "$INPUT" 2>/dev/null || echo "$1")

# Parse fields
CHECK_FINDINGS=$(echo "$PAYLOAD" | jq -r '.task.check_findings // empty' 2>/dev/null)
CHECK_STATUS=$(echo "$PAYLOAD" | jq -r '.task.check_phase_status // .task.phase_status // empty' 2>/dev/null)
CHECK_REVIEW=$(echo "$PAYLOAD" | jq -r '.task.check_review_passed // empty' 2>/dev/null)
CHECK_REPORT=$(echo "$PAYLOAD" | jq -r '.task.check_report // empty' 2>/dev/null)

ERRORS=()

# 1. Check阶段状态必须是done
if [ "$CHECK_STATUS" != "done" ]; then
  ERRORS+=("Check阶段状态不是done，当前状态: ${CHECK_STATUS:-未设置}")
fi

# 如果状态都不对，直接拦截，不走后续判断
if [ ${#ERRORS[@]} -gt 0 ]; then
  jq -n --argjson errors "$(printf '%s\n' "${ERRORS[@]}" | jq -R . | jq -s .)" \
    '{pass: false, gate: "pdca-act-entry", errors: $errors}'
  exit 1
fi

# 2. Check产出(check_findings)必须存在且非空
if [ -z "$CHECK_FINDINGS" ] || [ "$CHECK_FINDINGS" = "null" ] || [ "$CHECK_FINDINGS" = "[]" ]; then
  # 无发现 → 跳过Act直接done
  jq -n '{pass: true, gate: "pdca-act-entry", skip_act: true, reason: "Check阶段无发现，跳过Act直接完成", errors: []}'
  exit 0
fi

# 3. Check评审必须通过
if [ "$CHECK_REVIEW" != "true" ] && [ "$CHECK_REVIEW" != "passed" ]; then
  ERRORS+=("Check阶段评审未通过，当前状态: ${CHECK_REVIEW:-未设置}")
fi

# 4. Check报告必须存在
if [ -z "$CHECK_REPORT" ] || [ "$CHECK_REPORT" = "null" ]; then
  ERRORS+=("Check阶段报告(check_report)不存在")
fi

if [ ${#ERRORS[@]} -gt 0 ]; then
  jq -n --argjson errors "$(printf '%s\n' "${ERRORS[@]}" | jq -R . | jq -s .)" \
    '{pass: false, gate: "pdca-act-entry", errors: $errors}'
  exit 1
fi

jq -n '{pass: true, gate: "pdca-act-entry", skip_act: false, errors: []}'
exit 0
