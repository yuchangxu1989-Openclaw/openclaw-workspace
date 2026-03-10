#!/usr/bin/env bash
# get-idle-agent.sh — 从18个子Agent中选取空闲的agent
# 用法: bash get-idle-agent.sh [N]
#   N: 需要的空闲agent数量，默认1
# 输出: 每行一个空闲agentId，末尾附统计信息(stderr)

set -euo pipefail

TASK_BOARD="/root/.openclaw/workspace/logs/subagent-task-board.json"
ALL_AGENTS=(
  researcher coder reviewer writer analyst scout cron-worker
  researcher-02 coder-02 reviewer-02 writer-02 analyst-02 scout-02 cron-worker-02
  worker-03 worker-04 worker-05 worker-06
)
TOTAL=${#ALL_AGENTS[@]}
NEED=${1:-1}

# 读取running的agentId列表
if [[ -f "$TASK_BOARD" ]]; then
  BUSY_LIST=$(python3 -c "
import json, sys
with open('$TASK_BOARD') as f:
    data = json.load(f)
busy = set(t['agentId'] for t in data if t.get('status') == 'running')
print('\n'.join(busy))
" 2>/dev/null || true)
else
  BUSY_LIST=""
fi

# 构建空闲列表
IDLE_AGENTS=()
for agent in "${ALL_AGENTS[@]}"; do
  if ! echo "$BUSY_LIST" | grep -qx "$agent"; then
    IDLE_AGENTS+=("$agent")
  fi
done

IDLE_COUNT=${#IDLE_AGENTS[@]}
BUSY_COUNT=$((TOTAL - IDLE_COUNT))

# 统计信息输出到stderr
>&2 echo "idle: ${IDLE_COUNT}/${TOTAL}, busy: ${BUSY_COUNT}/${TOTAL}"

# 检查是否有足够的空闲agent
if [[ $IDLE_COUNT -eq 0 ]]; then
  >&2 echo "错误: 没有空闲的agent，全部${TOTAL}个都在忙"
  exit 1
fi

if [[ $NEED -gt $IDLE_COUNT ]]; then
  >&2 echo "警告: 需要${NEED}个空闲agent，但只有${IDLE_COUNT}个可用"
fi

# 输出空闲agent（最多NEED个）
COUNT=0
for agent in "${IDLE_AGENTS[@]}"; do
  if [[ $COUNT -ge $NEED ]]; then
    break
  fi
  echo "$agent"
  COUNT=$((COUNT + 1))
done
