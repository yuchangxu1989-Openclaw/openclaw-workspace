#!/bin/bash
# show-task-board-feishu.sh - 生成飞书可读的任务看板
# ISC-REPORT-SUBAGENT-BOARD-001 标准格式
# 用法: bash show-task-board-feishu.sh [--all] [--json]
# 默认模式：只显示running任务 + done/timeout/failed汇总数字
# --all: 显示全部任务
# --json: 输出JSON对象 {"rows":[...],"running":N,"done":N,"timeout":N,"failed":N,"summary":"..."}

BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"

if [ ! -f "$BOARD_FILE" ]; then
  if [[ "$*" == *"--json"* ]]; then
    echo '{"rows":[],"running":0,"done":0,"timeout":0,"failed":0,"summary":"暂无任务记录"}'
  else
    echo "📋 Agent任务看板"
    echo ""
    echo "暂无任务记录"
  fi
  exit 0
fi

SHOW_ALL="false"
JSON_MODE="false"
for arg in "$@"; do
  [ "$arg" = "--all" ] && SHOW_ALL="true"
  [ "$arg" = "--json" ] && JSON_MODE="true"
done

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
const done = board.filter(t => t.status === 'done' && new Date(t.completeTime).getTime() >= todayStart && new Date(t.completeTime).getTime() < todayEnd);
const timeout = board.filter(t => t.status === 'timeout' && new Date(t.completeTime).getTime() >= todayStart && new Date(t.completeTime).getTime() < todayEnd);
const failed = board.filter(t => t.status === 'failed' && new Date(t.completeTime).getTime() >= todayStart && new Date(t.completeTime).getTime() < todayEnd);

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
  return m.includes('/') ? m.split('/').pop() : m;
}

function statusIcon(s) {
  if (s === 'running') return '🟢运行中';
  if (s === 'done') return '✅完成';
  if (s === 'timeout') return '⏰超时';
  if (s === 'failed') return '❌失败';
  return s;
}

const showAll = $SHOW_ALL;
const jsonMode = $JSON_MODE;

// 按 spawnTime 倒序
const allTasks = [...board].sort((a, b) => {
  const ta = new Date(a.spawnTime || 0).getTime();
  const tb = new Date(b.spawnTime || 0).getTime();
  return tb - ta;
});

// 默认只显示running，--all显示全部
const rows = showAll ? allTasks : allTasks.filter(t => t.status === 'running');

const summaryLine = '✅完成 ' + done.length + ' | ⏰超时 ' + timeout.length + ' | ❌失败 ' + failed.length;

if (jsonMode) {
  const jsonRows = rows.map(t => ({
    task: (t.description || t.label || t.taskId || '-').substring(0, 30),
    model: modelName(t),
    status: statusIcon(t.status),
    duration: elapsed(t)
  }));
  console.log(JSON.stringify({
    rows: jsonRows,
    running: running.length,
    done: done.length,
    timeout: timeout.length,
    failed: failed.length,
    summary: summaryLine
  }));
} else {
  let out = '📋 Agent任务看板（' + dateStr + '）\n\n';
  out += 'Agent并行总数：' + running.length + '\n\n';
  if (rows.length > 0) {
    out += '| 任务 | 模型 | 状态 | 耗时 |\n';
    out += '|------|------|------|------|\n';
    rows.forEach(t => {
      const label = (t.description || t.label || t.taskId || '-').substring(0, 30);
      out += '| ' + label + ' | ' + modelName(t) + ' | ' + statusIcon(t.status) + ' | ' + elapsed(t) + ' |\n';
    });
  } else {
    out += '暂无运行中任务\n';
  }
  out += '\n' + summaryLine;
  if (showAll) {
    out += '\n（共 ' + allTasks.length + ' 条任务）';
  }
  console.log(out);
}
"
