'use strict';

/**
 * intent-type-convergence.js
 * Handler for rule.intent-type-convergence-001
 *
 * 意图识别系统必须覆盖且仅覆盖5种收敛类型：
 * (1)正负向情绪意图 (2)规则触发意图 (3)复杂意图(需5轮以上推理)
 * (4)隐含意图(非明确表达) (5)一句话多意图。
 * 任何新意图类型必须归入以上5类之一，否则不予注册。
 */

const path = require('path');
const { scanFiles, writeReport, gateResult } = require('../lib/handler-utils');

const CONVERGENT_TYPES = [
  'emotion',      // 正负向情绪意图
  'rule-trigger',  // 规则触发意图
  'complex',       // 复杂意图
  'implicit',      // 隐含意图
  'multi-intent',  // 一句话多意图
];

/**
 * @param {object} context - ISC 运行时上下文
 * @param {string} context.repoRoot - 仓库根目录
 * @returns {object} gate result
 */
async function handler(context = {}) {
  const repoRoot = context.repoRoot || process.cwd();
  const checks = [];

  // 1. 扫描意图注册/定义文件，确认5种类型都有覆盖
  const foundTypes = new Set();
  const typePatterns = {
    'emotion': /emotion|情绪|sentiment/i,
    'rule-trigger': /rule.?trigger|规则触发/i,
    'complex': /complex|复杂意图|multi.?turn/i,
    'implicit': /implicit|隐含|infer/i,
    'multi-intent': /multi.?intent|多意图|一句话.*意图/i,
  };

  scanFiles(path.join(repoRoot, 'skills'), /\.(js|json|md)$/, (filePath) => {
    try {
      const content = require('fs').readFileSync(filePath, 'utf8');
      for (const [type, pattern] of Object.entries(typePatterns)) {
        if (pattern.test(content)) foundTypes.add(type);
      }
    } catch { /* skip */ }
  }, { maxDepth: 4 });

  const missingTypes = CONVERGENT_TYPES.filter(t => !foundTypes.has(t));

  checks.push({
    name: 'convergent-type-coverage',
    ok: missingTypes.length === 0,
    message: missingTypes.length === 0
      ? '5种收敛意图类型均已覆盖'
      : `缺少以下意图类型覆盖: ${missingTypes.join(', ')}`,
  });

  // 2. 检查是否存在超出5类的意图类型定义（防止扩散）
  const registeredIntents = [];
  scanFiles(path.join(repoRoot, 'skills', 'isc-core'), /\.(json)$/, (filePath) => {
    try {
      const content = require('fs').readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      if (data.intent_type && !CONVERGENT_TYPES.some(t => data.intent_type.includes(t))) {
        registeredIntents.push({ file: path.relative(repoRoot, filePath), type: data.intent_type });
      }
    } catch { /* skip */ }
  }, { maxDepth: 3 });

  checks.push({
    name: 'no-type-sprawl',
    ok: registeredIntents.length === 0,
    message: registeredIntents.length === 0
      ? '未发现超出5类收敛类型的意图注册'
      : `发现 ${registeredIntents.length} 个未归类意图类型`,
  });

  const result = gateResult('intent-type-convergence-001', checks, { failClosed: false });

  writeReport(path.join(repoRoot, 'reports', 'intent-type-convergence.json'), {
    rule: 'rule.intent-type-convergence-001',
    timestamp: new Date().toISOString(),
    summary: { status: result.status, passed: result.passed, total: result.total },
    convergentTypes: CONVERGENT_TYPES,
    foundTypes: [...foundTypes],
    missingTypes,
    checks,
  });

  return result;
}

module.exports = handler;
