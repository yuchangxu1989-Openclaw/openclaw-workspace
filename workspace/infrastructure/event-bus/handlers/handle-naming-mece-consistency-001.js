'use strict';

const fs = require('fs');
const path = require('path');
const {
  scanFiles,
  writeReport,
  emitEvent,
  gateResult,
} = require('../../../skills/isc-core/lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  // ─── 1. 感知：收集同层级实体名称 ───
  const scopes = [
    { name: 'rules', dir: path.join(root, 'skills', 'isc-core', 'rules'), pattern: /\.json$/i, extractName: f => {
      try { return JSON.parse(fs.readFileSync(f, 'utf8')).name || path.basename(f, '.json'); } catch { return path.basename(f, '.json'); }
    }},
    { name: 'skills', dir: path.join(root, 'skills', 'public'), pattern: /SKILL\.md$/i, extractName: f => path.basename(path.dirname(f)) },
    { name: 'handlers', dir: path.join(root, 'infrastructure', 'event-bus', 'handlers'), pattern: /\.(js|sh)$/i, extractName: f => path.basename(f).replace(/^handle-/, '').replace(/\.(js|sh)$/, '') },
  ];

  const checks = [];
  const allOverlaps = [];

  for (const scope of scopes) {
    const files = scanFiles(scope.dir, scope.pattern);
    const names = files.map(f => scope.extractName(f));

    // 提取关键词并两两比对
    const keywords = names.map(n => ({
      name: n,
      tokens: n.toLowerCase().replace(/[-_]/g, ' ').split(/\s+/).filter(t => t.length > 2),
    }));

    const overlaps = [];
    for (let i = 0; i < keywords.length; i++) {
      for (let j = i + 1; j < keywords.length; j++) {
        const shared = keywords[i].tokens.filter(t => keywords[j].tokens.includes(t));
        // Overlap if >50% tokens shared
        const overlapRatio = shared.length / Math.min(keywords[i].tokens.length, keywords[j].tokens.length);
        if (shared.length >= 2 && overlapRatio > 0.5) {
          overlaps.push({
            a: keywords[i].name,
            b: keywords[j].name,
            sharedTokens: shared,
            ratio: overlapRatio.toFixed(2),
          });
        }
      }
    }

    checks.push({
      name: `MECE_${scope.name}`,
      ok: overlaps.length === 0,
      message: overlaps.length === 0
        ? `${scope.name}: ${names.length} 个实体无MECE冲突`
        : `${scope.name}: 发现 ${overlaps.length} 对命名重叠`,
    });

    allOverlaps.push(...overlaps.map(o => ({ scope: scope.name, ...o })));
  }

  // ─── 2. 输出 ───
  const result = gateResult(rule?.id || 'naming-mece-consistency-001', checks);

  // ─── 3. 持久化 ───
  const reportPath = path.join(root, 'reports', 'mece-check', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'naming-mece-consistency-001',
    overlaps: allOverlaps,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  // ─── 4. 闭环 ───
  await emitEvent(bus, 'mece-check.completed', {
    ok: result.ok, overlapCount: allOverlaps.length, actions,
  });

  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: result.ok
      ? `MECE校验通过，${result.total} 个作用域无命名重叠`
      : `发现 ${allOverlaps.length} 对命名重叠，需消歧`,
    ...result,
  };
};
