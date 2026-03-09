#!/bin/bash
# 处理自动重试队列
# 用法: process-retry-queue.sh
# 读取auto-retry-queue.json中pending任务，输出重试指令供主Agent或cron执行

AUTO_RETRY_QUEUE="/root/.openclaw/workspace/logs/auto-retry-queue.json"
BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"

if [ ! -f "$AUTO_RETRY_QUEUE" ]; then
  echo "📭 重试队列为空"
  exit 0
fi

PENDING_COUNT=$(node -e "
  const q=JSON.parse(require('fs').readFileSync('$AUTO_RETRY_QUEUE','utf8'));
  console.log(q.filter(r=>r.status==='pending').length);
" 2>/dev/null || echo "0")

if [ "$PENDING_COUNT" = "0" ]; then
  echo "📭 无待重试任务"
  exit 0
fi

echo "🔄 待重试任务: ${PENDING_COUNT}条"
echo "---"

# 逐条输出重试指令并标记为processing
node -e "
  const fs=require('fs');
  const queue=JSON.parse(fs.readFileSync('$AUTO_RETRY_QUEUE','utf8'));
  const pending=queue.filter(r=>r.status==='pending');

  pending.forEach((item,i) => {
    console.log('【重试 #'+(i+1)+'】');
    console.log('  Label: '+item.label);
    console.log('  AgentId: '+item.original_agentId);
    console.log('  Model: '+item.original_model);
    console.log('  重试次数: '+item.retry_count+'/2');
    console.log('  失败原因: '+item.reason);
    console.log('  入队时间: '+item.queued_at);
    console.log('  原任务摘要: '+(item.original_task_summary||'无').substring(0,100));
    console.log('  ---');

    // 标记为processing
    item.status='processing';
    item.processing_at=new Date().toISOString();
  });

  fs.writeFileSync('$AUTO_RETRY_QUEUE',JSON.stringify(queue,null,2));
" 2>/dev/null

echo ""
echo "⚡ 以上任务已标记为processing，等待主Agent重新派发。"
echo "💡 主Agent应使用sessions_spawn重新派发，并在看板中更新retry_count。"
