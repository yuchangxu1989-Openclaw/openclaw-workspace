#!/bin/bash
# 用法: register-task.sh <taskId> <label> <agentId> <model>
# 主Agent每次spawn后立即调用此脚本登记

TASK_ID="$1"
LABEL="$2"
AGENT_ID="$3"
MODEL="${4:-unknown}"
BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"

# 确保文件存在
if [ ! -f "$BOARD_FILE" ]; then
  echo '[]' > "$BOARD_FILE"
fi

# 用node写入（保证JSON安全）
node -e "
const fs = require('fs');
const f = '$BOARD_FILE';
let board = [];
try { board = JSON.parse(fs.readFileSync(f, 'utf8')); } catch(e) { board = []; }
board.push({
  taskId: '$TASK_ID',
  label: '$LABEL',
  agentId: '$AGENT_ID',
  model: '$MODEL',
  status: 'running',
  spawnTime: new Date().toISOString()
});
fs.writeFileSync(f, JSON.stringify(board, null, 2));
console.log('✅ 已登记: $LABEL ($AGENT_ID/$MODEL)');
"
