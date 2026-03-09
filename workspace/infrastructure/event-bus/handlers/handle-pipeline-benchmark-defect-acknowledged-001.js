'use strict';

const path = require('path');
const {
  writeReport,
  emitEvent,
  checkFileExists,
  readRuleJson,
  gateResult,
} = require('../../../skills/isc-core/lib/handler-utils');

/**
 * Pipeline Benchmark: Defect Acknowledged
 * 兼容 agent.behavior.defect_acknowledged 事件命名，触发自我纠偏规则化。
 */
module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  logger.info?.(`[pipeline-benchmark-defect-acknowledged] Triggered by ${event?.type}`, { eventId: event?.id });

  const payload = event?.payload || {};
  const defectId = payload.defect_id || payload.id || '';
  const rootCause = payload.root_cause || '';
  const checks = [];

  // ─── 1. 感知：检查缺陷确认信息 ───
  checks.push({
    name: 'defect_id_present',
    ok: !!defectId,
    message: defectId ? `缺陷ID: ${defectId}` : '缺少缺陷ID',
  });

  checks.push({
    name: 'root_cause_provided',
    ok: !!rootCause,
    message: rootCause ? `根因: ${rootCause}` : '缺少根因分析',
  });

  // ─── 2. 判断：是否需要规则化 ───
  const correctionLogDir = path.join(root, 'reports', 'self-correction');
  const hasHistory = checkFileExists(correctionLogDir);
  checks.push({
    name: 'correction_history_dir',
    ok: true,
    message: hasHistory ? '自我纠偏记录目录存在' : '将创建自我纠偏记录目录',
  });

  // ─── 3. 输出 ───
  const result = gateResult(rule?.id || 'pipeline-benchmark-defect-acknowledged-001', checks, { failClosed: false });

  // ─── 4. 持久化 ───
  const reportPath = path.join(root, 'reports', 'pipeline-benchmark', `defect-acknowledged-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'pipeline-benchmark-defect-acknowledged-001',
    eventType: event?.type || null,
    defectId,
    rootCause,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  // ─── 5. 闭环 ───
  if (defectId) {
    await emitEvent(bus, 'defect.correction.initiated', { defectId, rootCause });
    actions.push('event_emitted:defect.correction.initiated');
  }

  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: defectId ? `缺陷 ${defectId} 已确认，自我纠偏流程启动` : '缺陷确认事件缺少ID',
    ...result,
  };
};
