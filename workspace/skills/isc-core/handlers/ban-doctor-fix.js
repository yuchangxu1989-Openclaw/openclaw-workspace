'use strict';
/**
 * ISC Handler: ban-doctor-fix-001 [IRON]
 * openclaw doctor --fix 100%会把openclaw.json改崩导致无法启动。绝对禁止。
 * 只允许 openclaw doctor（只读验证）。
 *
 * 触发事件: subagent.command.exec
 * 检查逻辑: 拦截所有包含 'doctor --fix' 或 'doctor -f' 的命令
 */

const BANNED_PATTERNS = [
  /openclaw\s+doctor\s+--fix/i,
  /openclaw\s+doctor\s+-f\b/i,
  /doctor\s+--fix/i,
  /doctor\s+-f\b/i
];

function check(context) {
  const result = {
    ruleId: 'ban-doctor-fix-001',
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

    // Check 1: Direct command inspection
    const command = payload.command || payload.cmd || payload.script || '';
    if (typeof command === 'string') {
      for (const pattern of BANNED_PATTERNS) {
        if (pattern.test(command)) {
          result.passed = false;
          result.findings.push({
            level: 'iron',
            message: `[IRON VIOLATION] 检测到禁止命令: ${command.substring(0, 120)}`,
            detail: 'openclaw doctor --fix 100%会改崩openclaw.json。只允许 openclaw doctor（只读）。',
            remediation: '使用 openclaw doctor（不带--fix）进行只读诊断'
          });
          break;
        }
      }
    }

    // Check 2: If args array is provided
    const args = payload.args || [];
    if (Array.isArray(args)) {
      const argsStr = args.join(' ');
      for (const pattern of BANNED_PATTERNS) {
        if (pattern.test(argsStr)) {
          result.passed = false;
          result.findings.push({
            level: 'iron',
            message: `[IRON VIOLATION] 命令参数中包含禁止的--fix标志`,
            detail: 'openclaw doctor --fix 绝对禁止。'
          });
          break;
        }
      }
    }

    // Check 3: Shell script content
    const content = payload.content || payload.data || '';
    if (typeof content === 'string') {
      for (const pattern of BANNED_PATTERNS) {
        if (pattern.test(content)) {
          result.passed = false;
          result.findings.push({
            level: 'iron',
            message: `[IRON VIOLATION] 脚本内容中包含 doctor --fix`,
            detail: '脚本中不得包含 openclaw doctor --fix 命令。'
          });
          break;
        }
      }
    }

    result.checked = true;
  } catch (err) {
    result.passed = false;
    result.findings.push({ level: 'error', message: err.message });
  }

  return result;
}

module.exports = { check };
