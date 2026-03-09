#!/usr/bin/env bash
# auto-split-dispatch.sh - 自动拆分任务到多Agent并行
# Usage: auto-split-dispatch.sh <total_tasks> [capacity_per_agent=50]

set -euo pipefail

MAX_AGENTS=19
TOTAL=${1:?Usage: auto-split-dispatch.sh <total_tasks> [capacity_per_agent]}
CAPACITY=${2:-50}

if (( TOTAL <= 0 || CAPACITY <= 0 )); then
  echo "Error: total_tasks and capacity must be positive integers" >&2
  exit 1
fi

# Calculate agents needed, capped at MAX_AGENTS
NEEDED=$(( (TOTAL + CAPACITY - 1) / CAPACITY ))
(( NEEDED > MAX_AGENTS )) && NEEDED=$MAX_AGENTS

# Distribute tasks evenly
BASE=$(( TOTAL / NEEDED ))
REMAINDER=$(( TOTAL % NEEDED ))

echo "=== Auto-Split Dispatch ==="
echo "Total tasks:  $TOTAL"
echo "Capacity/agent: $CAPACITY"
echo "Agents needed:  $NEEDED (max $MAX_AGENTS)"
echo ""
echo "--- Assignment ---"

START=1
for (( i=1; i<=NEEDED; i++ )); do
  COUNT=$BASE
  (( i <= REMAINDER )) && (( COUNT++ ))
  END=$(( START + COUNT - 1 ))
  printf "Agent %2d: tasks %d-%d (%d items)\n" "$i" "$START" "$END" "$COUNT"
  START=$(( END + 1 ))
done
