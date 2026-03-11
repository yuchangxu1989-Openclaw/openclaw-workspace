#!/usr/bin/env bash
# get-free-agent.sh — 基于实际session活跃度的Agent调度器
# 用法: bash get-free-agent.sh [N]
#   N: 需要的空闲agent数量，默认1
# 输出: 每行一个空闲agentId (stdout)，统计信息 (stderr)
#
# 与 get-idle-agent.sh 的区别：
#   - 不依赖 subagent-task-board.json（可能过时）
#   - 直接扫描每个agent目录下的session文件修改时间
#   - 15分钟内有活跃session的agent视为busy

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
POOL_FILE="$SCRIPT_DIR/agent-pool.json"
AGENTS_BASE="/root/.openclaw/agents"
STALE_MINUTES=15
NEED=${1:-1}

# 从 agent-pool.json 读取池
if [[ -f "$POOL_FILE" ]]; then
  mapfile -t ALL_AGENTS < <(python3 -c "
import json
with open('$POOL_FILE') as f:
    pool = json.load(f)
for a in pool['pool']:
    print(a)
")
else
  ALL_AGENTS=(
    researcher coder reviewer writer analyst scout cron-worker
    researcher-02 coder-02 reviewer-02 writer-02 analyst-02 scout-02 cron-worker-02
    worker-03 worker-04 worker-05 worker-06
  )
fi

TOTAL=${#ALL_AGENTS[@]}
NOW=$(date +%s)
CUTOFF=$((NOW - STALE_MINUTES * 60))

# 检测每个agent是否有活跃session
declare -A BUSY_MAP
for agent in "${ALL_AGENTS[@]}"; do
  SESSION_DIR="$AGENTS_BASE/$agent/sessions"
  if [[ ! -d "$SESSION_DIR" ]]; then
    continue
  fi
  # 找最近修改的非gz session文件
  latest=$(find "$SESSION_DIR" -maxdepth 1 -name '*.jsonl' -not -name '*.gz' -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | head -1 | awk '{print $1}')
  if [[ -n "$latest" ]]; then
    latest_epoch=${latest%.*}
    if [[ $latest_epoch -ge $CUTOFF ]]; then
      BUSY_MAP[$agent]=1
    fi
  fi
done

# 也检查 subagent-task-board.json 作为补充（双重确认）
TASK_BOARD="/root/.openclaw/workspace/logs/subagent-task-board.json"
if [[ -f "$TASK_BOARD" ]]; then
  while IFS= read -r agent; do
    [[ -n "$agent" ]] && BUSY_MAP[$agent]=1
  done < <(python3 -c "
import json
with open('$TASK_BOARD') as f:
    data = json.load(f)
for t in data:
    if t.get('status') == 'running':
        print(t.get('agentId',''))
" 2>/dev/null || true)
fi

# 构建空闲列表
IDLE_AGENTS=()
BUSY_AGENTS=()
for agent in "${ALL_AGENTS[@]}"; do
  if [[ -z "${BUSY_MAP[$agent]:-}" ]]; then
    IDLE_AGENTS+=("$agent")
  else
    BUSY_AGENTS+=("$agent")
  fi
done

IDLE_COUNT=${#IDLE_AGENTS[@]}
BUSY_COUNT=${#BUSY_AGENTS[@]}

# 统计信息 -> stderr
>&2 echo "空闲: ${IDLE_COUNT}/${TOTAL}, 忙碌: ${BUSY_COUNT}/${TOTAL}"
if [[ $BUSY_COUNT -gt 0 ]]; then
  >&2 echo "忙碌列表: ${BUSY_AGENTS[*]}"
fi

# 无空闲agent
if [[ $IDLE_COUNT -eq 0 ]]; then
  >&2 echo "错误: 全部${TOTAL}个agent都在忙，无法分配"
  >&2 echo "建议: 等待${STALE_MINUTES}分钟后重试，或手动检查僵尸session"
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
