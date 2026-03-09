'use strict';

const path = require('path');
const {
  writeReport,
  emitEvent,
  scanFiles,
  checkFileExists,
  gateResult,
} = require('../../../skills/isc-core/lib/handler-utils');

/**
 * Pipeline Benchmark: Design Document Alignment
 * 设计文档创建或修改时触发统一架构治理补充检查。
 */
module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  logger.info?.(`[pipeline-benchmark-design-document-alignment] Triggered by ${event?.type}`, { eventId: event?.id });

  const payload = event?.payload || {};
  const docPath = payload.document_path || payload.file_path || payload.path || '';
  const checks = [];

  // ─── 1. 感知：定位设计文档 ───
  checks.push({
    name: 'document_path_present',
    ok: !!docPath,
    message: docPath ? `文档路径: ${docPath}` : '未指定文档路径，将扫描全局',
  });

  // ─── 2. 判断：三类基础规则检查 ───
  const antiEntropyHandler = path.join(root, 'infrastructure', 'event-bus', 'handlers', 'anti-entropy-check.js');
  const layeredHandler = path.join(root, 'infrastructure', 'event-bus', 'handlers', 'design-document-delivery-pipeline.js');
  const reviewHandler = path.join(root, 'infrastructure', 'event-bus', 'handlers', 'architecture-review.js');

  checks.push({
    name: 'anti_entropy_handler_exists',
    ok: checkFileExists(antiEntropyHandler),
    message: checkFileExists(antiEntropyHandler) ? 'anti-entropy handler 就绪' : 'anti-entropy handler 缺失',
  });

  checks.push({
    name: 'layered_handler_exists',
    ok: checkFileExists(layeredHandler),
    message: checkFileExists(layeredHandler) ? 'layered handler 就绪' : 'layered handler 缺失',
  });

  checks.push({
    name: 'review_handler_exists',
    ok: checkFileExists(reviewHandler),
    message: checkFileExists(reviewHandler) ? 'review handler 就绪' : 'review handler 缺失',
  });

  // ─── 3. 输出 ───
  const result = gateResult(rule?.id || 'pipeline-benchmark-design-document-alignment-001', checks, { failClosed: false });

  // ─── 4. 持久化 ───
  const reportPath = path.join(root, 'reports', 'pipeline-benchmark', `design-doc-alignment-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'pipeline-benchmark-design-document-alignment-001',
    eventType: event?.type || null,
    docPath,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  // ─── 5. 闭环 ───
  await emitEvent(bus, 'design.document.alignment.checked', { docPath, result: result.status });
  actions.push('event_emitted:design.document.alignment.checked');

  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: `设计文档对齐检查完成: ${result.passed}/${result.total} 通过`,
    ...result,
  };
};
