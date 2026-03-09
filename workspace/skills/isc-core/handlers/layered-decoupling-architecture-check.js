'use strict';

/**
 * ISC Handler: layered-decoupling-architecture-check
 * Rule: rule.layered-decoupling-architecture-001
 * 验证设计文档是否明确三层归属（感知层/认知层/执行层）及事件总线解耦。
 */

const fs = require('fs');
const path = require('path');
const {
  writeReport,
  emitEvent,
  checkFileExists,
  gateResult,
} = require('../lib/handler-utils');

const THREE_LAYERS = [
  { key: 'perception', patterns: [/感知层/, /perception/i, /探针/, /probe/i, /观察/] },
  { key: 'cognition', patterns: [/认知层/, /cognition/i, /判断/, /引擎/, /engine/i] },
  { key: 'execution', patterns: [/执行层/, /execution/i, /技能/, /skill/i, /行动/] },
];

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const docPath = event?.payload?.path || event?.payload?.document;
  logger.info?.(`[layered-decoupling-architecture-check] Checking: ${docPath || 'unknown'}`);

  const checks = [];

  if (!docPath) {
    checks.push({ name: 'document_specified', ok: false, message: 'No document path in event payload' });
  } else {
    const fullPath = path.isAbsolute(docPath) ? docPath : path.join(root, docPath);
    if (!checkFileExists(fullPath)) {
      checks.push({ name: 'document_exists', ok: false, message: `Document ${docPath} not found` });
    } else {
      const content = fs.readFileSync(fullPath, 'utf8');

      // Check each layer is mentioned
      for (const layer of THREE_LAYERS) {
        const found = layer.patterns.some(p => p.test(content));
        checks.push({
          name: `layer_${layer.key}`,
          ok: found,
          message: found
            ? `${layer.key} layer attribution found`
            : `Missing ${layer.key} layer attribution — design incomplete`,
        });
      }

      // Check event bus decoupling mention
      const hasEventBus = /事件总线|event.?bus|解耦|decouple/i.test(content);
      checks.push({
        name: 'event_bus_decoupling',
        ok: hasEventBus,
        message: hasEventBus
          ? 'Event bus / decoupling mentioned'
          : 'No event bus decoupling description — layers may be directly coupled',
      });

      // Check no direct coupling anti-patterns
      const hasDirectImport = /require\(['"]\.\.\/.*handler/i.test(content);
      checks.push({
        name: 'no_direct_coupling',
        ok: !hasDirectImport,
        message: hasDirectImport
          ? 'Direct handler import detected — should use event bus'
          : 'No direct coupling anti-patterns found',
      });
    }
  }

  const result = gateResult(rule?.id || 'layered-decoupling-architecture-001', checks);

  const reportPath = path.join(root, 'reports', 'layered-architecture', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'layered-decoupling-architecture-check',
    documentPath: docPath || null,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'layered-decoupling-architecture-check.completed', { ok: result.ok, status: result.status, actions });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
