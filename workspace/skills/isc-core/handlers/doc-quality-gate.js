'use strict';

/**
 * ISC Handler: doc-quality-gate
 * Rule: rule.doc-quality-gate-001 (重大文档双Agent质量门禁)
 * Validates critical documents go through write→review→rewrite pipeline.
 */

const fs = require('fs');
const path = require('path');
const {
  writeReport,
  emitEvent,
  gitExec,
  checkFileExists,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  const docPath = event?.payload?.path || event?.payload?.document;
  const taskType = event?.payload?.taskType || '';
  logger.info?.(`[doc-quality-gate] Checking: ${docPath || 'unknown'}, taskType: ${taskType}`);

  const checks = [];

  // Check 1: Document path must be specified
  if (!docPath) {
    checks.push({ name: 'document_specified', ok: false, message: 'No document path in event payload' });
  } else {
    checks.push({ name: 'document_specified', ok: true, message: `Document: ${docPath}` });
  }

  // Check 2: Task must be a critical document type
  const criticalKeywords = ['重大决策文档', '重要报告', '方案设计', '架构方案', '评测基线', '飞书文档写入'];
  const excludeKeywords = ['简单文件修改', '配置更新', '日志记录', 'memory更新'];

  const isCritical = criticalKeywords.some(kw => taskType.includes(kw) || (docPath || '').includes(kw));
  const isExcluded = excludeKeywords.some(kw => taskType.includes(kw) || (docPath || '').includes(kw));

  if (isExcluded) {
    checks.push({ name: 'not_excluded', ok: true, message: 'Task is excluded from quality gate — skip' });
    const result = gateResult(rule?.id || 'doc-quality-gate', checks);
    return { ok: true, autonomous: true, actions: ['skipped:excluded_task'], ...result };
  }

  checks.push({
    name: 'critical_document_detected',
    ok: isCritical,
    message: isCritical ? 'Critical document type detected — quality gate applies' : 'Not a critical document type',
  });

  // Check 3: Review metadata present (writer, reviewer roles)
  const reviewMeta = event?.payload?.reviewMeta || event?.payload?.review;
  const hasWriter = !!reviewMeta?.writer;
  const hasReviewer = !!reviewMeta?.reviewer;
  checks.push({
    name: 'writer_assigned',
    ok: hasWriter || !isCritical,
    message: hasWriter ? `Writer: ${reviewMeta.writer}` : 'No writer role assigned',
  });
  checks.push({
    name: 'reviewer_assigned',
    ok: hasReviewer || !isCritical,
    message: hasReviewer ? `Reviewer: ${reviewMeta.reviewer}` : 'No reviewer role assigned',
  });

  // Check 4: Review result (if review already happened)
  const reviewResult = reviewMeta?.result;
  if (reviewResult) {
    checks.push({
      name: 'review_passed',
      ok: reviewResult === 'pass',
      message: `Review result: ${reviewResult}`,
    });
  }

  const result = gateResult(rule?.id || 'doc-quality-gate', checks);

  const reportPath = path.join(root, 'reports', 'doc-quality-gate', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'doc-quality-gate',
    documentPath: docPath || null,
    taskType,
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'doc-quality-gate.completed', { ok: result.ok, status: result.status, actions });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
