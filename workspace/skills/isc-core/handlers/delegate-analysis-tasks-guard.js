'use strict';

/**
 * ISC Handler: delegate-analysis-tasks-guard
 * Rule: rule.delegate-analysis-tasks-001
 * 
 * 检测主Agent是否在自己执行分析/查询/排查类操作，
 * 若检测到违规，记录Badcase并生成告警。
 * 
 * 触发时机：定期审计主Agent的session日志
 */

const fs = require('fs');
const path = require('path');
const { writeReport, emitEvent, gateResult } = require('../lib/handler-utils');

// 主Agent不应自己执行的操作模式
const ANALYSIS_PATTERNS = [
  /\bread\b.*file/i,
  /\bcat\s+\//,
  /\bgrep\s+/,
  /\bfind\s+\//,
  /\bls\s+\//,
  /\bhead\s+/,
  /\btail\s+/,
  /\bwc\s+/,
  /\bawk\s+/,
  /\bsed\s+/,
  /排查|核查|检查|扫描|分析.*文件|查看.*配置|查看.*日志/,
];

// 主Agent允许自己做的操作
const ALLOWED_PATTERNS = [
  /sessions_spawn/,
  /subagents/,
  /memory_search/,
  /memory_timeline/,
  /task_summary/,
  /skill_get/,
  /简单.*回答|直接.*回答/,
];

/**
 * 分析一段主Agent执行记录，判断是否存在角色越位
 */
function detectViolations(executionLog) {
  const violations = [];
  const lines = typeof executionLog === 'string' ? executionLog.split('\n') : [];

  for (const line of lines) {
    // 跳过子Agent上下文中的操作
    if (/subagent|depth\s*[1-9]/i.test(line)) continue;

    for (const pattern of ANALYSIS_PATTERNS) {
      if (pattern.test(line)) {
        // 确认不在允许列表中
        const isAllowed = ALLOWED_PATTERNS.some(ap => ap.test(line));
        if (!isAllowed) {
          violations.push({
            line: line.substring(0, 200),
            pattern: pattern.toString(),
            severity: 'high',
            remedy: '此操作应委派给子Agent执行',
          });
          break;
        }
      }
    }
  }

  return violations;
}

/**
 * 审计主Agent最近的session，检查是否有越位执行
 */
module.exports = async function handler(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || process.cwd();
  const bus = context?.bus;

  logger.info?.('[delegate-analysis-tasks-guard] 开始审计主Agent执行记录');

  const checks = [];
  const allViolations = [];

  // 扫描最近的session日志
  const logDir = path.join(root, 'logs');
  const sessionLogDir = path.join(logDir, 'sessions');

  if (fs.existsSync(sessionLogDir)) {
    const logFiles = fs.readdirSync(sessionLogDir)
      .filter(f => f.endsWith('.jsonl') || f.endsWith('.log'))
      .sort()
      .slice(-5); // 最近5个session

    for (const logFile of logFiles) {
      try {
        const content = fs.readFileSync(path.join(sessionLogDir, logFile), 'utf8');
        const violations = detectViolations(content);
        if (violations.length > 0) {
          allViolations.push({ file: logFile, violations });
        }
      } catch (e) {
        logger.warn?.(`[delegate-analysis-tasks-guard] 读取日志失败: ${logFile}`);
      }
    }
  }

  checks.push({
    name: 'no-analysis-self-execution',
    ok: allViolations.length === 0,
    message: allViolations.length === 0
      ? '主Agent未发现越位执行分析操作'
      : `发现 ${allViolations.reduce((s, v) => s + v.violations.length, 0)} 处主Agent越位执行分析操作`,
  });

  // 如果发现违规，发射事件
  if (allViolations.length > 0 && bus) {
    emitEvent(bus, 'isc.violation.detected', {
      rule: 'rule.delegate-analysis-tasks-001',
      severity: 'high',
      count: allViolations.reduce((s, v) => s + v.violations.length, 0),
      violations: allViolations.slice(0, 3), // 限制大小
    });
  }

  const result = gateResult('delegate-analysis-tasks-guard', checks, { failClosed: false });

  writeReport(
    path.join(root, 'reports', 'delegate-analysis-tasks-audit.json'),
    {
      rule: 'rule.delegate-analysis-tasks-001',
      timestamp: new Date().toISOString(),
      violations: allViolations,
      ...result,
    }
  );

  logger.info?.(`[delegate-analysis-tasks-guard] 审计完成: ${result.passed ? '✅通过' : '❌发现违规'}`);
  return result;
};
