#!/bin/bash
# 输出当前task-board状态
BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"
node -e "
const fs = require('fs');
const board = JSON.parse(fs.readFileSync('$BOARD_FILE', 'utf8'));
const running = board.filter(t => t.status === 'running');
const done = board.filter(t => t.status === 'done');
const failed = board.filter(t => t.status === 'failed');
console.log('=== Agent任务看板 ===');
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
console.log('汇总: done=' + done.length + ' / failed=' + failed.length + ' / running=' + running.length + ' / total=' + board.length);
"
