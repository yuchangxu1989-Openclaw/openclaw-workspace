'use strict';

/**
 * intent-ruleify-consumption.js
 * Handler for rule.intent-ruleify-consumption-001
 *
 * 当意图分析器识别出 ruleify 类意图时，路由到 intent-event-handler 创建 ISC 规则草案。
 * 确保 intent.ruleify 事件在 event-bus 链路中被正确匹配和执行。
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

  // 1. 检查 intent-event-handler 是否注册了 ruleify 路由
  let hasRuleifyRoute = false;
  scanFiles(path.join(repoRoot, 'skills', 'isc-core', 'handlers'), /\.(js|ts)$/, (filePath) => {
    try {
      const content = require('fs').readFileSync(filePath, 'utf8');
      if (/ruleify/i.test(content) && /handler|route|event/i.test(content)) {
        hasRuleifyRoute = true;
      }
    } catch { /* skip */ }
  }, { maxDepth: 2 });

  checks.push({
    name: 'ruleify-route-registered',
    ok: hasRuleifyRoute,
    message: hasRuleifyRoute
      ? 'intent.ruleify 路由已注册'
      : '未找到 intent.ruleify 路由注册',
  });

  // 2. 检查规则草案创建机制
  let hasDraftMechanism = false;
  scanFiles(path.join(repoRoot, 'skills', 'isc-core'), /\.(js|ts)$/, (filePath) => {
    try {
      const content = require('fs').readFileSync(filePath, 'utf8');
      if (/draft|草案|create.*rule|rule.*creat/i.test(content)) {
        hasDraftMechanism = true;
      }
    } catch { /* skip */ }
  }, { maxDepth: 3 });

  checks.push({
    name: 'rule-draft-mechanism',
    ok: hasDraftMechanism,
    message: hasDraftMechanism
      ? '规则草案创建机制存在'
      : '未找到 ISC 规则草案创建机制',
  });

  // 3. 检查 event-bus 中 intent.ruleify 事件是否已声明
  let hasEventDecl = false;
  scanFiles(path.join(repoRoot, 'skills', 'isc-core'), /\.(json|js|ya?ml)$/, (filePath) => {
    try {
      const content = require('fs').readFileSync(filePath, 'utf8');
      if (content.includes('intent.ruleify') || content.includes('ruleify')) {
        hasEventDecl = true;
      }
    } catch { /* skip */ }
  }, { maxDepth: 3 });

  checks.push({
    name: 'ruleify-event-declared',
    ok: hasEventDecl,
    message: hasEventDecl
      ? 'intent.ruleify 事件已声明'
      : '未在配置中找到 intent.ruleify 事件声明',
  });

  const result = gateResult('intent-ruleify-consumption-001', checks, { failClosed: false });

  writeReport(path.join(repoRoot, 'reports', 'intent-ruleify-consumption.json'), {
    rule: 'rule.intent-ruleify-consumption-001',
    timestamp: new Date().toISOString(),
    summary: { status: result.status, passed: result.passed, total: result.total },
    checks,
  });

  return result;
}

module.exports = handler;
