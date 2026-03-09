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
 * Pipeline Benchmark: Analysis Requested
 * 兼容 analysis.requested 事件命名，触发并行分析治理流程。
 */
module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  logger.info?.(`[pipeline-benchmark-analysis-requested] Triggered by ${event?.type}`, { eventId: event?.id });

  const payload = event?.payload || {};
  const analysisTarget = payload.target || payload.path || '';
  const checks = [];

  // ─── 1. 感知：检查分析请求是否有效 ───
  const hasTarget = !!analysisTarget;
  checks.push({
    name: 'analysis_target_present',
    ok: hasTarget,
    message: hasTarget ? `分析目标: ${analysisTarget}` : '缺少分析目标',
  });

  // ─── 2. 判断：检查并行分析流水线是否就绪 ───
  const pipelineConfig = path.join(root, 'infrastructure', 'event-bus', 'handlers', 'parallel-analysis.js');
  const pipelineReady = checkFileExists(pipelineConfig);
  checks.push({
    name: 'parallel_analysis_pipeline_ready',
    ok: pipelineReady,
    message: pipelineReady ? '并行分析流水线就绪' : '并行分析流水线未找到',
  });

  // ─── 3. 输出：门禁结果 ───
  const result = gateResult(rule?.id || 'pipeline-benchmark-analysis-requested-001', checks, { failClosed: false });

  // ─── 4. 持久化：写报告 ───
  const reportPath = path.join(root, 'reports', 'pipeline-benchmark', `analysis-requested-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'pipeline-benchmark-analysis-requested-001',
    eventType: event?.type || null,
    analysisTarget,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  // ─── 5. 闭环：转发到并行分析 ───
  if (hasTarget) {
    await emitEvent(bus, 'analysis.pipeline.started', { target: analysisTarget });
    actions.push('event_emitted:analysis.pipeline.started');
  }

  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: hasTarget ? `分析请求已受理: ${analysisTarget}` : '分析请求缺少目标',
    ...result,
  };
};
