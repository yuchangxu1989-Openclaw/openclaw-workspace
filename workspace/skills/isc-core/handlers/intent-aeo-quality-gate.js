'use strict';

/**
 * ISC Handler: intent-aeo-quality-gate
 * Rule: rule.intent-aeo-quality-gate-001
 * Validates that intent system changes pass AEO evaluation gate:
 * golden evalset tests + badcase root-cause analysis.
 */

const path = require('path');
const {
  writeReport,
  emitEvent,
  gitExec,
  scanFiles,
  checkFileExists,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function (event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];
  const checks = [];

  logger.info?.('[intent-aeo-quality-gate] Checking AEO evaluation gate for intent system changes');

  // Check 1: Golden evalset exists
  const evalsetDir = path.join(root, 'skills', 'aeo-eval', 'evalsets');
  const hasEvalsetDir = checkFileExists(evalsetDir);
  checks.push({
    name: 'golden_evalset_exists',
    ok: hasEvalsetDir,
    message: hasEvalsetDir ? 'Golden evalset directory found' : 'No evalset directory at skills/aeo-eval/evalsets',
  });

  // Check 2: At least one evalset JSON file present
  if (hasEvalsetDir) {
    const evalFiles = scanFiles(evalsetDir, /\.json$/i, null, { maxDepth: 2 });
    const hasEvalFiles = evalFiles.length > 0;
    checks.push({
      name: 'evalset_files_present',
      ok: hasEvalFiles,
      message: hasEvalFiles ? `${evalFiles.length} evalset file(s) found` : 'No evalset JSON files found',
    });
  } else {
    checks.push({ name: 'evalset_files_present', ok: false, message: 'Skipped — evalset dir missing' });
  }

  // Check 3: LLM semantic chain is primary (no keyword-only routing)
  const dispatcherDir = path.join(root, 'skills', 'isc-core', 'lib');
  const dispatcherFiles = scanFiles(dispatcherDir, /dispatch|intent|route/i, null, { maxDepth: 1 });
  let keywordOnlyFound = false;
  for (const f of dispatcherFiles) {
    try {
      const content = require('fs').readFileSync(f, 'utf8');
      if (/keyword.*only|regex.*primary/i.test(content)) {
        keywordOnlyFound = true;
        break;
      }
    } catch { /* skip */ }
  }
  checks.push({
    name: 'llm_semantic_primary',
    ok: !keywordOnlyFound,
    message: keywordOnlyFound
      ? 'Keyword/regex appears to be primary chain — must use LLM semantic identification'
      : 'No keyword-only routing detected',
  });

  // Check 4: Badcase analysis reports exist
  const badcaseDir = path.join(root, 'reports', 'badcase-analysis');
  const hasBadcaseDir = checkFileExists(badcaseDir);
  checks.push({
    name: 'badcase_analysis_available',
    ok: hasBadcaseDir,
    message: hasBadcaseDir ? 'Badcase analysis directory exists' : 'No badcase analysis reports directory found',
  });

  const result = gateResult(rule?.id || 'intent-aeo-quality-gate-001', checks);

  const reportPath = path.join(root, 'reports', 'aeo-quality-gate', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'intent-aeo-quality-gate',
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'intent-aeo-quality-gate.completed', { ok: result.ok, status: result.status, actions });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
