#!/bin/bash
# 输出当前task-board状态
BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"
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
const failed = board.filter(t => t.status === 'failed' && new Date(t.completeTime).getTime() >= todayStart && new Date(t.completeTime).getTime() < todayEnd);
const timeout = board.filter(t => t.status === 'timeout' && new Date(t.completeTime).getTime() >= todayStart && new Date(t.completeTime).getTime() < todayEnd);
console.log('=== Agent任务看板（' + dateStr + '）===');
console.log('Agent并行总数: ' + running.length);
console.log('');
if (running.length) {
  console.log('🟢 进行中:');
  running.forEach(t => console.log('  ' + t.label + ' | ' + t.agentId + '/' + t.model + ' | ' + t.spawnTime));
}
if (done.length) {
  console.log('✅ 已完成: ' + done.length + '个');
  done.slice(-5).forEach(t => console.log('  ' + t.label + ' | ' + t.agentId + '/' + t.model));
}
if (failed.length) {
  console.log('❌ 失败: ' + failed.length + '个');
  failed.forEach(t => console.log('  ' + t.label + ' | ' + t.agentId + '/' + t.model));
}
console.log('');
console.log('汇总(今日): done=' + done.length + ' / timeout=' + timeout.length + ' / failed=' + failed.length + ' / running=' + running.length + ' / total=' + board.length);
"
