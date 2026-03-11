'use strict';
/**
 * ISC Handler: pdca-check-exit-gate
 * Rule: ISC-PDCA-CHECK-EXIT-GATE-001
 * 离开Check阶段前确认评测报告已生成
 */
const path = require('path');
const fs = require('fs');
const { writeReport, emitEvent, checkFileExists, gateResult } = require('../lib/handler-utils');

module.exports = async function (event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || process.cwd();
  const bus = context?.bus;
  const task = event?.payload?.task || event?.payload || {};

  logger.info?.(`[pdca-check-exit-gate] verifying check report for task=${task.id || 'unknown'}`);

  const checks = [];

  // Check 1: check_report field exists and is non-empty
  const reportRef = task.check_report || task.checkReport || '';
  const hasReportRef = typeof reportRef === 'string' ? reportRef.trim().length > 0 : !!reportRef;
  checks.push({
    name: 'check_report_declared',
    ok: hasReportRef,
    message: hasReportRef
      ? `Check report reference: ${String(reportRef).slice(0, 100)}`
      : 'No check_report field — evaluation report missing',
  });

  // Check 2: if report is a file path, verify it exists and has content
  if (typeof reportRef === 'string' && reportRef.trim() && !reportRef.startsWith('http')) {
    const resolved = path.isAbsolute(reportRef) ? reportRef : path.join(root, reportRef);
    const fileExists = checkFileExists(resolved);
    checks.push({
      name: 'check_report_file_exists',
      ok: fileExists,
      message: fileExists ? `Report file found: ${resolved}` : `Report file missing: ${resolved}`,
    });

    if (fileExists) {
      try {
        const stat = fs.statSync(resolved);
        const nonEmpty = stat.size > 10;
        checks.push({
          name: 'check_report_non_empty',
          ok: nonEmpty,
          message: nonEmpty ? `Report size: ${stat.size} bytes` : 'Report file is empty or trivial',
        });
      } catch { /* stat failure handled by file_exists check */ }
    }
  }

  // Check 3: check phase has evaluation metrics
  const hasMetrics = !!(task.check_metrics || task.eval_result || task.test_result);
  checks.push({
    name: 'has_evaluation_metrics',
    ok: hasMetrics,
    message: hasMetrics
      ? 'Evaluation metrics present'
      : 'No evaluation metrics found (check_metrics/eval_result/test_result)',
  });

  const result = gateResult('ISC-PDCA-CHECK-EXIT-GATE-001', checks);

  if (!result.ok) {
    await emitEvent(bus, 'pdca.check.exit.blocked', {
      ruleId: 'ISC-PDCA-CHECK-EXIT-GATE-001',
      taskId: task.id,
      reason: 'Check report incomplete',
      timestamp: new Date().toISOString(),
    });
  }

  const reportPath = path.join(root, 'reports', 'isc', `pdca-check-exit-${task.id || Date.now()}.json`);
  writeReport(reportPath, { rule: 'ISC-PDCA-CHECK-EXIT-GATE-001', event: event?.type, result });

  logger.info?.(`[pdca-check-exit-gate] result=${result.status} passed=${result.passed}/${result.total}`);
  return result;
};
