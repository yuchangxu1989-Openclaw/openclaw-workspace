'use strict';
/**
 * ISC Handler: rule.board-push-on-task-complete-001
 * 当子Agent任务完成/超时/失败时，触发飞书看板推送
 * 
 * 注意：ISC事件总线目前不会自动fire事件，此handler主要作为
 * 可被手动调用的模块。真正的自动化靠 auto-refresh.sh + AGENTS.md指令。
 */

const { execSync } = require('child_process');
const path = require('path');

const SCRIPTS_DIR = '/root/.openclaw/workspace/skills/public/multi-agent-dispatch/scripts';
const AUTO_REFRESH = '/root/.openclaw/workspace/skills/public/multi-agent-dispatch/scripts/auto-refresh.sh';

function check(context) {
  const result = {
    ruleId: 'rule.board-push-on-task-complete-001',
    passed: true,
    findings: [],
    checked: true,
    timestamp: new Date().toISOString(),
    severity: 'medium'
  };

  try {
    if (!context || typeof context !== 'object') {
      result.passed = false;
      result.findings.push({ level: 'error', message: '无效的context' });
      return result;
    }

    // 调用auto-refresh.sh完成看板刷新+推送
    const output = execSync(`bash ${AUTO_REFRESH}`, {
      timeout: 30000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    result.findings.push({
      level: 'info',
      message: '看板已刷新并推送',
      output: output.trim().substring(0, 500)
    });

  } catch (err) {
    // 刷新失败不阻塞主流程，只记录
    result.findings.push({
      level: 'warn',
      message: `看板刷新失败（不阻塞）: ${err.message}`
    });
  }

  return result;
}

module.exports = { check };
