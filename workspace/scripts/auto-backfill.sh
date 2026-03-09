#!/bin/bash
# auto-backfill.sh — 检测空闲slot + pending任务，输出不可忽略的派发指令
# 被 completion-handler.sh 在尾部调用
# 同时通过 openclaw send 直接通知主Agent session

BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"
PENDING_POOL="/root/.openclaw/workspace/logs/pending-retry-pool.json"
AUTO_RETRY_Q="/root/.openclaw/workspace/logs/auto-retry-queue.json"
MAX_CONCURRENT=19
MIN_FREE_SLOTS=3

[ ! -f "$BOARD_FILE" ] && exit 0

# Count running
RUNNING=$(jq '[.[] | select(.status=="running")] | length' "$BOARD_FILE" 2>/dev/null || echo "0")
FREE_SLOTS=$((MAX_CONCURRENT - RUNNING))

[ "$FREE_SLOTS" -lt "$MIN_FREE_SLOTS" ] && exit 0

# Collect pending tasks from all sources
PENDING_TASKS=""
PENDING_COUNT=0

# Source 1: pending-retry-pool.json
if [ -f "$PENDING_POOL" ]; then
  POOL_ENTRIES=$(jq -r '.[] | select(.status=="pending") | "  - \(.label) (retry #\(.retryCount))\(.originalTask // "" | if . != "" then " | " + (.[0:80]) else "" end)"' "$PENDING_POOL" 2>/dev/null || true)
  if [ -n "$POOL_ENTRIES" ]; then
    PENDING_TASKS="${PENDING_TASKS}${POOL_ENTRIES}"$'\n'
    POOL_COUNT=$(echo "$POOL_ENTRIES" | wc -l)
    PENDING_COUNT=$((PENDING_COUNT + POOL_COUNT))
  fi
fi

# Source 2: auto-retry-queue.json
if [ -f "$AUTO_RETRY_Q" ]; then
  ARQ_ENTRIES=$(jq -r '.[] | select(.status=="pending") | "  - \(.label) (retry #\(.retry_count)) [from auto-retry-queue]"' "$AUTO_RETRY_Q" 2>/dev/null || true)
  if [ -n "$ARQ_ENTRIES" ]; then
    PENDING_TASKS="${PENDING_TASKS}${ARQ_ENTRIES}"$'\n'
    ARQ_COUNT=$(echo "$ARQ_ENTRIES" | wc -l)
    PENDING_COUNT=$((PENDING_COUNT + ARQ_COUNT))
  fi
fi

# Source 3: board itself — timeout/failed with retry_count < 3
BOARD_RETRYABLE=$(jq -r '[.[] | select((.status=="timeout" or .status=="timed_out" or .status=="failed") and ((.retry_count // 0) < 3))] | .[] | "  - \(.label) (\(.status), retry \(.retry_count // 0)/3)"' "$BOARD_FILE" 2>/dev/null || true)
if [ -n "$BOARD_RETRYABLE" ]; then
  PENDING_TASKS="${PENDING_TASKS}${BOARD_RETRYABLE}"$'\n'
  BR_COUNT=$(echo "$BOARD_RETRYABLE" | wc -l)
  PENDING_COUNT=$((PENDING_COUNT + BR_COUNT))
fi

# Deduplicate by label
if [ "$PENDING_COUNT" -gt 0 ]; then
  PENDING_TASKS=$(echo "$PENDING_TASKS" | sort -u)
  PENDING_COUNT=$(echo "$PENDING_TASKS" | grep -c '.' || echo "0")
fi

[ "$PENDING_COUNT" -eq 0 ] && exit 0

# === OUTPUT: unmissable directive ===
MSG=$(cat <<EOF

═══════════════════════════════════════════════
🔄 AUTO_BACKFILL: idle=${FREE_SLOTS}, pending=${PENDING_COUNT}
═══════════════════════════════════════════════
ACTION_REQUIRED: 立即派发以下任务:
${PENDING_TASKS}
⚡ 不要让算力闲置！有${FREE_SLOTS}个空闲slot等待派发！
═══════════════════════════════════════════════
EOF
)

echo "$MSG"

# Also send directly to main agent session via openclaw send
if command -v openclaw &>/dev/null; then
  openclaw send --session "agent:main:main" --message "🔄 AUTO_BACKFILL: idle=${FREE_SLOTS}, pending=${PENDING_COUNT}. 立即派发！详见completion-handler输出。" 2>/dev/null || true
fi
