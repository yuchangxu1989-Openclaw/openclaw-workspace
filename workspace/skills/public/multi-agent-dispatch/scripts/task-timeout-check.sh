#!/bin/bash
# 超时检测脚本 - 自动分诊：产出已存在→done，产出不存在→timeout+重试
# 同时清理retry队列中pending超2小时的→abandoned
# 建议cron每10分钟调用: */10 * * * * bash /root/.openclaw/workspace/scripts/task-timeout-check.sh
# 超时阈值: 30分钟

BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"
RETRY_QUEUE="/root/.openclaw/workspace/logs/retry-queue.json"
TIMEOUT_MINUTES=30
MAX_RETRIES=2
WORKSPACE="/root/.openclaw/workspace"

if [ ! -f "$BOARD_FILE" ]; then
  echo "✅ 无超时任务"
  exit 0
fi

# 初始化retry-queue
if [ ! -f "$RETRY_QUEUE" ]; then
  echo '[]' > "$RETRY_QUEUE"
fi

RESULT=$(node -e "
const fs = require('fs');
const path = require('path');
const board = JSON.parse(fs.readFileSync('$BOARD_FILE', 'utf8'));
const retryQueue = JSON.parse(fs.readFileSync('$RETRY_QUEUE', 'utf8'));
const now = Date.now();
const threshold = $TIMEOUT_MINUTES * 60 * 1000;
const maxRetries = $MAX_RETRIES;
const ws = '$WORKSPACE';

// === 自动分诊：检查产出文件是否存在 ===
function hasOutput(label) {
  if (!label) return false;
  const dirs = ['reports', 'scripts', 'skills', 'logs'];
  for (const dir of dirs) {
    const dirPath = path.join(ws, dir);
    try {
      const files = fs.readdirSync(dirPath);
      for (const f of files) {
        if (f.includes(label)) return true;
      }
    } catch(e) {}
  }
  return false;
}

const timedOut = [];
const autoDone = [];
const retryMessages = [];

for (const t of board) {
  if (t.status !== 'running') continue;
  const timeStr = t.spawnTime || t.startTime;
  const elapsed = timeStr ? (now - new Date(timeStr).getTime()) : Infinity;

  if (elapsed > threshold) {
    const label = t.label || t.taskId;
    // 分诊：产出存在 → done，不存在 → timeout
    if (hasOutput(label)) {
      t.status = 'done';
      t.completeTime = new Date().toISOString();
      t.result_summary = '超时但产出已存在，自动标记完成';
      autoDone.push(label);
    } else {
      t.status = 'timeout';
      t.completeTime = new Date().toISOString();
      t.result_summary = '超时自动标记(产出不存在)';
      timedOut.push(label);
    }
  }
}

// 对timeout任务写入重试队列
for (const label of timedOut) {
  const task = board.find(t => (t.label || t.taskId) === label);
  if (!task) continue;
  const existing = retryQueue.find(r => r.original_label === label);
  if (existing) {
    existing.timeout_count += 1;
    if (existing.timeout_count >= maxRetries) {
      existing.status = 'abandoned';
      retryMessages.push(JSON.stringify({type:'abandoned', label, count: existing.timeout_count}));
    } else {
      existing.status = 'pending';
      existing.queued_at = new Date().toISOString();
      retryMessages.push(JSON.stringify({type:'retry', label, count: existing.timeout_count}));
    }
  } else {
    retryQueue.push({
      original_label: label,
      agentId: task.agentId || '',
      description: task.description || '',
      model: task.model || '',
      timeout_count: 1,
      max_retries: maxRetries,
      status: 'pending',
      queued_at: new Date().toISOString()
    });
    retryMessages.push(JSON.stringify({type:'retry', label, count: 1}));
  }
}

// === L4: 清理retry队列中pending超2小时的 → abandoned ===
const twoHours = 2 * 60 * 60 * 1000;
const abandoned = [];
for (const r of retryQueue) {
  if (r.status === 'pending' && r.queued_at) {
    const age = now - new Date(r.queued_at).getTime();
    if (age > twoHours) {
      r.status = 'abandoned';
      abandoned.push(r.original_label);
    }
  }
}

if (timedOut.length > 0 || autoDone.length > 0 || abandoned.length > 0) {
  fs.writeFileSync('$BOARD_FILE', JSON.stringify(board, null, 2));
  fs.writeFileSync('$RETRY_QUEUE', JSON.stringify(retryQueue, null, 2));
}

// 输出摘要
const parts = [];
if (autoDone.length > 0) parts.push('✅ 产出已存在自动完成: ' + autoDone.join(','));
if (timedOut.length > 0) parts.push('⏰ 超时进重试队列: ' + timedOut.join(','));
if (abandoned.length > 0) parts.push('🗑️ 重试队列超2h自动放弃: ' + abandoned.join(','));
if (parts.length === 0) parts.push('✅ 无超时任务');
console.log(parts.join('\n'));
")

echo "$RESULT"
