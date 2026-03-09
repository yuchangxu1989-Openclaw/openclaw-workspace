#!/bin/bash
# 薄封装 — 实际逻辑在技能目录
# stdout精简：只输出running任务表格+汇总行

BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"

# 如果参数含--all或--json，直接转发原脚本
if [[ "$*" == *"--all"* ]] || [[ "$*" == *"--json"* ]]; then
  exec bash "$(dirname "$0")/../skills/public/multi-agent-reporting/show-task-board-feishu.sh" "$@"
fi

# 默认模式：精简输出
if [ ! -f "$BOARD_FILE" ]; then
  echo "📋 暂无任务记录"
  exit 0
fi

node -e "
const fs = require('fs');
const board = JSON.parse(fs.readFileSync('$BOARD_FILE', 'utf8'));
const now = Date.now();

// 获取当天0点（Asia/Shanghai = UTC+8）
const tzOffset = 8 * 60 * 60 * 1000;
const todayStart = new Date(Math.floor((now + tzOffset) / 86400000) * 86400000 - tzOffset).getTime();
const todayEnd = todayStart + 86400000;

// 格式化日期
const dateStr = new Date(now + tzOffset).toISOString().slice(0, 10); // YYYY-MM-DD

const running = board.filter(t => t.status === 'running');
const done = board.filter(t => t.status === 'done' && new Date(t.completeTime).getTime() >= todayStart && new Date(t.completeTime).getTime() < todayEnd).length;
const timeout = board.filter(t => t.status === 'timeout' && new Date(t.completeTime).getTime() >= todayStart && new Date(t.completeTime).getTime() < todayEnd).length;
const failed = board.filter(t => t.status === 'failed' && new Date(t.completeTime).getTime() >= todayStart && new Date(t.completeTime).getTime() < todayEnd).length;

function elapsed(t) {
  const start = new Date(t.spawnTime).getTime();
  const end = t.completeTime ? new Date(t.completeTime).getTime() : now;
  const s = Math.floor((end - start) / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm';
  return Math.floor(m / 60) + 'h' + (m % 60) + 'm';
}

let out = '📋 Agent任务看板（' + dateStr + '）';
out += '\n并行: ' + running.length + ' | ✅' + done + ' ⏰' + timeout + ' ❌' + failed;
if (running.length > 0) {
  out += '\n| 任务 | 状态 | 耗时 |';
  out += '\n|------|------|------|';
  running.forEach(t => {
    const label = (t.description || t.label || '-').substring(0, 30);
    out += '\n| ' + label + ' | 🟢运行中 | ' + elapsed(t) + ' |';
  });
}
console.log(out);
"
