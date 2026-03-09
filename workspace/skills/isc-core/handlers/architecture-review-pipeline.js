'use strict';

/**
 * ISC Handler: architecture-review-pipeline
 * Rule: rule.pipeline-benchmark-design-document-alignment-001
 * Triggers on design.document.created/modified — unified architecture governance checks.
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

  const docPath = event?.payload?.path || event?.payload?.document;
  logger.info?.(`[architecture-review-pipeline] Reviewing: ${docPath || 'unknown'}`);

  const checks = [];

  // Check 1: document exists
  if (docPath) {
    const fullPath = path.join(root, docPath);
    const exists = checkFileExists(fullPath);
    checks.push({
      name: 'document_exists',
      ok: exists,
      message: exists ? `Document ${docPath} found` : `Document ${docPath} missing`,
    });

    // Check 2: anti-entropy dimensions mentioned
    if (exists) {
      const content = fs.readFileSync(fullPath, 'utf8').toLowerCase();
      const dimensions = ['scalability', 'generalizability', 'growability', 'entropy'];
      const covered = dimensions.filter(d => content.includes(d));
      checks.push({
        name: 'anti_entropy_coverage',
        ok: covered.length >= 2,
        message: `${covered.length}/4 anti-entropy dimensions covered: ${covered.join(', ') || 'none'}`,
      });

      // Check 3: layered architecture references
      const layerKeywords = ['layer', 'separation', 'decouple', 'interface', 'abstraction'];
      const layerHits = layerKeywords.filter(k => content.includes(k));
      checks.push({
        name: 'layered_architecture_refs',
        ok: layerHits.length >= 1,
        message: `${layerHits.length} layered-architecture keywords found`,
      });

      // Check 4: review section present
      const hasReview = content.includes('review') || content.includes('审查') || content.includes('评审');
      checks.push({
        name: 'review_section',
        ok: hasReview,
        message: hasReview ? 'Review section present' : 'No review section found',
      });
    }
  } else {
    checks.push({
      name: 'document_specified',
      ok: false,
      message: 'No document path in event payload',
    });
  }

  const result = gateResult(rule?.id || 'architecture-review-pipeline', checks);

  const reportPath = path.join(root, 'reports', 'architecture-review', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'architecture-review-pipeline',
    eventType: event?.type || null,
    ruleId: rule?.id || null,
    documentPath: docPath || null,
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'architecture-review-pipeline.completed', {
    ok: result.ok,
    status: result.status,
    actions,
  });

  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: result.ok
      ? `Architecture review passed all ${result.total} checks`
      : `${result.failed}/${result.total} architecture checks failed`,
    ...result,
  };
};
