'use strict';

/**
 * intent-dispatchengine-api-usage.js
 * Handler for rule.intent-dispatchengine-api-usage-gvhcmy
 *
 * 验证代码库中 DispatchEngine 的 API 使用是否正确，
 * 排除不存在的 markFinished 方法，确保只使用正确的生命周期方法。
 */

const path = require('path');
const { scanFiles, gateResult, writeReport } = require('../lib/handler-utils');

const FORBIDDEN_METHODS = ['markFinished', 'mark_finished'];
const VALID_LIFECYCLE = ['start', 'stop', 'dispatch', 'register', 'unregister', 'emit'];

async function handler(context = {}) {
  const repoRoot = context.repoRoot || process.cwd();
  const checks = [];
  const violations = [];

  // 扫描所有 JS 文件，检测是否误用了不存在的 DispatchEngine 方法
  scanFiles(
    path.join(repoRoot, 'skills'),
    /\.js$/,
    (filePath) => {
      try {
        const content = require('fs').readFileSync(filePath, 'utf8');
        if (!/DispatchEngine|dispatch[-_]?engine/i.test(content)) return;

        for (const method of FORBIDDEN_METHODS) {
          const regex = new RegExp(`\\.${method}\\s*\\(`, 'g');
          const matches = content.match(regex);
          if (matches) {
            violations.push({
              file: path.relative(repoRoot, filePath),
              method,
              count: matches.length,
            });
          }
        }
      } catch { /* skip */ }
    },
    { maxDepth: 5 }
  );

  checks.push({
    name: 'no-forbidden-api-usage',
    ok: violations.length === 0,
    message: violations.length === 0
      ? 'DispatchEngine API 使用正确，无禁用方法调用'
      : `发现 ${violations.length} 处禁用方法调用 (markFinished 等)`,
  });

  const result = gateResult('intent-dispatchengine-api-usage', checks, { failClosed: false });

  writeReport(
    path.join(repoRoot, 'reports', 'dispatchengine-api-usage.json'),
    {
      rule: 'rule.intent-dispatchengine-api-usage-gvhcmy',
      timestamp: new Date().toISOString(),
      forbiddenMethods: FORBIDDEN_METHODS,
      validLifecycle: VALID_LIFECYCLE,
      violations,
      ...result,
    }
  );

  return result;
}

module.exports = handler;
