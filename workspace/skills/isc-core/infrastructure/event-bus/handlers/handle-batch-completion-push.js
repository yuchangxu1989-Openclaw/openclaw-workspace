#!/usr/bin/env node
/**
 * Handler: rule.batch-completion-auto-push-001
 * 批次完成自动推送看板
 *
 * Trigger: subagent.batch.all_completed (running_count == 0 AND batch_had_tasks)
 * Action: 执行 show-task-board-feishu.sh 并推送结果给用户
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const WORKSPACE = process.env.ISC_WORKSPACE || path.resolve(__dirname, '../../..');
const VIOLATION_CODE = 'BADCASE-BATCH-NO-PUSH';

/**
 * Check trigger conditions: running_count == 0 AND batch had tasks
 */
function checkTrigger(event) {
  if (!event || event.type !== 'subagent.batch.all_completed') {
    return { triggered: false, reason: `event type mismatch: ${event?.type}` };
  }
  const runningCount = event.running_count ?? event.runningCount ?? 0;
  const batchHadTasks = event.batch_had_tasks ?? event.batchHadTasks ?? event.total_tasks > 0;

  if (runningCount !== 0) {
    return { triggered: false, reason: `running_count=${runningCount}, not zero` };
  }
  if (!batchHadTasks) {
    return { triggered: false, reason: 'batch had no tasks' };
  }
  return { triggered: true, reason: 'all tasks completed, batch had tasks' };
}

/**
 * Generate task board output
 * Tries show-task-board-feishu.sh first, falls back to subagent status scan
 */
function generateBoard() {
  const scriptPath = path.join(WORKSPACE, 'scripts', 'show-task-board-feishu.sh');

  // Try the dedicated script first
  if (fs.existsSync(scriptPath)) {
    try {
      const output = execSync(`bash "${scriptPath}"`, {
        cwd: WORKSPACE,
        encoding: 'utf-8',
        timeout: 30000,
        env: { ...process.env, ISC_WORKSPACE: WORKSPACE },
      });
      return { source: 'script', content: output.trim() };
    } catch (err) {
      console.error(`show-task-board-feishu.sh failed: ${err.message}`);
    }
  }

  // Fallback: scan task status files
  const statusDir = path.join(WORKSPACE, 'status');
  if (fs.existsSync(statusDir)) {
    try {
      const files = fs.readdirSync(statusDir).filter(f => f.endsWith('.json'));
      const tasks = files.map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(statusDir, f), 'utf-8'));
        } catch { return { file: f, status: 'unknown' }; }
      });

      const total = tasks.length;
      const completed = tasks.filter(t => t.status === 'completed' || t.status === 'done').length;
      const failed = tasks.filter(t => t.status === 'failed' || t.status === 'error').length;

      const lines = [
        `📋 任务看板 (${new Date().toISOString()})`,
        `总计: ${total} | ✅完成: ${completed} | ❌失败: ${failed}`,
        '---',
        ...tasks.map(t => `• [${(t.status || 'unknown').toUpperCase()}] ${t.name || t.label || t.id || t.file}`),
      ];
      return { source: 'status-scan', content: lines.join('\n') };
    } catch (err) {
      console.error(`Status scan failed: ${err.message}`);
    }
  }

  return {
    source: 'minimal',
    content: `📋 批次任务已全部完成 (${new Date().toISOString()})\n详细看板脚本未找到，请检查 scripts/show-task-board-feishu.sh`,
  };
}

/**
 * Push board to user. In real deployment this sends via Feishu/message channel.
 * Here we output to stdout for the event bus to relay.
 */
function pushToUser(board) {
  const payload = {
    action: 'push_board',
    channel: 'feishu',
    content: board.content,
    source: board.source,
    timestamp: new Date().toISOString(),
  };

  // Output as structured JSON for event bus consumption
  console.log(JSON.stringify(payload, null, 2));
  return payload;
}

/**
 * Main handler entry point
 */
function handle(event) {
  const trigger = checkTrigger(event);

  if (!trigger.triggered) {
    return { skipped: true, reason: trigger.reason };
  }

  // Generate board
  const board = generateBoard();

  if (!board || !board.content) {
    // Violation: should push but can't generate board
    const violation = {
      rule: 'rule.batch-completion-auto-push-001',
      violation: VIOLATION_CODE,
      message: '🚫 批次完成但无法生成看板 — BADCASE',
      timestamp: new Date().toISOString(),
    };
    console.error(JSON.stringify(violation));
    return violation;
  }

  // Push
  const pushResult = pushToUser(board);

  return {
    rule: 'rule.batch-completion-auto-push-001',
    timestamp: new Date().toISOString(),
    trigger: trigger.reason,
    board: { source: board.source, length: board.content.length },
    pushed: true,
    result: pushResult,
  };
}

// CLI mode
if (require.main === module) {
  let event = {
    type: 'subagent.batch.all_completed',
    running_count: 0,
    batch_had_tasks: true,
    total_tasks: 5,
  };
  if (process.argv[2]) {
    try {
      event = JSON.parse(process.argv[2]);
    } catch {
      console.error('Usage: node handle-batch-completion-push.js [event-json]');
      process.exit(1);
    }
  }
  const result = handle(event);
  process.exit(result.violation ? 1 : 0);
}

module.exports = { handle, checkTrigger, generateBoard, pushToUser };
