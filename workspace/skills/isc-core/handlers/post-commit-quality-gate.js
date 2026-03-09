'use strict';

/**
 * ISC Handler: post-commit-quality-gate
 * Rule: rule.intent-post-commit-quality-gate-h8z2sz
 * Runs quality checks automatically after git commits.
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

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const checks = [];

  logger.info?.('[post-commit-quality-gate] Running post-commit quality checks');

  // Check 1: Recent commit exists
  const lastCommit = gitExec(root, 'log --oneline -1');
  const hasCommit = lastCommit.length > 0;
  checks.push({
    name: 'recent_commit',
    ok: hasCommit,
    message: hasCommit ? `Last commit: ${lastCommit.slice(0, 80)}` : 'No commits found in repository',
  });

  // Check 2: Changed files are trackable
  const changedFiles = gitExec(root, 'diff --name-only HEAD~1 HEAD 2>/dev/null') || '';
  const fileList = changedFiles.split('\n').filter(Boolean);
  const hasChanges = fileList.length > 0;
  checks.push({
    name: 'changed_files_identified',
    ok: hasChanges,
    message: hasChanges ? `${fileList.length} files changed in last commit` : 'Could not identify changed files',
  });

  // Check 3: No merge conflict markers left
  let conflictCount = 0;
  for (const f of fileList) {
    const fp = path.join(root, f);
    if (checkFileExists(fp)) {
      try {
        const content = require('fs').readFileSync(fp, 'utf8');
        if (/^<{7}\s|^={7}$|^>{7}\s/m.test(content)) conflictCount++;
      } catch { /* skip binary files */ }
    }
  }
  checks.push({
    name: 'no_conflict_markers',
    ok: conflictCount === 0,
    message: conflictCount === 0
      ? 'No merge conflict markers in committed files'
      : `${conflictCount} file(s) contain merge conflict markers`,
  });

  // Check 4: Commit message is meaningful
  const commitMsg = gitExec(root, 'log --format=%s -1');
  const goodMsg = commitMsg.length >= 5 && !/^(fix|update|wip|test)$/i.test(commitMsg.trim());
  checks.push({
    name: 'commit_message_quality',
    ok: goodMsg,
    message: goodMsg
      ? 'Commit message appears meaningful'
      : `Commit message too short or generic: "${commitMsg}"`,
  });

  const result = gateResult(rule?.id || 'post-commit-quality-gate', checks);

  const reportPath = path.join(root, 'reports', 'post-commit-quality-gate.json');
  writeReport(reportPath, result);

  await emitEvent(bus, 'handler:complete', {
    handler: 'post-commit-quality-gate',
    ruleId: rule?.id,
    result,
  });

  return result;
};
