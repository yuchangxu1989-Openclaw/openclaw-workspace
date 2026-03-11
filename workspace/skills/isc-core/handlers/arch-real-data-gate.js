'use strict';
/**
 * ISC Handler: rule.arch-real-data-gate-005 [CRITICAL]
 * 任何benchmark、测试、验收的数据来源必须标注且可溯源。
 * 合成数据可用于开发调试，不可用于验收。验收使用合成数据=验收无效。
 *
 * Trigger: quality.benchmark.completed
 */

const SYNTHETIC_MARKERS = [
  'synthetic', 'mock', 'fake', 'generated', 'dummy', 'placeholder',
  'test-data', 'sample', '合成', '模拟', '假数据'
];

const ACCEPTANCE_EVENTS = [
  'acceptance', 'benchmark', 'validation', 'release', 'publish',
  '验收', '发布', '基准测试'
];

function check(context) {
  const result = {
    ruleId: 'rule.arch-real-data-gate-005',
    severity: 'critical',
    passed: true,
    findings: [],
    timestamp: new Date().toISOString()
  };

  try {
    if (!context || typeof context !== 'object') {
      result.passed = false;
      result.findings.push({ level: 'error', message: 'Invalid context provided' });
      return result;
    }

    const event = context.event || {};
    const payload = context.payload || event.payload || {};
    const eventName = event.name || event.type || payload.eventName || '';

    // Check 1: Data source must be declared
    const dataSource = payload.dataSource || payload.data_source ||
                       payload.source || payload.dataSources || null;

    if (!dataSource) {
      result.passed = false;
      result.findings.push({
        level: 'critical',
        message: '[CRITICAL] 数据来源未标注',
        detail: '任何benchmark/测试/验收的数据来源必须标注且可溯源。payload中缺少dataSource字段。',
        remediation: '在payload中添加 dataSource: { type: "real"|"synthetic", origin: "...", traceId: "..." }'
      });
      return result;
    }

    // Normalize dataSource to string for checking
    const sourceStr = typeof dataSource === 'string'
      ? dataSource.toLowerCase()
      : JSON.stringify(dataSource).toLowerCase();

    // Check 2: Determine if this is an acceptance/benchmark context
    const isAcceptance = ACCEPTANCE_EVENTS.some(kw =>
      eventName.toLowerCase().includes(kw) ||
      (payload.phase || '').toLowerCase().includes(kw) ||
      (payload.stage || '').toLowerCase().includes(kw)
    );

    // Check 3: Synthetic data in acceptance = violation
    const isSynthetic = SYNTHETIC_MARKERS.some(m => sourceStr.includes(m));
    const sourceType = (typeof dataSource === 'object')
      ? (dataSource.type || dataSource.dataType || '').toLowerCase()
      : '';

    if (isAcceptance && (isSynthetic || sourceType === 'synthetic')) {
      result.passed = false;
      result.findings.push({
        level: 'critical',
        message: '[CRITICAL] 验收阶段使用了合成数据，验收无效',
        detail: `数据来源标记为合成/模拟: "${sourceStr.substring(0, 100)}"。合成数据仅可用于开发调试。`,
        remediation: '使用真实数据重新执行验收流程'
      });
    }

    // Check 4: Traceability — source must have origin or traceId
    if (typeof dataSource === 'object') {
      const hasTrace = dataSource.origin || dataSource.traceId ||
                       dataSource.path || dataSource.url || dataSource.source;
      if (!hasTrace) {
        result.findings.push({
          level: 'warning',
          message: '数据来源缺少溯源信息（origin/traceId/path）',
          detail: '建议在dataSource中包含origin或traceId以确保可追溯性'
        });
        if (isAcceptance) {
          result.passed = false;
          result.findings[result.findings.length - 1].level = 'critical';
        }
      }
    }

    result.checked = true;
  } catch (err) {
    result.passed = false;
    result.findings.push({ level: 'error', message: err.message });
  }

  return result;
}

module.exports = { check };
