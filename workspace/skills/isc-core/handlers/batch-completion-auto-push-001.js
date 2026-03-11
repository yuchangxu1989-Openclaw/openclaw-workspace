/**
 * batch-completion-auto-push-001 - 批次完成自动推送看板
 * 所有子Agent完成后自动推送最终看板
 */
const { execSync } = require('child_process');
const PUSH_SCRIPT = '/root/.openclaw/workspace/scripts/push-feishu-board.sh';

module.exports = {
  name: 'batch-completion-auto-push',
  ruleId: 'BATCH-COMPLETION-AUTO-PUSH-001',
  async handle(context) {
    const { running_count = 0 } = context;
    if (running_count > 0) return { action: 'skip', reason: `still ${running_count} running` };
    try {
      execSync(`bash ${PUSH_SCRIPT}`, { timeout: 30000, stdio: 'pipe' });
      return { action: 'pushed', message: '看板已自动推送' };
    } catch (e) {
      return { action: 'error', message: e.message };
    }
  }
};
