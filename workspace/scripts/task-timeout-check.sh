#!/bin/bash
# 超时检测脚本 - 自动标记长时间running的任务为timeout，并排入重试队列
# 建议cron每10分钟调用: */10 * * * * bash /root/.openclaw/workspace/scripts/task-timeout-check.sh
# 超时阈值: 30分钟

BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"
RETRY_QUEUE="/root/.openclaw/workspace/logs/retry-queue.json"
TIMEOUT_MINUTES=30
MAX_RETRIES=2

if [ ! -f "$BOARD_FILE" ]; then
  echo "看板文件不存在: $BOARD_FILE"
  exit 0
fi

# 初始化retry-queue
if [ ! -f "$RETRY_QUEUE" ]; then
  echo '[]' > "$RETRY_QUEUE"
fi

RESULT=$(node -e "
const fs = require('fs');
const board = JSON.parse(fs.readFileSync('$BOARD_FILE', 'utf8'));
const retryQueue = JSON.parse(fs.readFileSync('$RETRY_QUEUE', 'utf8'));
const now = Date.now();
const threshold = $TIMEOUT_MINUTES * 60 * 1000;
const maxRetries = $MAX_RETRIES;
const changed = [];
const retryMessages = [];

for (const t of board) {
  if (t.status !== 'running') continue;
  const timeStr = t.spawnTime || t.startTime;
  if (!timeStr) {
    t.status = 'timeout';
    t.completeTime = new Date().toISOString();
    t.result_summary = '超时自动标记(无时间戳)';
    changed.push(t.label || t.taskId);
  } else {
    const elapsed = now - new Date(timeStr).getTime();
    if (elapsed > threshold) {
      t.status = 'timeout';
      t.completeTime = new Date().toISOString();
      t.result_summary = '超时自动标记(session已断开)';
      changed.push(t.label || t.taskId);
    }
  }
}

// 对新标记的timeout任务，写入重试队列
for (const label of changed) {
  const task = board.find(t => (t.label || t.taskId) === label);
  if (!task) continue;

  // 检查是否已在重试队列
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

if (changed.length > 0) {
  fs.writeFileSync('$BOARD_FILE', JSON.stringify(board, null, 2));
  fs.writeFileSync('$RETRY_QUEUE', JSON.stringify(retryQueue, null, 2));
  console.log('TIMEOUT:' + changed.join(','));
  console.log('RETRY_MSGS:' + retryMessages.join('|'));
} else {
  console.log('NO_TIMEOUT');
}
")

if [[ "$RESULT" == *"NO_TIMEOUT"* ]]; then
  echo "✅ 无超时任务"
  exit 0
fi

# 解析结果
LABELS=$(echo "$RESULT" | grep '^TIMEOUT:' | sed 's/^TIMEOUT://')
RETRY_MSGS=$(echo "$RESULT" | grep '^RETRY_MSGS:' | sed 's/^RETRY_MSGS://')

echo "⏰ 已标记超时任务: $LABELS"

# 推送飞书通知（区分重试/放弃）
IFS='|' read -ra MSGS <<< "$RETRY_MSGS"
for msg in "${MSGS[@]}"; do
  TYPE=$(echo "$msg" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.type)")
  LABEL=$(echo "$msg" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.label)")
  COUNT=$(echo "$msg" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.count)")

  if [ "$TYPE" = "abandoned" ]; then
    echo "❌ 任务 $LABEL 超时已达最大重试次数($COUNT/$MAX_RETRIES)，放弃"
  else
    echo "⏰ 任务 $LABEL 超时已排入重试队列 ($COUNT/$MAX_RETRIES)"
  fi
done

# 推送飞书看板
bash /root/.openclaw/workspace/scripts/push-feishu-board.sh 2>/dev/null || true

# 输出重试建议
echo ""
echo "🔄 以下任务需要重试："
bash /root/.openclaw/workspace/scripts/retry-dispatcher.sh 2>/dev/null || true

echo "✅ 超时检测完成"
