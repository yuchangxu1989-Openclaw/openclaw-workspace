'use strict';

/**
 * Example: how the main agent integrates dispatch + reporting.
 *
 * This shows the conceptual flow, not a runnable script.
 * The main agent reads SKILL.md and follows this pattern.
 */

const { DispatchEngine } = require('../dispatch-engine');

// ── 1. Agent initialises dispatch engine at session start ────────────────────

const engine = new DispatchEngine({ maxSlots: 19 });

// ── 2. User says: "给我做 auth 模块、支付模块、用户中心" ────────────────────

// Agent identifies 3 deterministic tasks → enqueue ALL immediately
// Do NOT explain first, do NOT wait — dispatch is priority #1

engine.enqueueBatch([
  {
    title: '实现 auth 模块',
    model: 'codex/gpt-5.4',
    source: 'user-request',
    priority: 'high',
    payload: {
      task: '实现完整的 auth 模块，包括 JWT、登录、注册...',
      cwd: '/project',
    },
  },
  {
    title: '实现支付模块',
    model: 'codex/gpt-5.4',
    source: 'user-request',
    priority: 'high',
    payload: {
      task: '实现支付模块，支持微信支付和支付宝...',
      cwd: '/project',
    },
  },
  {
    title: '实现用户中心',
    model: 'codex/gpt-5.4',
    source: 'user-request',
    priority: 'normal',
    payload: {
      task: '实现用户中心，个人资料、设置页面...',
      cwd: '/project',
    },
  },
]);

// All 3 are now in spawning state. The agent then spawns via sessions_spawn.
// AFTER dispatching, the agent can explain to the user what it's doing.

console.log('After batch enqueue:');
console.log(`  Busy: ${engine.busyCount()}`);
console.log(`  Free: ${engine.freeSlots()}`);
console.log(`  Queue: ${engine.queueDepth()}`);

// ── 3. Mid-conversation, user adds: "也做一下数据库迁移" ─────────────────────

// Agent enqueues IMMEDIATELY — doesn't wait for current tasks to finish
engine.enqueue({
  title: '数据库迁移脚本',
  model: 'codex/gpt-5.4',
  source: 'user-request',
  priority: 'normal',
  payload: { task: '编写 PostgreSQL 迁移脚本...' },
});

console.log('\nAfter adding migration task:');
console.log(`  Busy: ${engine.busyCount()}`); // 4
console.log(`  Free: ${engine.freeSlots()}`); // 15

// ── 4. Subagent completes → markDone → auto-backfill ─────────────────────────

// When a subagent announces completion:
const tasks = engine.activeTasks();
if (tasks.length > 0) {
  const firstTask = tasks[0];
  engine.markRunning(firstTask.taskId);
  engine.markDone(firstTask.taskId, { result: 'auth module complete, PR #42' });
  // If there's anything in queue, it auto-dispatches. Zero delay.
}

// ── 5. Read live board for reporting ─────────────────────────────────────────

const board = engine.liveBoard();
console.log('\nLive board:');
console.log(JSON.stringify(board.summary, null, 2));

// Pass to reporting skill:
// const { formatReport } = require('../../multi-agent-reporting/index');
// const report = formatReport(engine.allTasks());
