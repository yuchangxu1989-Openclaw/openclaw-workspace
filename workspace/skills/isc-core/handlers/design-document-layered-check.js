'use strict';

/**
 * ISC Handler: design-document-layered-check
 * Rule: rule.pipeline-benchmark-design-document-layered-001
 * Triggers on design.document.created/modified — layered decoupling checks.
 */

const fs = require('fs');
const path = require('path');
const {
  gitExec,
  writeReport,
  emitEvent,
  checkFileExists,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const docPath = event?.payload?.path || event?.payload?.document;
  logger.info?.(`[design-document-layered-check] Checking layered design: ${docPath || 'unknown'}`);

  const checks = [];

  if (docPath) {
    const fullPath = path.join(root, docPath);
    const exists = checkFileExists(fullPath);

    if (exists) {
      const content = fs.readFileSync(fullPath, 'utf8').toLowerCase();

      // Check 1: separation of concerns
      const socKeywords = ['separation of concern', 'single responsibility', '职责分离', '关注点分离'];
      const hasSoC = socKeywords.some(k => content.includes(k));
      checks.push({
        name: 'separation_of_concerns',
        ok: hasSoC,
        message: hasSoC ? 'Separation of concerns documented' : 'Missing separation of concerns discussion',
      });

      // Check 2: interface definitions
      const interfaceKeywords = ['interface', 'contract', 'api', '接口', '契约'];
      const hasInterface = interfaceKeywords.some(k => content.includes(k));
      checks.push({
        name: 'interface_definitions',
        ok: hasInterface,
        message: hasInterface ? 'Interface/contract definitions present' : 'No interface definitions found',
      });

      // Check 3: dependency direction (no circular)
      const depKeywords = ['dependency', 'import', 'require', '依赖'];
      const hasDep = depKeywords.some(k => content.includes(k));
      checks.push({
        name: 'dependency_direction',
        ok: hasDep,
        message: hasDep ? 'Dependency direction discussed' : 'No dependency direction discussion',
      });

      // Check 4: layer boundaries defined
      const layerKeywords = ['layer', 'tier', '层', 'boundary', '边界'];
      const hasLayers = layerKeywords.some(k => content.includes(k));
      checks.push({
        name: 'layer_boundaries',
        ok: hasLayers,
        message: hasLayers ? 'Layer boundaries defined' : 'No layer boundaries found',
      });
    } else {
      checks.push({ name: 'document_exists', ok: false, message: `Document ${docPath} not found` });
    }
  } else {
    checks.push({ name: 'document_specified', ok: false, message: 'No document path in event payload' });
  }

  const result = gateResult(rule?.id || 'design-document-layered-check', checks);

  const reportPath = path.join(root, 'reports', 'layered-check', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'design-document-layered-check',
    eventType: event?.type || null,
    ruleId: rule?.id || null,
    documentPath: docPath || null,
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'design-document-layered-check.completed', {
    ok: result.ok,
    status: result.status,
    actions,
  });

  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: result.ok
      ? `Layered design check passed all ${result.total} checks`
      : `${result.failed}/${result.total} layered design checks failed`,
    ...result,
  };
};
