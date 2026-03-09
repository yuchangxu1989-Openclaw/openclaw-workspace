'use strict';

/**
 * ISC Handler: architecture-review
 * Rule: rule.architecture-review-pipeline-001
 * Enforces the multi-stage architecture review pipeline:
 * architect → engineer+QA parallel review → fix loop → tribunal → user decision.
 */

const fs = require('fs');
const path = require('path');
const {
  writeReport,
  emitEvent,
  gitExec,
  checkFileExists,
  scanFiles,
  gateResult,
} = require('../lib/handler-utils');

const REQUIRED_STAGES = [
  'architect_design',
  'parallel_review',
  'fix_loop',
  'caijuedian_tribunal',
  'user_final_decision',
];

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const docPath = event?.payload?.path || event?.payload?.document;
  const topic = event?.payload?.topic || path.basename(docPath || 'unknown', path.extname(docPath || ''));
  logger.info?.(`[architecture-review] Checking pipeline for: ${topic}`);

  const checks = [];

  // 1. Verify design document exists
  if (!docPath) {
    checks.push({ name: 'design_document', ok: false, message: 'No document path in event payload' });
  } else {
    const fullPath = path.join(root, docPath);
    const exists = checkFileExists(fullPath);
    checks.push({
      name: 'design_document',
      ok: exists,
      message: exists ? `Design doc found: ${docPath}` : `Design doc missing: ${docPath}`,
    });

    if (exists) {
      const content = fs.readFileSync(fullPath, 'utf8');

      // 2. Check for review artifacts in reports/
      const reviewDir = path.join(root, 'reports', topic);
      const hasReviewDir = fs.existsSync(reviewDir);
      checks.push({
        name: 'review_artifacts',
        ok: hasReviewDir,
        message: hasReviewDir
          ? 'Review artifacts directory exists'
          : `No review artifacts at reports/${topic} — pipeline may not have run`,
      });

      // 3. Check document has review sections/markers
      const hasArchitectSection = /架构师|architect/i.test(content);
      const hasEngineerReview = /工程师|engineer.*review|可落地/i.test(content);
      const hasQAReview = /质量分析|QA|quality/i.test(content);
      checks.push({
        name: 'architect_stage',
        ok: hasArchitectSection,
        message: hasArchitectSection ? 'Architect design stage evident' : 'No architect design markers',
      });
      checks.push({
        name: 'engineer_review_stage',
        ok: hasEngineerReview,
        message: hasEngineerReview ? 'Engineer review markers found' : 'No engineer review evidence',
      });
      checks.push({
        name: 'qa_review_stage',
        ok: hasQAReview,
        message: hasQAReview ? 'QA review markers found' : 'No QA/quality review evidence',
      });

      // 4. Check for tribunal/final decision markers
      const hasTribunal = /裁决殿|tribunal|终审/i.test(content);
      checks.push({
        name: 'tribunal_stage',
        ok: hasTribunal,
        message: hasTribunal ? 'Tribunal review evident' : 'No tribunal/final review markers',
      });
    }
  }

  const result = gateResult(rule?.id || 'architecture-review-pipeline', checks, { failClosed: true });

  const reportPath = path.join(root, 'reports', 'architecture-review', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'architecture-review',
    topic,
    documentPath: docPath || null,
    requiredStages: REQUIRED_STAGES,
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'architecture-review.completed', {
    ok: result.ok,
    status: result.status,
    topic,
    actions,
  });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
