'use strict';

/**
 * ISC Handler: gate-before-action
 * Rule: rule.arch-gate-before-action-001
 * Enforces that any state-changing operation has passed at least one
 * automated gate check before proceeding.
 */

const fs = require('fs');
const path = require('path');
const {
  writeReport,
  emitEvent,
  gitExec,
  scanFiles,
  readRuleJson,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const eventName = event?.event || event?.name || 'unknown';
  logger.info?.(`[gate-before-action] Verifying gate presence for event: ${eventName}`);

  const checks = [];

  // 1. Check if event source carries gate-pass evidence
  const gateEvidence = event?.payload?.gate_passed
    || event?.payload?.gateResult
    || event?.payload?.approved;
  checks.push({
    name: 'gate_evidence_present',
    ok: !!gateEvidence,
    message: gateEvidence
      ? 'Gate-pass evidence found in event payload'
      : 'No gate-pass evidence — action may be ungated',
  });

  // 2. For skill lifecycle events, verify skill has SKILL.md
  if (eventName.startsWith('skill.lifecycle')) {
    const skillName = event?.payload?.skill || event?.payload?.name;
    if (skillName) {
      const skillMd = path.join(root, 'skills', skillName, 'SKILL.md');
      const exists = fs.existsSync(skillMd);
      checks.push({
        name: 'skill_has_manifest',
        ok: exists,
        message: exists
          ? `Skill ${skillName} has SKILL.md`
          : `Skill ${skillName} missing SKILL.md — cannot verify quality`,
      });
    }
  }

  // 3. For rule creation events, verify rule has required fields
  if (eventName.startsWith('isc.rule')) {
    const ruleFile = event?.payload?.file || event?.payload?.path;
    if (ruleFile) {
      const rulePath = path.isAbsolute(ruleFile) ? ruleFile : path.join(root, ruleFile);
      const parsed = readRuleJson(rulePath);
      const hasHandler = !!parsed?.action?.handler;
      checks.push({
        name: 'rule_has_handler',
        ok: hasHandler,
        message: hasHandler
          ? 'Rule specifies a handler'
          : 'Rule missing handler — enforcement cannot be automated',
      });
    }
  }

  // 4. For day closure, verify reports exist
  if (eventName.includes('day.closure')) {
    const reportsDir = path.join(root, 'reports');
    const hasReports = fs.existsSync(reportsDir) &&
      fs.readdirSync(reportsDir).length > 0;
    checks.push({
      name: 'closure_has_reports',
      ok: hasReports,
      message: hasReports
        ? 'Reports directory has content'
        : 'No reports generated — day closure requires evidence',
    });
  }

  // Fallback: if no specific checks applied, require gate evidence
  if (checks.length === 1 && !gateEvidence) {
    checks.push({
      name: 'action_is_gated',
      ok: false,
      message: `Event ${eventName} has no gate — this is a security gap`,
    });
  }

  const result = gateResult(rule?.id || 'gate-before-action', checks);

  const reportPath = path.join(root, 'reports', 'gate-before-action', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'gate-before-action',
    triggerEvent: eventName,
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'gate-before-action.completed', {
    ok: result.ok,
    status: result.status,
    actions,
  });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
