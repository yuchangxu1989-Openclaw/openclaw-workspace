#!/usr/bin/env node
// 清理任务看板中的陈旧任务
const fs = require('fs');
const path = require('path');

const BOARD_PATH = path.join(__dirname, '../logs/subagent-task-board.json');
const RETRY_PATH = path.join(__dirname, '../logs/auto-retry-queue.json');

// 过期模式
const STALE_PATTERNS = [
  /^isc-expand-/, /^isc-p0-/, /^isc-p1-/, /^isc-p2-/, /^isc-wave2-/, /^isc-none-/, /^isc-fix-/,
  /^eval-mine-/, /^eval-batch-/, /^eval-clean-/, /^eval-v3-clean-/, /^eval-audit-/,
  /^fix-gc-batch-/, /^fix-gate-/, /^fix-hook-/, /^fix-and-commit-/, /^final-commit-fix$/, /^fix-format-/,
  /^gongzhonghao-2026-03-08-/,
  /^v3-clean-/,
  /^execute-rename-all$/, /^lto-.*-rename-/,
];

function isStale(label) {
  return STALE_PATTERNS.some(p => p.test(label));
}

// 1. 清理任务看板
const board = JSON.parse(fs.readFileSync(BOARD_PATH, 'utf8'));
let archivedCount = 0;
const beforeTimeout = board.filter(t => t.status === 'timeout').length;

for (const task of board) {
  if (task.status === 'timeout' && task.retry_count === 0 && isStale(task.label)) {
    task.status = 'archived';
    task.archived_reason = '陈旧任务自动归档';
    task.archived_at = new Date().toISOString();
    archivedCount++;
  }
}

fs.writeFileSync(BOARD_PATH, JSON.stringify(board, null, 2) + '\n');

// 2. 清理 auto-retry-queue
const retryQueue = JSON.parse(fs.readFileSync(RETRY_PATH, 'utf8'));
const retryBefore = retryQueue.length;
const cleanedRetry = retryQueue.filter(t => !isStale(t.label));
const retryRemoved = retryBefore - cleanedRetry.length;
fs.writeFileSync(RETRY_PATH, JSON.stringify(cleanedRetry, null, 2) + '\n');

// 3. 统计
const afterTimeout = board.filter(t => t.status === 'timeout').length;
console.log('=== 陈旧任务清理报告 ===');
console.log(`任务看板总数: ${board.length}`);
console.log(`清理前 timeout 任务: ${beforeTimeout}`);
console.log(`归档为 archived: ${archivedCount}`);
console.log(`清理后 timeout 任务: ${afterTimeout}`);
console.log(`auto-retry-queue 清理前: ${retryBefore}, 清理后: ${cleanedRetry.length}, 移除: ${retryRemoved}`);
