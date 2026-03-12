#!/bin/bash
# 看板事件钩子 - 纯事件驱动，被主Agent在spawn/completion时调用
# 用法: board-event-hook.sh <event> [label]
# event: spawned | completed
EVENT="${1:-unknown}"
LABEL="${2:-}"
echo "[board-hook] event=$EVENT label=$LABEL at $(date '+%Y-%m-%d %H:%M:%S')"
cd /root/.openclaw/workspace
node scripts/push-board-now.js 2>&1 | tail -3
