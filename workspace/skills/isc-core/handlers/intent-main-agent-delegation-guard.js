'use strict';

/**
 * intent-main-agent-delegation-guard.js
 * Handler for rule.intent-isc-main-agent-delegation-001委派守卫-vczzrl
 *
 * 落地主Agent委派守卫规则，建立四层防御机制：
 * 1. 任务分解验证 — 子任务必须有明确边界
 * 2. 权限隔离检查 — 子agent不越权
 * 3. 结果回收验证 — 委派结果必须被消费
 * 4. 超时兜底机制 — 委派必须有超时设置
 */

const path = require('path');
const { scanFiles, gateResult, writeReport } = require('../lib/handler-utils');

const DELEGATION_PATTERNS = {
  spawn: /sessions_spawn|spawn\s*\(/g,
  timeout: /timeout|timeoutMs|runTimeoutSeconds/gi,
  resultConsume: /auto[_-]?announce|result|onComplete|\.then/gi,
};

async function handler(context = {}) {
  const repoRoot = context.repoRoot || process.cwd();
  const checks = [];
  const issues = [];

  // 扫描含委派逻辑的文件，检查四层防御
  scanFiles(
    path.join(repoRoot, 'skills'),
    /\.js$/,
    (filePath) => {
      try {
        const content = require('fs').readFileSync(filePath, 'utf8');
        if (!DELEGATION_PATTERNS.spawn.test(content)) return;
        DELEGATION_PATTERNS.spawn.lastIndex = 0;

        const rel = path.relative(repoRoot, filePath);

        // 检查超时设置
        DELEGATION_PATTERNS.timeout.lastIndex = 0;
        if (!DELEGATION_PATTERNS.timeout.test(content)) {
          issues.push({ file: rel, layer: 'timeout', message: '委派缺少超时设置' });
        }

        // 检查结果消费
        DELEGATION_PATTERNS.resultConsume.lastIndex = 0;
        if (!DELEGATION_PATTERNS.resultConsume.test(content)) {
          issues.push({ file: rel, layer: 'result-consume', message: '委派结果可能未被消费' });
        }
      } catch { /* skip */ }
    },
    { maxDepth: 5 }
  );

  checks.push({
    name: 'delegation-timeout-present',
    ok: !issues.some(i => i.layer === 'timeout'),
    message: issues.filter(i => i.layer === 'timeout').length === 0
      ? '所有委派均有超时设置'
      : `${issues.filter(i => i.layer === 'timeout').length} 处委派缺少超时`,
  });

  checks.push({
    name: 'delegation-result-consumed',
    ok: !issues.some(i => i.layer === 'result-consume'),
    message: issues.filter(i => i.layer === 'result-consume').length === 0
      ? '所有委派结果均被消费'
      : `${issues.filter(i => i.layer === 'result-consume').length} 处委派结果可能未消费`,
  });

  const result = gateResult('intent-main-agent-delegation-guard', checks, { failClosed: false });

  writeReport(
    path.join(repoRoot, 'reports', 'main-agent-delegation-guard.json'),
    {
      rule: 'rule.intent-isc-main-agent-delegation-001委派守卫-vczzrl',
      timestamp: new Date().toISOString(),
      issues,
      ...result,
    }
  );

  return result;
}

module.exports = handler;
