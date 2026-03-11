#!/bin/bash
# on-subagent-complete.sh — 子Agent完成时调用
# 用法: on-subagent-complete.sh <label> [session_id]
# 功能: 记录到done-sessions.txt + 触发看板推送

DONE_FILE="/tmp/feishu-board-push-dedup/done-sessions.txt"
mkdir -p "$(dirname "$DONE_FILE")"
touch "$DONE_FILE"

LABEL="${1:-}"
SESSION_ID="${2:-}"

if [ -n "$LABEL" ]; then
  # 去重写入
  grep -qxF "$LABEL" "$DONE_FILE" 2>/dev/null || echo "$LABEL" >> "$DONE_FILE"
  echo "📝 标记完成: $LABEL"
fi

if [ -n "$SESSION_ID" ]; then
  grep -qxF "$SESSION_ID" "$DONE_FILE" 2>/dev/null || echo "$SESSION_ID" >> "$DONE_FILE"
fi

# 触发看板推送
node /root/.openclaw/workspace/scripts/push-board-now.js >> /tmp/feishu-board-cron.log 2>&1 &
echo "📋 看板推送已触发"
