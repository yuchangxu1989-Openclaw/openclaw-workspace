#!/bin/bash
# 子Agent完成时的标准处理流程
# 用法: completion-handler.sh <taskId_or_label> <status> <summary>
# 主Agent收到completion event后，调用此脚本完成所有必做动作

TASK_ID="$1"
STATUS="$2"  # done / failed
SUMMARY="${3:-}"

if [ -z "$TASK_ID" ] || [ -z "$STATUS" ]; then
  echo "用法: completion-handler.sh <taskId_or_label> <done|failed> \"简要结果\""
  exit 1
fi

echo "=== Completion Handler ==="

# Step 1: 更新task-board（强制）
bash /root/.openclaw/workspace/scripts/update-task.sh "$TASK_ID" "$STATUS" "$SUMMARY"

# Step 2: 生成看板快照供主Agent发送
bash /root/.openclaw/workspace/scripts/show-task-board.sh

# Step 3: 检查是否触发批量汇报（running=0时）
BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"
if [ -f "$BOARD_FILE" ]; then
  RUNNING=$(node -e "
const board = JSON.parse(require('fs').readFileSync('$BOARD_FILE','utf8'));
console.log(board.filter(t=>t.status==='running').length);
")

  if [ "$RUNNING" = "0" ]; then
    echo ""
    echo "🎯 所有任务已完成！请向用户推送最终汇总。"
  fi
fi

echo "=== Handler Complete ==="
