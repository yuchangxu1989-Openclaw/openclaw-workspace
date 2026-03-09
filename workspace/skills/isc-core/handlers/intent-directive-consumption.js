'use strict';

/**
 * intent-directive-consumption.js
 * Handler for rule.intent-directive-consumption-001
 *
 * 当意图分析器识别出 directive 类意图时，验证 intent.directive 事件
 * 能在 event-bus 链路中被正确匹配并路由到本地任务编排。
 */

const path = require('path');
const { scanFiles, readRuleJson, gateResult, writeReport } = require('../lib/handler-utils');

async function handler(context = {}) {
  const repoRoot = context.repoRoot || process.cwd();
  const checks = [];

  // 1. 验证规则文件自身存在且配置正确
  const rulePath = path.join(repoRoot, 'skills/isc-core/rules/rule.intent-directive-consumption-001.json');
  const rule = readRuleJson(rulePath);
  checks.push({
    name: 'rule-file-valid',
    ok: !!(rule && rule.trigger),
    message: rule ? '规则文件存在且可解析' : '规则文件缺失或无法解析',
  });

  // 2. 验证 trigger.events 包含 intent.directive
  const events = rule?.trigger?.events || [];
  checks.push({
    name: 'trigger-has-directive-event',
    ok: events.includes('intent.directive'),
    message: events.includes('intent.directive')
      ? 'trigger.events 包含 intent.directive'
      : `trigger.events 缺少 intent.directive，当前: [${events.join(', ')}]`,
  });

  // 3. 扫描项目中是否存在 intent-event-handler 消费端
  const handlerHits = [];
  scanFiles(
    path.join(repoRoot, 'skills'),
    /\.(js|json)$/,
    (filePath) => {
      try {
        const content = require('fs').readFileSync(filePath, 'utf8');
        if (/intent[-_]?event[-_]?handler/i.test(content)) {
          handlerHits.push(path.relative(repoRoot, filePath));
        }
      } catch { /* skip */ }
    },
    { maxDepth: 4 }
  );

  checks.push({
    name: 'consumer-handler-exists',
    ok: handlerHits.length > 0,
    message: handlerHits.length > 0
      ? `找到 ${handlerHits.length} 个 intent-event-handler 引用`
      : '未找到 intent-event-handler 消费端',
  });

  const result = gateResult('intent-directive-consumption-001', checks, { failClosed: false });

  writeReport(
    path.join(repoRoot, 'reports', 'intent-directive-consumption.json'),
    { rule: 'rule.intent-directive-consumption-001', timestamp: new Date().toISOString(), ...result }
  );

  return result;
}

module.exports = handler;
