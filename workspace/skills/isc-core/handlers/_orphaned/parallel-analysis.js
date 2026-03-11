'use strict';

/**
 * ISC Handler: parallel-analysis
 * Rule: rule.pipeline-benchmark-analysis-requested-001
 * Triggers on analysis.requested — runs parallel analysis governance checks.
 */

const path = require('path');
const {
  gitExec,
  writeReport,
  emitEvent,
  scanFiles,
  checkFileExists,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  logger.info?.(`[parallel-analysis] Triggered by ${event?.type || 'analysis.requested'}`);

  const checks = [];

  // Check 1: analysis target exists
  const target = event?.payload?.target || event?.target;
  if (target) {
    const targetExists = checkFileExists(path.join(root, target));
    checks.push({
      name: 'analysis_target_exists',
      ok: targetExists,
      message: targetExists ? `Target ${target} exists` : `Target ${target} not found`,
    });
  } else {
    checks.push({
      name: 'analysis_target_specified',
      ok: false,
      message: 'No analysis target specified in event payload',
    });
  }

  // Check 2: reports directory writable
  const reportsDir = path.join(root, 'reports', 'analysis');
  try {
    const fs = require('fs');
    fs.mkdirSync(reportsDir, { recursive: true });
    checks.push({ name: 'reports_dir_writable', ok: true, message: 'Reports directory ready' });
  } catch {
    checks.push({ name: 'reports_dir_writable', ok: false, message: 'Cannot create reports directory' });
  }

  // Check 3: git status clean (no uncommitted analysis blockers)
  const gitStatus = gitExec(root, 'status --porcelain');
  const isClean = gitStatus === '';
  checks.push({
    name: 'git_workspace_clean',
    ok: isClean,
    message: isClean ? 'Workspace clean' : `${gitStatus.split('\n').length} uncommitted changes`,
  });

  // Check 4: scan for existing analysis artifacts
  const analysisFiles = scanFiles(path.join(root, 'reports'), /analysis.*\.json$/i, null, { maxDepth: 3 });
  checks.push({
    name: 'prior_analysis_indexed',
    ok: true,
    message: `${analysisFiles.length} prior analysis reports found`,
  });

  const result = gateResult(rule?.id || 'parallel-analysis', checks);

  const reportPath = path.join(root, 'reports', 'analysis', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'parallel-analysis',
    eventType: event?.type || null,
    ruleId: rule?.id || null,
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'parallel-analysis.completed', {
    ok: result.ok,
    status: result.status,
    actions,
  });

  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: result.ok
      ? `All ${result.total} analysis governance checks passed`
      : `${result.failed}/${result.total} analysis checks failed`,
    ...result,
  };
};
