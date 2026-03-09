'use strict';

const path = require('path');
const fs = require('fs');
const {
  writeReport,
  emitEvent,
  checkFileExists,
  gateResult,
} = require('../../../skills/isc-core/lib/handler-utils');

/**
 * Pipeline Benchmark: Design Document Layered
 * 设计文档事件在 benchmark 命名空间下补充分层解耦检查。
 */
module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  logger.info?.(`[pipeline-benchmark-design-document-layered] Triggered by ${event?.type}`, { eventId: event?.id });

  const payload = event?.payload || {};
  const docPath = payload.document_path || payload.file_path || payload.path || '';
  const checks = [];

  // ─── 1. 感知 ───
  let docContent = '';
  if (docPath) {
    const fullPath = path.resolve(root, docPath);
    if (checkFileExists(fullPath)) {
      try { docContent = fs.readFileSync(fullPath, 'utf8'); } catch {}
    }
  }

  checks.push({
    name: 'document_readable',
    ok: !!docContent,
    message: docContent ? `文档已读取 (${docContent.length} 字符)` : '无文档内容可分析',
  });

  // ─── 2. 判断：分层解耦指标 ───
  const hasLayerSection = /##\s*(分层|Layer|层次|Architecture Layer)/i.test(docContent);
  checks.push({
    name: 'has_layer_section',
    ok: hasLayerSection || !docContent,
    message: hasLayerSection ? '包含分层章节' : '缺少明确的分层章节',
  });

  const hasDependencySection = /##\s*(依赖|Dependency|Dependencies|解耦)/i.test(docContent);
  checks.push({
    name: 'has_dependency_section',
    ok: hasDependencySection || !docContent,
    message: hasDependencySection ? '包含依赖/解耦章节' : '缺少依赖/解耦章节',
  });

  // ─── 3. 输出 ───
  const result = gateResult(rule?.id || 'pipeline-benchmark-design-document-layered-001', checks, { failClosed: false });

  // ─── 4. 持久化 ───
  const reportPath = path.join(root, 'reports', 'pipeline-benchmark', `design-doc-layered-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'pipeline-benchmark-design-document-layered-001',
    eventType: event?.type || null,
    docPath,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  // ─── 5. 闭环 ───
  await emitEvent(bus, 'design.document.layered.checked', { docPath, result: result.status });
  actions.push('event_emitted:design.document.layered.checked');

  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: `分层解耦检查: ${result.passed}/${result.total} 通过`,
    ...result,
  };
};
