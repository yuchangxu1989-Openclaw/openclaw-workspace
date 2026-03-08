/**
 * quality-gate handler: 质量门禁检查
 * 别名: quality_gate
 */
module.exports = async function qualityGate(event, rule, ctx) {
  // 基础质量门禁：检查事件是否有完整payload
  const payload = event?.payload || event?.data || {};
  const hasContent = Object.keys(payload).length > 0;
  return {
    success: true,
    result: hasContent ? 'pass' : 'warn_empty_payload',
    handler: 'quality-gate',
    eventType: event?.type,
    ruleId: rule?.id
  };
};
