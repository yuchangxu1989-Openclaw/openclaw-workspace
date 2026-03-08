#!/bin/bash
# 用法: update-task.sh <taskId> <status> [result_summary]
# status: done / failed
# 主Agent收到completion event后立即调用

TASK_ID="$1"
STATUS="$2"
SUMMARY="${3:-}"
BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"

if [ -z "$TASK_ID" ] || [ -z "$STATUS" ]; then
  echo "用法: update-task.sh <taskId> <status> [result_summary]"
  exit 1
fi

node -e "
const fs = require('fs');
const f = '$BOARD_FILE';
let board = [];
try { board = JSON.parse(fs.readFileSync(f, 'utf8')); } catch(e) { board = []; }
const idx = board.findIndex(t => t.taskId === '$TASK_ID' || t.label === '$TASK_ID');
if (idx >= 0) {
  board[idx].status = '$STATUS';
  board[idx].completeTime = new Date().toISOString();
  board[idx].result_summary = \`$SUMMARY\`.substring(0, 200);
  fs.writeFileSync(f, JSON.stringify(board, null, 2));
  console.log('✅ 已更新: ' + board[idx].label + ' → $STATUS');
} else {
  console.log('⚠️ 未找到任务: $TASK_ID');
}
"
