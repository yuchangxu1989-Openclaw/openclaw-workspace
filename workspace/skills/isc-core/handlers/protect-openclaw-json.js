'use strict';
/**
 * ISC Handler: protect-openclaw-json-001 [IRON]
 * openclaw.json是系统核心配置，只有主Agent或用户可以修改。
 * 子Agent的sed/replace操作必须排除此文件。
 *
 * 触发事件: subagent.file.write
 * 检查逻辑: 拦截所有子Agent对openclaw.json的写入/修改操作
 */
const fs = require('fs');
const path = require('path');

const PROTECTED_FILES = [
  'openclaw.json',
  '/root/.openclaw/openclaw.json'
];

const DANGEROUS_COMMANDS = [
  /sed\s+.*openclaw\.json/i,
  /echo\s+.*>\s*.*openclaw\.json/i,
  /cat\s+.*>\s*.*openclaw\.json/i,
  /cp\s+.*openclaw\.json/i,
  /mv\s+.*openclaw\.json/i,
  /tee\s+.*openclaw\.json/i,
  /write.*openclaw\.json/i,
  /replace.*openclaw\.json/i
];

function check(context) {
  const result = {
    ruleId: 'protect-openclaw-json-001',
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
    const agentId = payload.agentId || payload.agent_id || context.agentId || '';

    // Check 1: Is this a subagent trying to write to openclaw.json?
    const targetFile = payload.file || payload.path || payload.target || '';
    const isProtected = PROTECTED_FILES.some(pf => {
      const resolved = path.resolve(targetFile);
      return resolved.endsWith('openclaw.json') || targetFile.includes('openclaw.json');
    });

    if (isProtected && agentId && agentId !== 'main') {
      result.passed = false;
      result.findings.push({
        level: 'iron',
        message: `[IRON VIOLATION] 子Agent "${agentId}" 试图修改 openclaw.json`,
        detail: 'openclaw.json只有主Agent或用户可以修改。子Agent操作已拦截。',
        remediation: '子Agent的批量文件操作必须排除openclaw.json'
      });
    }

    // Check 2: Command-level check
    const command = payload.command || payload.cmd || '';
    if (typeof command === 'string') {
      for (const pattern of DANGEROUS_COMMANDS) {
        if (pattern.test(command)) {
          // Allow if it's main agent
          if (agentId === 'main') continue;
          result.passed = false;
          result.findings.push({
            level: 'iron',
            message: `[IRON VIOLATION] 检测到危险命令操作openclaw.json: ${command.substring(0, 100)}`,
            detail: '子Agent不得通过sed/echo/cp等命令修改openclaw.json'
          });
          break;
        }
      }
    }

    // Check 3: Verify openclaw.json integrity (MD5 check if baseline exists)
    const baselinePath = '/root/.openclaw/.openclaw-json-md5';
    const ocPath = '/root/.openclaw/openclaw.json';
    if (fs.existsSync(baselinePath) && fs.existsSync(ocPath)) {
      try {
        const crypto = require('crypto');
        const currentMd5 = crypto.createHash('md5')
          .update(fs.readFileSync(ocPath))
          .digest('hex');
        const baselineMd5 = fs.readFileSync(baselinePath, 'utf8').trim();
        if (currentMd5 !== baselineMd5) {
          result.findings.push({
            level: 'warning',
            message: `openclaw.json MD5已变更: ${baselineMd5} → ${currentMd5}`,
            detail: '如非用户授权修改，需立即恢复'
          });
        }
      } catch (e) { /* integrity check error, skip */ }
    }

    result.checked = true;
  } catch (err) {
    result.passed = false;
    result.findings.push({ level: 'error', message: err.message });
  }

  return result;
}

module.exports = { check };
