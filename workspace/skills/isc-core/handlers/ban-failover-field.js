'use strict';
/**
 * ISC Handler: ban-failover-field-001 [IRON]
 * failover字段在OpenClaw中不合法，写入必崩。
 * 任何Agent在任何配置文件中都不得写入failover字段。
 * 
 * 触发事件: subagent.file.write
 * 检查逻辑: 扫描写入内容和目标文件，拦截任何包含failover字段的写入
 */
const fs = require('fs');
const path = require('path');

const SCAN_TARGETS = [
  'openclaw.json',
  'openclaw.yaml',
  'config.json',
  'config.yaml',
  '.openclaw/'
];

function check(context) {
  const result = {
    ruleId: 'ban-failover-field-001',
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

    // Check 1: If this is a file write event, inspect the content
    const content = payload.content || payload.data || '';
    const filePath = payload.file || payload.path || payload.target || '';

    if (typeof content === 'string' && /failover/i.test(content)) {
      result.passed = false;
      result.findings.push({
        level: 'iron',
        message: `[IRON VIOLATION] 检测到failover字段写入: ${filePath || '(unknown file)'}`,
        detail: 'failover字段在OpenClaw中不合法，写入必崩。操作已拦截。'
      });
    }

    // Check 2: If content is an object (parsed JSON), check for failover key
    if (typeof content === 'object' && content !== null) {
      const hasFailover = JSON.stringify(content).includes('failover');
      if (hasFailover) {
        result.passed = false;
        result.findings.push({
          level: 'iron',
          message: `[IRON VIOLATION] JSON对象中包含failover字段`,
          detail: 'failover字段在OpenClaw中不合法，写入必崩。操作已拦截。'
        });
      }
    }

    // Check 3: If a command is being executed (sed, echo, etc.), check for failover
    const command = payload.command || payload.cmd || '';
    if (typeof command === 'string' && /failover/i.test(command)) {
      result.passed = false;
      result.findings.push({
        level: 'iron',
        message: `[IRON VIOLATION] 命令中包含failover: ${command.substring(0, 100)}`,
        detail: 'failover字段在OpenClaw中不合法。命令已拦截。'
      });
    }

    // Check 4: Proactive scan - check if openclaw.json currently contains failover
    const openclawPath = path.resolve('/root/.openclaw/openclaw.json');
    if (fs.existsSync(openclawPath)) {
      try {
        const ocContent = fs.readFileSync(openclawPath, 'utf8');
        if (/failover/i.test(ocContent)) {
          result.passed = false;
          result.findings.push({
            level: 'iron',
            message: '[IRON VIOLATION] openclaw.json当前包含failover字段！需立即清除。',
            remediation: '手动编辑openclaw.json移除所有failover相关字段'
          });
        }
      } catch (e) { /* file read error, skip */ }
    }

    result.checked = true;
  } catch (err) {
    result.passed = false;
    result.findings.push({ level: 'error', message: err.message });
  }

  return result;
}

module.exports = { check };
