'use strict';

/**
 * ISC Handler: intent-unknown-discovery
 * Rule: rule.intent-unknown-discovery-001
 * Periodic unknown intent discovery: vector clustering → classification → MECE → user confirm → register.
 */

const fs = require('fs');
const path = require('path');
const {
  writeReport,
  emitEvent,
  gitExec,
  scanFiles,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const triggerType = event?.type || 'manual';
  logger.info?.(`[intent-unknown-discovery] Running discovery, trigger=${triggerType}`);

  const checks = [];

  // Check 1: conversation logs directory exists
  const logsDir = path.join(root, 'logs', 'conversations');
  const logsExist = fs.existsSync(logsDir);
  checks.push({
    name: 'conversation_logs_exist',
    ok: logsExist,
    message: logsExist
      ? `Conversation logs found at ${logsDir}`
      : `No conversation logs at ${logsDir} — discovery cannot proceed`,
  });

  // Check 2: existing intent registry accessible
  const registryPath = path.join(root, 'skills', 'isc-core', 'intent-registry.json');
  const altRegistryPath = path.join(root, 'intent-registry.json');
  const registryExists = fs.existsSync(registryPath) || fs.existsSync(altRegistryPath);
  checks.push({
    name: 'intent_registry_accessible',
    ok: registryExists,
    message: registryExists
      ? 'Intent registry found'
      : 'No intent registry found — will create candidates without dedup check',
  });

  // Check 3: event bus available for candidate submission
  const busAvailable = !!bus?.emit;
  checks.push({
    name: 'event_bus_available',
    ok: busAvailable,
    message: busAvailable
      ? 'Event bus available for candidate submission'
      : 'No event bus — candidates will be written to report only',
  });

  const result = gateResult(rule?.id || 'intent-unknown-discovery-001', checks, { failClosed: false });

  // Scan for unresolved patterns if logs exist
  const candidates = [];
  if (logsExist) {
    const logFiles = scanFiles(logsDir, /\.(json|log|md)$/, null, { maxDepth: 2 });
    // Count unresolved markers as a heuristic
    let unresolvedCount = 0;
    for (const f of logFiles.slice(0, 50)) {
      try {
        const content = fs.readFileSync(f, 'utf8');
        const matches = content.match(/unknown|unresolved|未识别|未知意图/gi);
        if (matches) unresolvedCount += matches.length;
      } catch { /* skip */ }
    }
    if (unresolvedCount > 0) {
      candidates.push({
        signal: 'unresolved_pattern_detected',
        count: unresolvedCount,
        recommendation: 'Run vector clustering on recent conversations to identify new intent types',
      });
      actions.push(`found_${unresolvedCount}_unresolved_signals`);
    }
  }

  if (busAvailable && candidates.length > 0) {
    await emitEvent(bus, 'intent.unknown.candidates.found', {
      source: 'intent-unknown-discovery',
      candidates,
      requiresUserConfirmation: true,
    });
    actions.push('candidates_submitted_for_review');
  }

  const reportPath = path.join(root, 'reports', 'intent-unknown-discovery', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'intent-unknown-discovery',
    trigger: triggerType,
    candidates,
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'intent-unknown-discovery.completed', {
    ok: result.ok,
    status: result.status,
    candidateCount: candidates.length,
    actions,
  });

  return { ok: result.ok, autonomous: true, actions, candidates, ...result };
};
