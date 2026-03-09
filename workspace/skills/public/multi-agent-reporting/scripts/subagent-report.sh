#!/usr/bin/env bash
set -euo pipefail

BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"

if [[ ! -f "$BOARD_FILE" ]]; then
  echo "[subagent-report] task board not found: $BOARD_FILE"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[subagent-report] jq is required"
  exit 1
fi

now_ts=$(date +%s)

total=$(jq 'length' "$BOARD_FILE")
running=$(jq '[.[] | select(.status=="running")] | length' "$BOARD_FILE")
done=$(jq '[.[] | select(.status=="done")] | length' "$BOARD_FILE")
failed=$(jq '[.[] | select(.status=="failed")] | length' "$BOARD_FILE")

printf "=== SubAgent 任务状态看板 ===\n"
printf "Agent并行总数: %s\n\n" "$total"
printf "%-22s %-16s %-12s %-10s %-10s\n" "任务(label)" "AgentId" "模型" "状态" "耗时"
printf "%-22s %-16s %-12s %-10s %-10s\n" "----------------------" "----------------" "------------" "----------" "----------"

jq -r --argjson now "$now_ts" '
  .[] |
  .spawnEpoch = ((.spawnTime // "") | if .=="" then 0 else (strptime("%Y-%m-%dT%H:%M:%SZ") | mktime) end) |
  .completeEpoch = ((.completeTime // "") | if .=="" then 0 else (strptime("%Y-%m-%dT%H:%M:%SZ") | mktime) end) |
  .duration = (if .status=="running" then ($now - .spawnEpoch) elif .completeEpoch > 0 then (.completeEpoch - .spawnEpoch) else 0 end) |
  [(.label // "-"), (.agentId // "-"), (.model // "-"), (.status // "-"), ((.duration|floor|tostring)+"s")] | @tsv
' "$BOARD_FILE" | while IFS=$'\t' read -r label aid model status duration; do
  printf "%-22.22s %-16.16s %-12.12s %-10.10s %-10.10s\n" "$label" "$aid" "$model" "$status" "$duration"
done

printf "\n汇总: done=%s failed=%s running=%s total=%s\n" "$done" "$failed" "$running" "$total"
