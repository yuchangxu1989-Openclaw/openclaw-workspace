#!/bin/bash
# 重试派发器 - 读取retry-queue.json，输出待重试任务的spawn建议
# 默认仅在显式调用时输出详情；可通过 --summary 输出摘要

RETRY_QUEUE="/root/.openclaw/workspace/logs/retry-queue.json"
MODE="detail"

if [ "$1" = "--summary" ]; then
  MODE="summary"
fi

if [ ! -f "$RETRY_QUEUE" ]; then
  echo "无重试队列文件"
  exit 0
fi

if [ "$MODE" = "summary" ]; then
  node -e "
const fs = require('fs');
const q = JSON.parse(fs.readFileSync('$RETRY_QUEUE', 'utf8'));
const pending = q.filter(r => r.status === 'pending').length;
const dispatched = q.filter(r => r.status === 'dispatched').length;
const done = q.filter(r => r.status === 'done').length;
console.log('🔄 重试队列摘要: pending=' + pending + ', dispatched=' + dispatched + ', done=' + done);
"
  exit 0
fi

PENDING=$(node -e "
const fs = require('fs');
const queue = JSON.parse(fs.readFileSync('$RETRY_QUEUE', 'utf8'));
const pending = queue.filter(r => r.status === 'pending');
if (pending.length === 0) {
  console.log('NO_PENDING');
} else {
  for (const r of pending) {
    console.log(JSON.stringify(r));
  }
}
")

if [[ "$PENDING" == "NO_PENDING" ]]; then
  echo "✅ 无待重试任务"
  exit 0
fi

echo "🔄 以下任务需要重试（主Agent请用sessions_spawn重新派发）："
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

while IFS= read -r line; do
  LABEL=$(echo "$line" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.original_label)")
  AGENT=$(echo "$line" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.agentId)")
  DESC=$(echo "$line" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.description)")
  MODEL=$(echo "$line" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.model)")
  COUNT=$(echo "$line" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.timeout_count)")

  echo ""
  echo "📌 $DESC ($LABEL)"
  echo "   agentId: $AGENT | model: $MODEL | 已超时: ${COUNT}次"
  echo "   >>> sessions_spawn: label='retry-${LABEL}' agentId='${AGENT}' task='[重试] ${DESC}'"
done <<< "$PENDING"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "提示：主Agent执行spawn后，运行以下命令标记已派发："
echo "  node -e \"const fs=require('fs');const q=JSON.parse(fs.readFileSync('$RETRY_QUEUE','utf8'));q.filter(r=>r.status==='pending').forEach(r=>r.status='dispatched');fs.writeFileSync('$RETRY_QUEUE',JSON.stringify(q,null,2))\""
