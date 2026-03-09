'use strict';

/**
 * ISC Handler: memory-digest-must-verify
 * Rule: rule.memory-digest-must-verify-001
 * 消化历史信息后必须核实磁盘文件实际存在。记录→核实文件→补缺→commit。
 */

const fs = require('fs');
const path = require('path');
const {
  writeReport,
  emitEvent,
  checkFileExists,
  gitExec,
  scanFiles,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const memoryPath = event?.payload?.path || event?.payload?.memoryFile;
  logger.info?.(`[memory-digest-must-verify] Verifying disk files from: ${memoryPath || 'memory dir'}`);

  const checks = [];

  // Collect memory files to scan
  const memoryDir = path.join(root, 'memory');
  const filesToCheck = [];

  if (memoryPath) {
    const fullPath = path.isAbsolute(memoryPath) ? memoryPath : path.join(root, memoryPath);
    if (checkFileExists(fullPath)) {
      filesToCheck.push(fullPath);
    } else {
      checks.push({ name: 'memory_file_exists', ok: false, message: `Memory file ${memoryPath} not found` });
    }
  } else if (checkFileExists(memoryDir)) {
    scanFiles(memoryDir, /\.md$/, (fp) => filesToCheck.push(fp), { maxDepth: 2 });
  }

  if (filesToCheck.length === 0 && checks.length === 0) {
    checks.push({ name: 'memory_files_found', ok: false, message: 'No memory files found to verify' });
  }

  // Extract file references from memory content and verify they exist
  const fileRefPattern = /(?:\/[\w./-]+\.\w+|skills\/[\w./-]+|handlers\/[\w./-]+|scripts\/[\w./-]+)/g;
  const verifiedPaths = new Set();
  const missingPaths = [];

  for (const memFile of filesToCheck) {
    const content = fs.readFileSync(memFile, 'utf8');
    const refs = content.match(fileRefPattern) || [];

    for (const ref of refs) {
      if (verifiedPaths.has(ref)) continue;
      verifiedPaths.add(ref);

      const fullRef = path.isAbsolute(ref) ? ref : path.join(root, ref);
      const exists = checkFileExists(fullRef);
      if (!exists) {
        missingPaths.push(ref);
      }
    }
  }

  if (verifiedPaths.size > 0) {
    checks.push({
      name: 'file_references_verified',
      ok: missingPaths.length === 0,
      message: missingPaths.length === 0
        ? `All ${verifiedPaths.size} file references verified on disk`
        : `${missingPaths.length}/${verifiedPaths.size} referenced files missing: ${missingPaths.slice(0, 5).join(', ')}`,
    });
  } else if (filesToCheck.length > 0) {
    checks.push({
      name: 'file_references_found',
      ok: true,
      message: 'No file path references found in memory files (nothing to verify)',
    });
  }

  // Check uncommitted memory changes
  const uncommitted = gitExec(root, 'diff --name-only -- memory/');
  if (uncommitted) {
    checks.push({
      name: 'memory_committed',
      ok: false,
      message: `Uncommitted memory changes: ${uncommitted.split('\n').length} file(s)`,
    });
  } else {
    checks.push({
      name: 'memory_committed',
      ok: true,
      message: 'No uncommitted memory changes',
    });
  }

  const result = gateResult(rule?.id || 'memory-digest-must-verify-001', checks);

  const reportPath = path.join(root, 'reports', 'memory-digest-verify', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'memory-digest-must-verify',
    filesScanned: filesToCheck.length,
    refsVerified: verifiedPaths.size,
    missingPaths,
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'memory-digest-must-verify.completed', { ok: result.ok, status: result.status, actions });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
