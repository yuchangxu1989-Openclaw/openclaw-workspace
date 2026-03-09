'use strict';

/**
 * ISC Handler: isc-standard-format-check
 * Rule: rule.isc-standard-format-001
 * 确保ISC规则文件格式统一标准，ISC-DTO无缝对接。
 */

const fs = require('fs');
const path = require('path');
const {
  writeReport,
  emitEvent,
  scanFiles,
  readRuleJson,
  gateResult,
} = require('../lib/handler-utils');

const REQUIRED_FIELDS = ['id', 'description', 'trigger', 'action'];
const RECOMMENDED_FIELDS = ['priority', 'fullchain_status', 'category'];

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const rulePath = event?.payload?.path || event?.payload?.rulePath;
  logger.info?.(`[isc-standard-format-check] Validating rule format: ${rulePath || 'all'}`);

  const checks = [];

  function validateRule(filePath) {
    const fileName = path.basename(filePath);
    const data = readRuleJson(filePath);

    if (!data) {
      checks.push({ name: `parse:${fileName}`, ok: false, message: `Failed to parse ${fileName}` });
      return;
    }

    // Check required fields
    for (const field of REQUIRED_FIELDS) {
      const hasField = data[field] !== undefined && data[field] !== null;
      checks.push({
        name: `required_field:${fileName}:${field}`,
        ok: hasField,
        message: hasField ? `${field} present` : `Missing required field: ${field}`,
      });
    }

    // Check id matches filename convention
    const expectedPattern = /^rule\./;
    const idMatchesFile = fileName.startsWith('rule.') && fileName.endsWith('.json');
    checks.push({
      name: `naming:${fileName}`,
      ok: idMatchesFile,
      message: idMatchesFile ? 'Filename follows rule.*.json convention' : 'Filename should match rule.*.json',
    });

    // Check trigger has events array
    const hasEvents = Array.isArray(data.trigger?.events) && data.trigger.events.length > 0;
    checks.push({
      name: `trigger_events:${fileName}`,
      ok: hasEvents,
      message: hasEvents ? 'Trigger events defined' : 'Missing or empty trigger.events array',
    });

    // Check action has type
    const hasActionType = !!data.action?.type;
    checks.push({
      name: `action_type:${fileName}`,
      ok: hasActionType,
      message: hasActionType ? `Action type: ${data.action.type}` : 'Missing action.type',
    });
  }

  if (rulePath) {
    const fullPath = path.isAbsolute(rulePath) ? rulePath : path.join(root, rulePath);
    validateRule(fullPath);
  } else {
    const rulesDir = path.join(root, 'skills', 'isc-core', 'rules');
    scanFiles(rulesDir, /^rule\..*\.json$/, (fp) => validateRule(fp), { maxDepth: 1 });
  }

  if (checks.length === 0) {
    checks.push({ name: 'no_rules_found', ok: false, message: 'No rule files found to validate' });
  }

  const result = gateResult(rule?.id || 'isc-standard-format-001', checks);

  const reportPath = path.join(root, 'reports', 'isc-standard-format', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'isc-standard-format-check',
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'isc-standard-format-check.completed', { ok: result.ok, status: result.status, actions });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
