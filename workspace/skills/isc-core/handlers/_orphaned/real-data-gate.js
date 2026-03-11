'use strict';

/**
 * ISC Handler: real-data-gate
 * Rule: rule.arch-real-data-gate-005
 * Validates that acceptance benchmarks use real (not synthetic) data sources.
 */

const fs = require('fs');
const path = require('path');
const {
  writeReport,
  emitEvent,
  scanFiles,
  checkFileExists,
  gateResult,
  gitExec,
} = require('../lib/handler-utils');

module.exports = async function (event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const mode = event?.payload?.mode || 'acceptance';
  const dataSource = event?.payload?.data_source || null;
  logger.info?.(`[real-data-gate] Checking data provenance for mode=${mode}`);

  const checks = [];

  // Check 1: data source is specified
  checks.push({
    name: 'data_source_specified',
    ok: !!dataSource,
    message: dataSource ? `Data source: ${dataSource}` : 'No data_source in event payload',
  });

  // Check 2: if acceptance mode, data must not be synthetic
  if (mode === 'acceptance') {
    const isSynthetic = dataSource && /synthetic|fake|mock|dummy/i.test(dataSource);
    checks.push({
      name: 'acceptance_no_synthetic',
      ok: !isSynthetic,
      message: isSynthetic
        ? `Synthetic data "${dataSource}" not allowed for acceptance`
        : 'Data source is not synthetic',
    });
  }

  // Check 3: scan benchmark results for provenance tags
  const benchDir = path.join(root, 'reports', 'benchmarks');
  if (checkFileExists(benchDir)) {
    const benchFiles = scanFiles(benchDir, /\.json$/, null, { maxDepth: 2 });
    let tagged = 0;
    for (const f of benchFiles) {
      try {
        const content = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (content.data_source || content.provenance) tagged++;
      } catch { /* skip */ }
    }
    checks.push({
      name: 'benchmark_provenance_tags',
      ok: benchFiles.length === 0 || tagged === benchFiles.length,
      message: `${tagged}/${benchFiles.length} benchmark files have provenance tags`,
    });
  }

  const result = gateResult(rule?.id || 'real-data-gate', checks);

  const reportPath = path.join(root, 'reports', 'real-data-gate', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'real-data-gate',
    ruleId: rule?.id || null,
    mode,
    dataSource,
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'real-data-gate.completed', {
    ok: result.ok,
    status: result.status,
    actions,
  });

  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: result.ok
      ? `Real data gate passed all ${result.total} checks`
      : `${result.failed}/${result.total} real-data checks failed`,
    ...result,
  };
};
