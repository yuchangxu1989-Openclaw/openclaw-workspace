#!/usr/bin/env bash
# ISC Handler: pdca-plan-entry-gate-001
# Plan阶段入口：验证需求输入完整且目标明确
set -euo pipefail

INPUT="${1:-/dev/stdin}"
PAYLOAD=$(cat "$INPUT" 2>/dev/null || echo "$1")

SOURCE=$(echo "$PAYLOAD" | jq -r '.task.source // empty' 2>/dev/null)
GOAL=$(echo "$PAYLOAD" | jq -r '.task.goal // empty' 2>/dev/null)
REQUIREMENTS=$(echo "$PAYLOAD" | jq -r '.task.requirements // empty' 2>/dev/null)

ERRORS=()

# Validate source legitimacy
VALID_SOURCES="user_command isc_rule event_driven"
if [ -z "$SOURCE" ]; then
  ERRORS+=("任务来源(source)未指定")
elif ! echo "$VALID_SOURCES" | grep -qw "$SOURCE"; then
  ERRORS+=("任务来源不合法: $SOURCE (允许: user_command, isc_rule, event_driven)")
fi

# Validate requirements present
if [ -z "$REQUIREMENTS" ] || [ "$REQUIREMENTS" = "null" ]; then
  ERRORS+=("需求输入(requirements)不完整或缺失")
fi

# Validate goal present
if [ -z "$GOAL" ] || [ "$GOAL" = "null" ]; then
  ERRORS+=("目标(goal)未明确")
fi

if [ ${#ERRORS[@]} -gt 0 ]; then
  jq -n --argjson errors "$(printf '%s\n' "${ERRORS[@]}" | jq -R . | jq -s .)" \
    '{pass: false, gate: "pdca-plan-entry", errors: $errors}'
  exit 1
fi

jq -n '{pass: true, gate: "pdca-plan-entry", errors: []}'
exit 0
