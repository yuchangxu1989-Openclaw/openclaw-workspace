'use strict';

/**
 * ISC Handler: badcase-harvest-engine
 * Rule: rule.auto-badcase-harvest-engine-001
 * Auto-harvests badcases from correction/failure/violation events.
 */

const fs = require('fs');
const path = require('path');
const {
  writeReport,
  emitEvent,
  checkFileExists,
  gateResult,
  gitExec,
} = require('../lib/handler-utils');

module.exports = async function (event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const eventType = event?.type || 'unknown';
  const payload = event?.payload || {};
  logger.info?.(`[badcase-harvest-engine] Processing event: ${eventType}`);

  const checks = [];

  // Extract badcase fields
  const badcaseId = payload.badcase_id || `bc-${Date.now()}`;
  const category = payload.category || 'uncategorized';
  const description = payload.description || payload.summary || '';
  const wrongChain = payload.wrong_chain || '';
  const correctChain = payload.correct_chain || '';
  const rootCause = payload.root_cause || '';

  // Check 1: description is non-empty
  checks.push({
    name: 'description_present',
    ok: description.length > 0,
    message: description ? `Description: ${description.slice(0, 80)}...` : 'No description provided',
  });

  // Check 2: category is valid
  const validCategories = ['correction', 'repeated_failure', 'symptom_fix', 'rule_violation', 'uncategorized'];
  checks.push({
    name: 'category_valid',
    ok: validCategories.includes(category),
    message: `Category: ${category}`,
  });

  // Write badcase to collection file
  const badcasesFile = path.join(root, 'tests', 'benchmarks', 'intent', 'c2-golden', '00-real-badcases.json');
  let badcases = [];
  if (checkFileExists(badcasesFile)) {
    try {
      badcases = JSON.parse(fs.readFileSync(badcasesFile, 'utf8'));
      if (!Array.isArray(badcases)) badcases = [];
    } catch { badcases = []; }
  }

  const newEntry = {
    badcase_id: badcaseId,
    category,
    description,
    wrong_chain: wrongChain,
    correct_chain: correctChain,
    root_cause: rootCause,
    source_event: eventType,
    harvested_at: new Date().toISOString(),
  };

  // Check for duplicates
  const isDup = badcases.some(b => b.badcase_id === badcaseId);
  checks.push({
    name: 'not_duplicate',
    ok: !isDup,
    message: isDup ? `Duplicate badcase_id: ${badcaseId}` : 'New badcase entry',
  });

  if (!isDup && description.length > 0) {
    badcases.push(newEntry);
    writeReport(badcasesFile, badcases);
    actions.push(`badcase_added:${badcaseId}`);
  }

  const result = gateResult(rule?.id || 'badcase-harvest-engine', checks, { failClosed: false });

  const reportPath = path.join(root, 'reports', 'badcase-harvest', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'badcase-harvest-engine',
    ruleId: rule?.id || null,
    badcaseId,
    category,
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'badcase-harvest-engine.completed', {
    ok: result.ok,
    badcaseId,
    actions,
  });

  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: result.ok
      ? `Badcase ${badcaseId} harvested successfully`
      : `Badcase harvest had issues: ${result.failed} checks failed`,
    ...result,
  };
};
