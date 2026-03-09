'use strict';

/**
 * intent-doc-quality-gate.js
 * Handler for rule.intent-doc-quality-gate-001质量门禁规则-wrsequ
 *
 * 固化 writer→reviewer→不通过重写 的文档质量门禁流程。
 * 检查文档是否经过 review 流程，是否有 reviewer 标记。
 */

const path = require('path');
const { scanFiles, gateResult, writeReport } = require('../lib/handler-utils');

const QUALITY_MARKERS = ['reviewed', 'approved', 'reviewer:', 'review-status:'];

async function handler(context = {}) {
  const repoRoot = context.repoRoot || process.cwd();
  const checks = [];
  const unreviewed = [];

  // 扫描 docs 目录中的文档，检查是否包含 review 标记
  const docsDir = path.join(repoRoot, 'docs');
  scanFiles(
    docsDir,
    /\.md$/,
    (filePath) => {
      try {
        const content = require('fs').readFileSync(filePath, 'utf8').toLowerCase();
        const hasMarker = QUALITY_MARKERS.some(m => content.includes(m));
        if (!hasMarker && content.length > 200) {
          unreviewed.push(path.relative(repoRoot, filePath));
        }
      } catch { /* skip */ }
    },
    { maxDepth: 3 }
  );

  checks.push({
    name: 'docs-have-review-markers',
    ok: unreviewed.length === 0,
    message: unreviewed.length === 0
      ? '所有文档均包含 review 标记'
      : `${unreviewed.length} 个文档缺少 review 标记`,
  });

  // 检查是否存在质量门禁流程定义
  const gateDef = path.join(repoRoot, 'skills/isc-core/rules/rule.intent-doc-quality-gate-001质量门禁规则-wrsequ.json');
  const exists = require('fs').existsSync(gateDef);
  checks.push({
    name: 'quality-gate-rule-exists',
    ok: exists,
    message: exists ? '质量门禁规则文件存在' : '质量门禁规则文件缺失',
  });

  const result = gateResult('intent-doc-quality-gate', checks, { failClosed: false });

  writeReport(
    path.join(repoRoot, 'reports', 'doc-quality-gate.json'),
    {
      rule: 'rule.intent-doc-quality-gate-001质量门禁规则-wrsequ',
      timestamp: new Date().toISOString(),
      unreviewedDocs: unreviewed.slice(0, 30),
      ...result,
    }
  );

  return result;
}

module.exports = handler;
