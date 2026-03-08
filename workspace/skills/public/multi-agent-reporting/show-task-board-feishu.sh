#!/bin/bash
# show-task-board-feishu.sh - 生成飞书可读的任务看板
# ISC-REPORT-SUBAGENT-BOARD-001 标准格式
# 用法: bash show-task-board-feishu.sh [--all] [--json]
# --json: 输出JSON对象 {"rows":[...],"running":N,"done":N,"failed":N,"summary":"..."}

BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"

if [ ! -f "$BOARD_FILE" ]; then
  if [[ "$*" == *"--json"* ]]; then
    echo '{"rows":[],"running":0,"done":0,"failed":0,"summary":"暂无任务记录"}'
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
  return m.includes('/') ? m.split('/').pop() : m;
}

function statusIcon(s) {
  if (s === 'running') return '🟢运行中';
  if (s === 'done') return '✅完成';
  if (s === 'failed') return '❌失败';
  return s;
}

const showAll = $SHOW_ALL;
const jsonMode = $JSON_MODE;

// 所有任务按 spawnTime 倒序（最新在前）
const allTasks = [...board].sort((a, b) => {
  const ta = new Date(a.spawnTime || 0).getTime();
  const tb = new Date(b.spawnTime || 0).getTime();
  return tb - ta;
});

const completed = [...done, ...failed];
let rows = [];
if (showAll) {
  rows = allTasks;
} else {
  // running 全部显示，completed 只显示最近5条，但整体按 spawnTime 倒序
  const shownCompleted = new Set(
    completed.sort((a, b) => {
      const ta = new Date(a.completeTime || 0).getTime();
      const tb = new Date(b.completeTime || 0).getTime();
      return tb - ta;
    }).slice(0, 5).map(t => t.taskId || t.label || JSON.stringify(t))
  );
  rows = allTasks.filter(t => t.status === 'running' || shownCompleted.has(t.taskId || t.label || JSON.stringify(t)));
}

if (jsonMode) {
  const jsonRows = rows.map(t => ({
    task: (t.description || t.label || t.taskId || '-').substring(0, 30),
    model: modelName(t),
    status: statusIcon(t.status),
    duration: elapsed(t)
  }));
  let summary = 'done=' + done.length + ' / failed=' + failed.length + ' / running=' + running.length;
  if (!showAll && completed.length > 5) {
    summary += '（仅显示最近5条，共' + completed.length + '条）';
  }
  console.log(JSON.stringify({
    rows: jsonRows,
    running: running.length,
    done: done.length,
    failed: failed.length,
    summary: summary
  }));
} else {
  let out = '📋 Agent任务看板\n\n';
  out += 'Agent并行总数：' + running.length + '\n\n';
  if (rows.length > 0) {
    out += '| 任务 | 模型 | 状态 | 耗时 |\n';
    out += '|------|------|------|------|\n';
    rows.forEach(t => {
      const label = (t.description || t.label || t.taskId || '-').substring(0, 30);
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
}
"
