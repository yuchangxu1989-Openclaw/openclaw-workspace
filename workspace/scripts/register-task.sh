#!/bin/bash
# 用法: register-task.sh <taskId> <label> <agentId> <model> [description]
# 主Agent每次spawn后立即调用此脚本登记
# 此脚本是spawn的原子伴随操作，登记后自动输出格式化看板，供主Agent直接推送给用户。
# description: 中文任务描述（可选），看板优先显示此字段

TASK_ID="$1"
LABEL="$2"
AGENT_ID="$3"
MODEL="${4:-unknown}"
DESCRIPTION="${5:-}"
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
const entry = {
  taskId: '$TASK_ID',
  label: '$LABEL',
  agentId: '$AGENT_ID',
  model: '$MODEL',
  status: 'running',
  spawnTime: new Date().toISOString()
};
if ('$DESCRIPTION') entry.description = '$DESCRIPTION';
board.push(entry);
fs.writeFileSync(f, JSON.stringify(board, null, 2));
console.log('✅ 已登记: $LABEL ($AGENT_ID/$MODEL)');
"

# 顺便扫描超时任务（双保险）
bash /root/.openclaw/workspace/scripts/task-timeout-check.sh 2>/dev/null || true

# 登记成功后自动输出看板并直接推送飞书（不依赖主Agent）
bash /root/.openclaw/workspace/scripts/show-task-board-feishu.sh
bash /root/.openclaw/workspace/scripts/push-feishu-board.sh
