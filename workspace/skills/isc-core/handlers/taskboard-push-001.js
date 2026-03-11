#!/usr/bin/env node
/**
 * ISC Handler: taskboard-push-001
 * Pushes task board to Feishu when triggered.
 * Wraps show-task-board-feishu.sh execution.
 */
const { execSync } = require('child_process');
const path = require('path');

const WS = process.env.OPENCLAW_WORKSPACE || '/root/.openclaw/workspace';

function main() {
  const script = path.join(WS, 'scripts/push-feishu-board.sh');
  try {
    const out = execSync(`bash ${script}`, { timeout: 30000, encoding: 'utf8' });
    console.log('[taskboard-push-001] pushed:', out.trim().slice(0, 200));
    return { success: true };
  } catch (e) {
    console.error('[taskboard-push-001] failed:', e.message);
    return { success: false, error: e.message };
  }
}

if (require.main === module) main();
module.exports = { main };
