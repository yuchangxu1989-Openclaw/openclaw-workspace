#!/bin/bash
# auto-refresh.sh — 一键刷新看板并推送飞书
# 
# 用法（主Agent每次spawn/completion后执行）:
#   bash /root/.openclaw/workspace/skills/public/multi-agent-dispatch/scripts/auto-refresh.sh
#
# 工作流程:
#   1. 调用 show-task-board.sh 从 subagent-task-board.json 生成最新看板文本
#   2. 调用 send-task-queue-card.js 推送飞书卡片
#   3. 同时更新 live-task-queue-report.json（供其他脚本读取）

set -euo pipefail

WORKSPACE="/root/.openclaw/workspace"
SCRIPTS_DIR="$WORKSPACE/skills/public/multi-agent-dispatch/scripts"
REPORT_DIR="$WORKSPACE/reports/task-queue"
LOG="$WORKSPACE/logs/auto-refresh.log"

mkdir -p "$REPORT_DIR" "$(dirname "$LOG")"

echo "[$(date -Iseconds)] auto-refresh 开始" >> "$LOG"

# Step 1: 生成看板快照文本
BOARD_TEXT=$(bash "$WORKSPACE/scripts/show-task-board.sh" 2>/dev/null || echo "看板读取失败")
echo "$BOARD_TEXT"

# Step 2: 推送飞书卡片（静默，失败不阻塞）
if node "$SCRIPTS_DIR/send-task-queue-card.js" >> "$LOG" 2>&1; then
  echo "✅ 飞书卡片已推送"
else
  echo "⚠️ 飞书卡片推送失败（详见 $LOG）"
fi

echo "[$(date -Iseconds)] auto-refresh 完成" >> "$LOG"
