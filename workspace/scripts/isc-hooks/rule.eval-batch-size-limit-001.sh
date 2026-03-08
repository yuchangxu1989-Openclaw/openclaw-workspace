#!/usr/bin/env bash
# ISC Guard: rule.eval-batch-size-limit-001
# 评测集挖掘/清洗任务批量上限 ≤ 10
set -euo pipefail

CONFIG="/root/.openclaw/workspace/skills/public/eval-mining/config.json"
TASK_BOARD="/root/.openclaw/workspace/subagent-task-board.json"
MAX=10
EXIT_CODE=0

# --- Check 1: eval-mining config batch_size ---
if [ -f "$CONFIG" ]; then
  BATCH_SIZE=$(jq -r '.batch_size // 0' "$CONFIG")
  if [ "$BATCH_SIZE" -gt "$MAX" ]; then
    echo "FAIL: eval-mining config.json batch_size=$BATCH_SIZE exceeds limit $MAX"
    EXIT_CODE=1
  else
    echo "OK: batch_size=$BATCH_SIZE <= $MAX"
  fi

  MAX_CASES=$(jq -r '.max_cases_per_task // 0' "$CONFIG")
  if [ "$MAX_CASES" -gt "$MAX" ]; then
    echo "FAIL: max_cases_per_task=$MAX_CASES exceeds limit $MAX"
    EXIT_CODE=1
  else
    echo "OK: max_cases_per_task=$MAX_CASES <= $MAX"
  fi
else
  echo "WARN: config not found at $CONFIG, skipping config check"
fi

# --- Check 2: Scan recent eval tasks for oversized batches ---
if [ -f "$TASK_BOARD" ]; then
  # Find eval-related tasks and check for mentions of >10 items
  VIOLATIONS=$(jq -r '
    [.tasks // [] | .[] |
     select(.label != null and (.label | test("eval"; "i"))) |
     select(.task != null and (.task | test("(1[1-9]|[2-9][0-9]|[0-9]{3,})\\s*条"; "")))
    ] | length
  ' "$TASK_BOARD" 2>/dev/null || echo "0")

  if [ "$VIOLATIONS" -gt 0 ]; then
    echo "WARN: Found $VIOLATIONS eval task(s) in task-board mentioning >10 items"
  else
    echo "OK: No oversized eval tasks detected in task-board"
  fi
else
  echo "INFO: No task-board found at $TASK_BOARD, skipping task scan"
fi

exit $EXIT_CODE
