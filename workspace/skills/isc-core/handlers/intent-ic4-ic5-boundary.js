'use strict';

/**
 * intent-ic4-ic5-boundary.js
 * Handler for rule.intent-ic4-ic5-boundary-001
 *
 * 明确 IC4（隐含意图）与 IC5（多意图复合）的边界判定标准。
 * 扫描规则中的 intent_type 标注，检查 IC4/IC5 分类是否清晰无歧义。
 */

const path = require('path');
const { scanFiles, readRuleJson, gateResult, writeReport } = require('../lib/handler-utils');

const IC4_MARKERS = ['implicit', 'hidden', 'inferred', '隐含', 'IC4'];
const IC5_MARKERS = ['composite', 'multi-intent', 'compound', '复合', '多意图', 'IC5'];

async function handler(context = {}) {
  const repoRoot = context.repoRoot || process.cwd();
  const checks = [];
  const ambiguous = [];

  // 扫描所有规则，检查 IC4/IC5 标注一致性
  const rulesDir = path.join(repoRoot, 'skills/isc-core/rules');
  scanFiles(
    rulesDir,
    /\.json$/,
    (filePath) => {
      const rule = readRuleJson(filePath);
      if (!rule) return;

      const text = JSON.stringify(rule).toLowerCase();
      const hasIC4 = IC4_MARKERS.some(m => text.includes(m.toLowerCase()));
      const hasIC5 = IC5_MARKERS.some(m => text.includes(m.toLowerCase()));

      // 同时包含两类标记的规则视为边界模糊
      if (hasIC4 && hasIC5) {
        ambiguous.push({
          file: path.relative(repoRoot, filePath),
          id: rule.id || path.basename(filePath),
        });
      }
    },
    { maxDepth: 1 }
  );

  checks.push({
    name: 'no-ambiguous-ic4-ic5',
    ok: ambiguous.length === 0,
    message: ambiguous.length === 0
      ? 'IC4/IC5 边界清晰，无歧义规则'
      : `${ambiguous.length} 条规则同时包含 IC4 和 IC5 标记，边界模糊`,
  });

  const result = gateResult('intent-ic4-ic5-boundary-001', checks, { failClosed: false });

  writeReport(
    path.join(repoRoot, 'reports', 'ic4-ic5-boundary.json'),
    {
      rule: 'rule.intent-ic4-ic5-boundary-001',
      timestamp: new Date().toISOString(),
      ambiguousRules: ambiguous,
      ...result,
    }
  );

  return result;
}

module.exports = handler;
