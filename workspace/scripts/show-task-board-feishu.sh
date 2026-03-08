#!/bin/bash
# show-task-board-feishu.sh - 生成飞书可读的markdown任务看板
# ISC-REPORT-SUBAGENT-BOARD-001 标准格式
# 用法: bash show-task-board-feishu.sh [--all]

BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"

if [ ! -f "$BOARD_FILE" ]; then
  echo "📋 Agent任务看板"
  echo ""
  echo "暂无任务记录"
  exit 0
fi

SHOW_ALL="${1:-}"

node -e "
const fs = require('fs');
const board = JSON.parse(fs.readFileSync('$BOARD_FILE', 'utf8'));
const now = Date.now();

const running = board.filter(t => t.status === 'running');
const done = board.filter(t => t.status === 'done');
const failed = board.filter(t => t.status === 'failed');

function formatDuration(ms) {
  if (!ms || ms < 0) return '-';
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs > 0 ? m + 'm' + rs + 's' : m + 'm';
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return h + 'h' + (rm > 0 ? rm + 'm' : '');
}

function elapsed(t) {
  const start = new Date(t.spawnTime).getTime();
  const end = t.completeTime ? new Date(t.completeTime).getTime() : now;
  return formatDuration(end - start);
}

function modelName(t) {
  const m = t.model || t.agentId || '-';
  // strip provider prefix (e.g. 'openai/gpt-4' -> 'gpt-4')
  return m.includes('/') ? m.split('/').pop() : m;
}

function statusIcon(s) {
  if (s === 'running') return '🟢运行中';
  if (s === 'done') return '✅完成';
  if (s === 'failed') return '❌失败';
  return s;
}

const showAll = '${SHOW_ALL}' === '--all';

// Build rows: always show all running, then recent done/failed
let rows = [];
running.forEach(t => rows.push(t));

const completed = [...done, ...failed].sort((a, b) => {
  const ta = new Date(a.completeTime || 0).getTime();
  const tb = new Date(b.completeTime || 0).getTime();
  return tb - ta;
});

if (showAll) {
  completed.forEach(t => rows.push(t));
} else {
  completed.slice(0, 5).forEach(t => rows.push(t));
}

let out = '📋 Agent任务看板\n\n';
out += 'Agent并行总数：' + running.length + '\n\n';

if (rows.length > 0) {
  out += '| 任务 | 模型 | 状态 | 耗时 |\n';
  out += '|------|------|------|------|\n';
  rows.forEach(t => {
    const label = (t.label || t.taskId || '-').substring(0, 30);
    out += '| ' + label + ' | ' + modelName(t) + ' | ' + statusIcon(t.status) + ' | ' + elapsed(t) + ' |\n';
  });
} else {
  out += '暂无任务\n';
}

out += '\n汇总：done=' + done.length + ' / failed=' + failed.length + ' / running=' + running.length;

if (!showAll && completed.length > 5) {
  out += '\n（仅显示最近5条，用 --all 查看全部 ' + completed.length + ' 条）';
}

console.log(out);
"
