'use strict';
/**
 * ISC Handler: subagent-thinking-mandatory-001 [IRON]
 * 子Agent必须开启thinking模式，禁止关闭。
 * 没有thinking的子Agent认知质量无法保证。
 *
 * 触发事件: subagent.spawn.requested
 * 检查逻辑: 验证spawn参数中thinking字段为"enabled"
 */

function check(context) {
  const result = {
    ruleId: 'subagent-thinking-mandatory-001',
    severity: 'iron',
    passed: true,
    findings: [],
    timestamp: new Date().toISOString()
  };

  try {
    if (!context || typeof context !== 'object') {
      result.passed = false;
      result.findings.push({ level: 'error', message: 'Invalid context provided' });
      return result;
    }

    const event = context.event || {};
    const payload = context.payload || event.payload || {};

    // Check 1: Spawn parameters - thinking must be enabled
    const thinking = payload.thinking || payload.thinkingMode || '';
    if (thinking && thinking !== 'enabled') {
      result.passed = false;
      result.findings.push({
        level: 'iron',
        message: `[IRON VIOLATION] 子Agent thinking模式未开启: thinking="${thinking}"`,
        detail: '所有子Agent必须开启thinking模式。',
        remediation: '设置 thinking: "enabled"'
      });
    }

    // Check 2: If thinking is explicitly disabled or set to false
    if (thinking === 'disabled' || thinking === 'off' || thinking === 'false' || thinking === false) {
      result.passed = false;
      result.findings.push({
        level: 'iron',
        message: '[IRON VIOLATION] 子Agent thinking被显式关闭',
        detail: '禁止关闭子Agent的thinking模式。'
      });
    }

    // Check 3: Check spawn config object
    const spawnConfig = payload.config || payload.spawnConfig || {};
    if (spawnConfig.thinking === 'disabled' || spawnConfig.thinking === false) {
      result.passed = false;
      result.findings.push({
        level: 'iron',
        message: '[IRON VIOLATION] spawn配置中thinking被关闭',
        detail: '子Agent spawn配置必须包含 thinking: "enabled"'
      });
    }

    // Check 4: Verify openclaw.json global default
    try {
      const fs = require('fs');
      const ocPath = '/root/.openclaw/openclaw.json';
      if (fs.existsSync(ocPath)) {
        const config = JSON.parse(fs.readFileSync(ocPath, 'utf8'));
        const globalThinking = (config.defaults || {}).thinking ||
                               (config.spawn || {}).thinking || '';
        if (globalThinking && globalThinking !== 'enabled') {
          result.findings.push({
            level: 'warning',
            message: `openclaw.json全局thinking配置非enabled: "${globalThinking}"`,
            detail: '建议设置全局默认 thinking: "enabled"'
          });
        }
      }
    } catch (e) { /* config read error, skip */ }

    result.checked = true;
  } catch (err) {
    result.passed = false;
    result.findings.push({ level: 'error', message: err.message });
  }

  return result;
}

module.exports = { check };
