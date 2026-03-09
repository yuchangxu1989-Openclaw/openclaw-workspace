'use strict';

/**
 * cron-event-bridge.js
 * Handler for rule.day2-gap1-cron-event-bridge
 *
 * cron请求统一进入事件总线并交由handler接入/兜底执行。
 * 验证cron job是否通过事件总线分发而非直接执行。
 */

const fs = require('fs');
const path = require('path');
const { scanFiles, writeReport, gateResult } = require('../lib/handler-utils');

const DIRECT_EXEC_PATTERNS = [
  /execSync\s*\(\s*['"`].*cron/gi,
  /child_process.*cron/gi,
  /直接执行.*cron|cron.*直接调用/gi,
];

const EVENT_BUS_PATTERNS = [
  /bus\.emit|eventBus|event\.dispatch|cron\.job\.requested/gi,
  /事件总线|event.?bridge/gi,
];

/**
 * @param {object} context - ISC 运行时上下文
 * @param {string} context.repoRoot - 仓库根目录
 * @returns {object} gate result
 */
async function handler(context = {}) {
  const repoRoot = context.repoRoot || process.cwd();
  const checks = [];
  const directExecFiles = [];
  let eventBusUsageCount = 0;

  const scanDirs = [
    path.join(repoRoot, 'skills'),
    path.join(repoRoot, 'scripts'),
  ];

  for (const dir of scanDirs) {
    scanFiles(dir, /\.(js|sh)$/, (filePath) => {
      let content;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch {
        return;
      }

      // Check for direct cron execution bypassing event bus
      for (const pat of DIRECT_EXEC_PATTERNS) {
        pat.lastIndex = 0;
        if (pat.test(content)) {
          directExecFiles.push(path.relative(repoRoot, filePath));
          break;
        }
      }

      // Check for event bus usage
      for (const pat of EVENT_BUS_PATTERNS) {
        pat.lastIndex = 0;
        if (pat.test(content)) {
          eventBusUsageCount++;
          break;
        }
      }
    }, { maxDepth: 4, skip: ['node_modules', '.git', '.entropy-archive'] });
  }

  checks.push({
    name: 'no-direct-cron-exec',
    ok: directExecFiles.length === 0,
    message: directExecFiles.length === 0
      ? 'cron任务未发现直接执行绕过事件总线'
      : `${directExecFiles.length} 个文件直接执行cron，未经事件总线`,
  });

  checks.push({
    name: 'event-bus-integration',
    ok: eventBusUsageCount > 0,
    message: eventBusUsageCount > 0
      ? `检测到 ${eventBusUsageCount} 处事件总线集成`
      : '未检测到cron事件总线集成',
  });

  const result = gateResult('day2-gap1-cron-event-bridge', checks, { failClosed: false });

  writeReport(path.join(repoRoot, 'reports', 'cron-event-bridge.json'), {
    rule: 'rule.day2-gap1-cron-event-bridge',
    timestamp: new Date().toISOString(),
    summary: { status: result.status, directExecCount: directExecFiles.length, eventBusUsageCount },
    directExecFiles: directExecFiles.slice(0, 30),
  });

  return result;
}

module.exports = handler;
