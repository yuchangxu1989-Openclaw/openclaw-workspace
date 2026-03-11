'use strict';
/**
 * ISC Handler: pdca-do-exit-gate
 * Rule: ISC-PDCA-DO-EXIT-GATE-001
 * 离开Do阶段前检查交付物存在性
 */
const path = require('path');
const { writeReport, emitEvent, checkFileExists, gateResult } = require('../lib/handler-utils');

module.exports = async function (event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || process.cwd();
  const bus = context?.bus;
  const task = event?.payload?.task || event?.payload || {};

  logger.info?.(`[pdca-do-exit-gate] checking deliverables for task=${task.id || 'unknown'}`);

  const checks = [];
  const deliverables = task.deliverables || [];

  // Check 1: deliverables array is non-empty
  const hasDeliverables = Array.isArray(deliverables) && deliverables.length > 0;
  checks.push({
    name: 'has_deliverables',
    ok: hasDeliverables,
    message: hasDeliverables
      ? `${deliverables.length} deliverable(s) declared`
      : 'No deliverables declared — cannot exit Do phase',
  });

  // Check 2: each deliverable's file or URL exists
  if (hasDeliverables) {
    for (const d of deliverables) {
      const filePath = d.path || d.file || d.filePath || '';
      const url = d.url || '';
      let exists = false;
      let label = '';

      if (filePath) {
        const resolved = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
        exists = checkFileExists(resolved);
        label = filePath;
      } else if (url) {
        // URL deliverables are accepted if non-empty (runtime can't HTTP-check)
        exists = /^https?:\/\/.+/.test(url);
        label = url;
      } else {
        label = d.name || d.description || JSON.stringify(d).slice(0, 60);
      }

      checks.push({
        name: `deliverable_exists_${d.name || label.slice(0, 30)}`,
        ok: exists,
        message: exists ? `Found: ${label}` : `Missing deliverable: ${label || '(no path/url)'}`,
      });
    }
  }

  const result = gateResult('ISC-PDCA-DO-EXIT-GATE-001', checks);

  if (!result.ok) {
    await emitEvent(bus, 'pdca.do.exit.blocked', {
      ruleId: 'ISC-PDCA-DO-EXIT-GATE-001',
      taskId: task.id,
      missingDeliverables: checks.filter(c => !c.ok).map(c => c.message),
      timestamp: new Date().toISOString(),
    });
  }

  const reportPath = path.join(root, 'reports', 'isc', `pdca-do-exit-${task.id || Date.now()}.json`);
  writeReport(reportPath, { rule: 'ISC-PDCA-DO-EXIT-GATE-001', event: event?.type, result });

  logger.info?.(`[pdca-do-exit-gate] result=${result.status} passed=${result.passed}/${result.total}`);
  return result;
};
