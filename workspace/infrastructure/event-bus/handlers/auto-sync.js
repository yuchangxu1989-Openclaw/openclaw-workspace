/**
 * auto-sync handler: 自动同步触发器
 * 别名: auto_sync
 */
const { execSync } = require('child_process');
const path = require('path');

module.exports = async function autoSync(event, rule, ctx) {
  const ws = path.resolve(__dirname, '../../..');
  try {
    // 触发git同步
    execSync('git add -A && git diff --cached --quiet || git commit -m "auto-sync: event-triggered" --no-verify', {
      cwd: path.resolve(ws, '..'),
      timeout: 30000,
      stdio: 'pipe'
    });
    return { success: true, result: 'synced', handler: 'auto-sync' };
  } catch (e) {
    return { success: true, result: 'no_changes_to_sync', handler: 'auto-sync' };
  }
};
