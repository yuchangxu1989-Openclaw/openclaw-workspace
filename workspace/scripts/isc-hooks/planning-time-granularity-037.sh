#!/usr/bin/env bash
# ISC Handler: planning-time-granularity-037
# 时间粒度检查：扫描任务定义中的时间估算是否超过合理范围（>8h单任务告警）
set -euo pipefail

INPUT="${1:-/dev/stdin}"
PAYLOAD=$(cat "$INPUT" 2>/dev/null || echo "$1")

MAX_HOURS=8
WARNINGS=()

# Check estimated_hours field
EST_HOURS=$(echo "$PAYLOAD" | jq -r '.task.estimated_hours // empty' 2>/dev/null)
if [ -n "$EST_HOURS" ] && [ "$EST_HOURS" != "null" ]; then
  if (( $(echo "$EST_HOURS > $MAX_HOURS" | bc -l 2>/dev/null || echo 0) )); then
    WARNINGS+=("单任务估时${EST_HOURS}h超过${MAX_HOURS}h上限，需拆分")
  fi
fi

# Check subtasks for individual time estimates
SUBTASK_VIOLATIONS=$(echo "$PAYLOAD" | jq -r '
  [.task.subtasks // [] | .[] |
   select((.estimated_hours // 0) > 8) |
   "\(.name // .id): \(.estimated_hours)h"] | .[]' 2>/dev/null || true)

while IFS= read -r line; do
  [ -n "$line" ] && WARNINGS+=("子任务超时: $line")
done <<< "$SUBTASK_VIOLATIONS"

# Check for prohibited time units (周/月)
PROHIBITED=$(echo "$PAYLOAD" | jq -r 'tostring' 2>/dev/null | grep -oP '(按周|按月|下周|下个月|\\d+周|\\d+个?月)' || true)
while IFS= read -r match; do
  [ -n "$match" ] && WARNINGS+=("禁止使用粗粒度时间单位: $match")
done <<< "$PROHIBITED"

if [ ${#WARNINGS[@]} -gt 0 ]; then
  jq -n --argjson warnings "$(printf '%s\n' "${WARNINGS[@]}" | jq -R . | jq -s .)" \
    '{pass: false, gate: "planning-time-granularity", severity: "warning", warnings: $warnings}'
  exit 1
fi

jq -n '{pass: true, gate: "planning-time-granularity", warnings: []}'
exit 0
