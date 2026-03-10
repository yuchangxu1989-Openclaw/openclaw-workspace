#!/bin/bash
# batch-dispatch-from-queue.sh — 从 completion-actions.json 提取所有 retry 任务
# 输出格式化的 spawn 指令列表，主Agent复制执行即可
# 用法: batch-dispatch-from-queue.sh [--clear]

set -euo pipefail

WORKSPACE="/root/.openclaw/workspace"
ACTIONS_FILE="$WORKSPACE/logs/completion-actions.json"
BOARD_FILE="$WORKSPACE/logs/subagent-task-board.json"
CLEAR_AFTER="${1:-}"

if [ ! -f "$ACTIONS_FILE" ]; then
  echo "📭 无待处理队列 ($ACTIONS_FILE 不存在)"
  exit 0
fi

# 提取所有 action=retry 的条目
RETRY_ITEMS=$(node -e "
const fs=require('fs');
const arr=JSON.parse(fs.readFileSync('$ACTIONS_FILE','utf8'));
const retries=arr.filter(x=>x.action==='retry');
if(retries.length===0){ console.log('EMPTY'); process.exit(0); }
console.log(JSON.stringify(retries));
" 2>/dev/null)

if [ "$RETRY_ITEMS" = "EMPTY" ] || [ -z "$RETRY_ITEMS" ]; then
  echo "✅ 队列中无需重试的任务"
  exit 0
fi

COUNT=$(node -e "console.log(JSON.parse('$(echo "$RETRY_ITEMS" | sed "s/'/\\\\'/g")').length)" 2>/dev/null)
echo "🔄 发现 $COUNT 个待重试任务："
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 为每个retry任务生成spawn指令
node -e "
const fs = require('fs');
const items = $RETRY_ITEMS;

// 尝试从看板获取原始agent和model信息
let board = [];
try { board = JSON.parse(fs.readFileSync('$BOARD_FILE','utf8')); } catch(e){}

items.forEach((item, i) => {
  const boardTask = board.find(t => t.label === item.label || t.taskId === item.label);
  const agent = item.agent || boardTask?.agentId || 'coder';
  const model = boardTask?.model || 'claude-coder/claude-opus-4-6-thinking';
  const task = item.retry_task || boardTask?.description || item.label;
  const newLabel = item.label.replace(/^(retry-)*/, 'retry-');

  console.log();
  console.log('# [' + (i+1) + '/' + items.length + '] ' + item.label);
  console.log('# 原因: ' + item.reason);
  console.log('sessions_spawn:');
  console.log('  runtime: subagent');
  console.log('  label: ' + newLabel);
  console.log('  agentId: ' + agent);
  console.log('  model: ' + model);
  console.log('  task: |');
  // 任务描述中强制加绝对路径提醒
  const pathReminder = '所有路径用绝对路径 /root/.openclaw/workspace/ 开头！';
  const fullTask = task.includes('/root/.openclaw/workspace') ? task : task + ' ' + pathReminder;
  console.log('    ' + fullTask);
});
console.log();
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
" 2>/dev/null

# --clear: 清除已输出的retry条目
if [ "$CLEAR_AFTER" = "--clear" ]; then
  node -e "
    const fs=require('fs');
    const arr=JSON.parse(fs.readFileSync('$ACTIONS_FILE','utf8'));
    const remaining=arr.filter(x=>x.action!=='retry');
    fs.writeFileSync('$ACTIONS_FILE', JSON.stringify(remaining,null,2));
    console.log('🧹 已清除 ' + (arr.length-remaining.length) + ' 条retry记录');
  "
fi
