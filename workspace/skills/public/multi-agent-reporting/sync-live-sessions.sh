#!/bin/bash
# sync-live-sessions.sh - 将实际运行中的子Agent同步到看板
# 读取 openclaw sessions --active N，与 subagent-task-board.json 合并
# 确保看板反映真实状态

BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"
ACTIVE_MINUTES="${1:-15}"

# 获取活跃session列表
LIVE_JSON=$(openclaw sessions --active "$ACTIVE_MINUTES" --json 2>/dev/null)
if [ -z "$LIVE_JSON" ]; then
  echo "⚠️ 无法获取活跃session列表"
  exit 1
fi

node -e "
const fs = require('fs');
const liveData = JSON.parse(process.argv[1]);
const boardPath = '$BOARD_FILE';

let board = [];
try { board = JSON.parse(fs.readFileSync(boardPath, 'utf8')); } catch(e) { board = []; }

const liveSessions = (liveData.sessions || []).filter(s => 
  s.key && s.key.includes(':subagent:') && !s.abortedLastRun
);

// 当前board中running的taskId/sessionId集合
const boardRunningIds = new Set(
  board.filter(t => t.status === 'running').map(t => t.taskId)
);
const boardSessionIds = new Set(
  board.filter(t => t.status === 'running').map(t => t.sessionId).filter(Boolean)
);

let added = 0;
let synced = 0;

for (const s of liveSessions) {
  const subagentId = s.key.split(':subagent:')[1];
  if (!subagentId) continue;
  
  // 检查是否已在board中（通过taskId或sessionId匹配）
  const existsInBoard = board.some(t => 
    t.taskId === subagentId || 
    t.sessionId === s.sessionId ||
    (t.status === 'running' && t.taskId && s.key.includes(t.taskId))
  );
  
  if (!existsInBoard) {
    // 未注册的活跃子Agent，补录到看板
    const entry = {
      taskId: subagentId,
      label: 'live-' + subagentId.substring(0, 8),
      agentId: s.agentId || 'main',
      model: s.model || 'unknown',
      status: 'running',
      sessionId: s.sessionId,
      spawnTime: new Date(Date.now() - (s.ageMs || 0)).toISOString(),
      source: 'live-sync'  // 标记来源
    };
    board.push(entry);
    added++;
  }
}

// 反向同步：board中标记running但session已不存在的，标记为done
const liveSessionKeys = new Set(liveSessions.map(s => s.key.split(':subagent:')[1]));
const liveSessionIds = new Set(liveSessions.map(s => s.sessionId));

for (const task of board) {
  if (task.status !== 'running') continue;
  // 如果task已运行超过2分钟，且不在活跃session中，标记完成
  const age = Date.now() - new Date(task.spawnTime).getTime();
  if (age > 2 * 60 * 1000) {
    const stillAlive = liveSessionKeys.has(task.taskId) || 
                       (task.sessionId && liveSessionIds.has(task.sessionId));
    if (!stillAlive) {
      task.status = 'done';
      task.completeTime = new Date().toISOString();
      task.result_summary = '(live-sync: session已结束)';
      synced++;
    }
  }
}

fs.writeFileSync(boardPath, JSON.stringify(board, null, 2));
console.log('✅ 同步完成: 新增' + added + '条 | 清理僵尸' + synced + '条');
" "$LIVE_JSON"
