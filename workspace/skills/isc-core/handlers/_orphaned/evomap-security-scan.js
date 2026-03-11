'use strict';

/**
 * ISC Handler: evomap-security-scan
 * Rule: rule.pipeline-benchmark-evomap-security-scan-001
 * Triggers on evomap.sync.request — enforces mandatory security scanning before sync.
 */

const fs = require('fs');
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

  logger.info?.(`[evomap-security-scan] EvoMap sync request received`);

  const checks = [];

  // Check 1: evomap file exists
  const evomapPath = event?.payload?.evomap_path || 'skills/isc-core/evomap.json';
  const fullEvomapPath = path.join(root, evomapPath);
  const evomapExists = checkFileExists(fullEvomapPath);
  checks.push({
    name: 'evomap_exists',
    ok: evomapExists,
    message: evomapExists ? `EvoMap found at ${evomapPath}` : `EvoMap not found at ${evomapPath}`,
  });

  // Check 2: no secrets in staged files
  const stagedFiles = gitExec(root, 'diff --cached --name-only');
  let secretsFound = false;
  if (stagedFiles) {
    const secretPatterns = [/password\s*[:=]/i, /api[_-]?key\s*[:=]/i, /secret\s*[:=]/i, /token\s*[:=]\s*['"][a-zA-Z0-9]{20,}/i];
    for (const file of stagedFiles.split('\n')) {
      const filePath = path.join(root, file);
      if (!checkFileExists(filePath)) continue;
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        if (secretPatterns.some(p => p.test(content))) {
          secretsFound = true;
          break;
        }
      } catch { /* skip */ }
    }
  }
  checks.push({
    name: 'no_secrets_in_staged',
    ok: !secretsFound,
    message: secretsFound ? 'Potential secrets detected in staged files' : 'No secrets detected',
  });

  // Check 3: no high-risk file patterns in sync scope
  const dangerousFiles = scanFiles(root, /\.(env|pem|key|pfx)$/i, null, { maxDepth: 3 });
  checks.push({
    name: 'no_dangerous_files',
    ok: dangerousFiles.length === 0,
    message: dangerousFiles.length === 0
      ? 'No dangerous file types found'
      : `${dangerousFiles.length} potentially dangerous files: ${dangerousFiles.slice(0, 3).map(f => path.basename(f)).join(', ')}`,
  });

  // Check 4: git history integrity
  const lastCommit = gitExec(root, 'log --oneline -1');
  checks.push({
    name: 'git_integrity',
    ok: !!lastCommit,
    message: lastCommit ? `Git OK: ${lastCommit}` : 'No git history — integrity unverifiable',
  });

  const result = gateResult(rule?.id || 'evomap-security-scan', checks, { failClosed: true });

  const reportPath = path.join(root, 'reports', 'evomap-security', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'evomap-security-scan',
    eventType: event?.type || null,
    ruleId: rule?.id || null,
    evomapPath,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'evomap-security-scan.completed', {
    ok: result.ok,
    status: result.status,
    actions,
  });

  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: result.ok
      ? `EvoMap security scan passed all ${result.total} checks`
      : `BLOCKED: ${result.failed}/${result.total} security checks failed`,
    ...result,
  };
};
