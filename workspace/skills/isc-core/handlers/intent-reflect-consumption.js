'use strict';

/**
 * intent-reflect-consumption.js
 * Handler for rule.intent-reflect-consumption-001
 *
 * 当意图分析器识别出 reflect 类意图时，路由到 intent-event-handler 进入 CRAS 分析/知识沉淀路径。
 * 确保 intent.reflect 事件在 event-bus 链路中被正确匹配和执行。
 */

const path = require('path');
const { scanFiles, writeReport, gateResult, readRuleJson } = require('../lib/handler-utils');

const REFLECT_EVENT = 'intent.reflect';

/**
 * @param {object} context - ISC 运行时上下文
 * @param {string} context.repoRoot - 仓库根目录
 * @param {object} [context.bus] - 事件总线
 * @returns {object} gate result
 */
async function handler(context = {}) {
  const repoRoot = context.repoRoot || process.cwd();
  const checks = [];

  // 1. 检查 intent-event-handler 是否存在并注册了 reflect 路由
  let hasReflectRoute = false;
  const handlersDir = path.join(repoRoot, 'skills', 'isc-core', 'handlers');
  scanFiles(handlersDir, /intent.*event.*handler|event.*handler/i, (filePath) => {
    try {
      const content = require('fs').readFileSync(filePath, 'utf8');
      if (/reflect/i.test(content)) {
        hasReflectRoute = true;
      }
    } catch { /* skip */ }
  }, { maxDepth: 2 });

  checks.push({
    name: 'reflect-route-registered',
    ok: hasReflectRoute,
    message: hasReflectRoute
      ? 'intent.reflect 路由已在 handler 中注册'
      : '未找到 intent.reflect 路由注册，需在 intent-event-handler 中添加',
  });

  // 2. 检查 event-bus 配置中是否包含 intent.reflect 事件
  let hasEventConfig = false;
  const configDirs = [
    path.join(repoRoot, 'skills', 'isc-core'),
    path.join(repoRoot, 'config'),
  ];
  for (const dir of configDirs) {
    scanFiles(dir, /\.(json|js|ya?ml)$/, (filePath) => {
      try {
        const content = require('fs').readFileSync(filePath, 'utf8');
        if (content.includes(REFLECT_EVENT) || content.includes('intent.reflect')) {
          hasEventConfig = true;
        }
      } catch { /* skip */ }
    }, { maxDepth: 3 });
  }

  checks.push({
    name: 'reflect-event-bus-config',
    ok: hasEventConfig,
    message: hasEventConfig
      ? 'intent.reflect 事件在配置中已声明'
      : '未在 event-bus 配置中找到 intent.reflect 事件声明',
  });

  // 3. 检查 CRAS 分析路径是否可达
  let hasCrasPath = false;
  scanFiles(path.join(repoRoot, 'skills'), /\.(js|md|json)$/, (filePath) => {
    try {
      const content = require('fs').readFileSync(filePath, 'utf8');
      if (/cras/i.test(content) && /reflect/i.test(content)) {
        hasCrasPath = true;
      }
    } catch { /* skip */ }
  }, { maxDepth: 4 });

  checks.push({
    name: 'cras-path-reachable',
    ok: hasCrasPath,
    message: hasCrasPath
      ? 'CRAS 分析路径可达'
      : '未找到从 reflect 到 CRAS 的可达路径',
  });

  const result = gateResult('intent-reflect-consumption-001', checks, { failClosed: false });

  writeReport(path.join(repoRoot, 'reports', 'intent-reflect-consumption.json'), {
    rule: 'rule.intent-reflect-consumption-001',
    timestamp: new Date().toISOString(),
    summary: { status: result.status, passed: result.passed, total: result.total },
    checks,
  });

  return result;
}

module.exports = handler;
