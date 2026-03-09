'use strict';

/**
 * intent-reflect-dispatch.js
 * Handler for rule.intent-reflect-dispatch-001
 *
 * 当意图被分类为 reflect 时，路由到 intent-event-handler 触发 CRAS 分析/知识汇聚。
 */

const path = require('path');
const { scanFiles, writeReport, gateResult } = require('../lib/handler-utils');

/**
 * @param {object} context - ISC 运行时上下文
 * @param {string} context.repoRoot - 仓库根目录
 * @returns {object} gate result
 */
async function handler(context = {}) {
  const repoRoot = context.repoRoot || process.cwd();
  const checks = [];

  // 1. 检查 dispatcher 中是否有 reflect 分支
  let hasDispatchBranch = false;
  const dirs = [
    path.join(repoRoot, 'skills', 'isc-core', 'handlers'),
    path.join(repoRoot, 'skills', 'isc-core', 'lib'),
  ];
  for (const dir of dirs) {
    scanFiles(dir, /\.(js|ts)$/, (filePath) => {
      try {
        const content = require('fs').readFileSync(filePath, 'utf8');
        if (/dispatch/i.test(content) && /reflect/i.test(content)) {
          hasDispatchBranch = true;
        }
      } catch { /* skip */ }
    }, { maxDepth: 2 });
  }

  checks.push({
    name: 'reflect-dispatch-branch',
    ok: hasDispatchBranch,
    message: hasDispatchBranch
      ? 'reflect 分派分支已存在'
      : '未找到 reflect 意图的分派分支',
  });

  // 2. 检查 CRAS 触发机制是否存在
  let hasCrasTrigger = false;
  scanFiles(path.join(repoRoot, 'skills'), /\.(js|json|md)$/, (filePath) => {
    try {
      const content = require('fs').readFileSync(filePath, 'utf8');
      if (/cras/i.test(content) && (/trigger|dispatch|emit/i.test(content))) {
        hasCrasTrigger = true;
      }
    } catch { /* skip */ }
  }, { maxDepth: 4 });

  checks.push({
    name: 'cras-trigger-exists',
    ok: hasCrasTrigger,
    message: hasCrasTrigger
      ? 'CRAS 触发机制存在'
      : '未找到 CRAS 分析触发机制',
  });

  const result = gateResult('intent-reflect-dispatch-001', checks, { failClosed: false });

  writeReport(path.join(repoRoot, 'reports', 'intent-reflect-dispatch.json'), {
    rule: 'rule.intent-reflect-dispatch-001',
    timestamp: new Date().toISOString(),
    summary: { status: result.status, passed: result.passed, total: result.total },
    checks,
  });

  return result;
}

module.exports = handler;
