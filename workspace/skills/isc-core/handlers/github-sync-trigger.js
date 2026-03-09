#!/usr/bin/env node
/**
 * ISC Handler: GitHub Sync Trigger
 * Rule: rule.auto-github-sync-trigger-001
 *
 * When workspace files change (commits, file modifications),
 * validates sync readiness and triggers GitHub push.
 */
'use strict';

const path = require('path');
const { gitExec, writeReport, gateResult, checkFileExists } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');

function main() {
  const checks = [];

  // Check git repo exists
  const gitDir = path.join(WORKSPACE, '.git');
  if (!checkFileExists(gitDir)) {
    checks.push({
      name: 'git-repo-exists',
      ok: false,
      message: 'Not a git repository',
    });
    const gate = gateResult('github-sync-trigger', checks);
    console.log(JSON.stringify(gate, null, 2));
    process.exit(gate.exitCode);
  }
  checks.push({ name: 'git-repo-exists', ok: true, message: 'Git repository found' });

  // Check current branch
  const branch = gitExec(WORKSPACE, 'rev-parse --abbrev-ref HEAD');
  checks.push({
    name: 'current-branch',
    ok: !!branch,
    message: branch ? `Current branch: ${branch}` : 'Cannot determine branch',
  });

  // Check for remote
  const remotes = gitExec(WORKSPACE, 'remote -v');
  const hasOrigin = remotes.includes('origin');
  checks.push({
    name: 'remote-origin',
    ok: hasOrigin,
    message: hasOrigin ? 'Remote origin configured' : 'No remote origin found',
  });

  // Check for uncommitted changes
  const status = gitExec(WORKSPACE, 'status --porcelain');
  const uncommitted = status ? status.split('\n').length : 0;
  checks.push({
    name: 'uncommitted-changes',
    ok: true,
    message: uncommitted > 0
      ? `${uncommitted} uncommitted changes detected`
      : 'Working tree clean',
  });

  // Check for unpushed commits
  const unpushed = hasOrigin
    ? gitExec(WORKSPACE, `log origin/${branch}..HEAD --oneline 2>/dev/null`)
    : '';
  const unpushedCount = unpushed ? unpushed.split('\n').length : 0;
  checks.push({
    name: 'unpushed-commits',
    ok: true,
    message: unpushedCount > 0
      ? `${unpushedCount} commits ahead of origin/${branch}`
      : 'Up to date with remote',
  });

  // Determine if sync is needed
  const needsSync = uncommitted > 0 || unpushedCount > 0;
  checks.push({
    name: 'sync-needed',
    ok: true,
    message: needsSync ? 'Sync recommended' : 'No sync needed',
  });

  const reportDir = path.join(WORKSPACE, 'reports', 'isc');
  writeReport(path.join(reportDir, 'github-sync-trigger.json'), {
    handler: 'github-sync-trigger',
    ruleId: 'rule.auto-github-sync-trigger-001',
    timestamp: new Date().toISOString(),
    branch,
    hasOrigin,
    uncommittedChanges: uncommitted,
    unpushedCommits: unpushedCount,
    needsSync,
  });

  const gate = gateResult('github-sync-trigger', checks);
  console.log(JSON.stringify(gate, null, 2));
  process.exit(gate.exitCode);
}

main();
