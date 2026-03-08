#!/bin/bash
# 用法: register-task.sh <taskId> <label> <agentId> <model> [description]
# stdout≤5行，详细日志写文件

TASK_ID="$1"
LABEL="$2"
AGENT_ID="$3"
MODEL="${4:-unknown}"
DESCRIPTION="${5:-}"
BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"
RETRY_QUEUE="/root/.openclaw/workspace/logs/retry-queue.json"
LOGFILE="/root/.openclaw/workspace/logs/register-task-latest.log"

mkdir -p /root/.openclaw/workspace/logs

# 确保文件存在
if [ ! -f "$BOARD_FILE" ]; then
  echo '[]' > "$BOARD_FILE"
fi

# 详细日志写文件
{
  echo "=== Register Task $(date -Iseconds) ==="
  echo "TaskId: $TASK_ID | Label: $LABEL | Agent: $AGENT_ID | Model: $MODEL"

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
console.log('登记成功');
"

  # 超时扫描
  bash /root/.openclaw/workspace/scripts/task-timeout-check.sh 2>/dev/null || true

  # 看板+飞书
  bash /root/.openclaw/workspace/scripts/show-task-board-feishu.sh
  bash /root/.openclaw/workspace/scripts/push-feishu-board.sh 2>/dev/null || true

  echo "=== Register Complete ==="
} > "$LOGFILE" 2>&1

# === stdout精简摘要（≤5行） ===
COUNTS=$(node -e "
const fs = require('fs');
try {
  const board = JSON.parse(fs.readFileSync('$BOARD_FILE','utf8'));
  const r = board.filter(t=>t.status==='running').length;
  const d = board.filter(t=>t.status==='done').length;
  const t = board.filter(t=>t.status==='timeout').length;
  console.log('running: '+r+' | done: '+d+' | timeout: '+t);
} catch(e) { console.log('读取失败'); }
" 2>/dev/null)

echo "✅ 已登记: $LABEL"
echo "📋 $COUNTS"
