'use strict';
/**
 * ISC Handler: rule.arch-gate-before-action-001 [CRITICAL]
 * 任何影响系统状态的操作（提交代码、发布技能、生成报告、关闭Day）
 * 必须通过至少一个自动化Gate检查。无Gate的操作路径视为安全漏洞。
 *
 * Trigger: skill.lifecycle.created, skill.lifecycle.published,
 *          isc.rule.created, quality.benchmark.completed,
 *          orchestration.pipeline.completed, system.day.closure_requested
 */

const STATE_CHANGING_EVENTS = [
  'skill.lifecycle.published',
  'isc.rule.created',
  'quality.benchmark.completed',
  'orchestration.pipeline.completed',
  'system.day.closure_requested',
  'git.commit.pushed',
  'skill.lifecycle.created'
];

function check(context) {
  const result = {
    ruleId: 'rule.arch-gate-before-action-001',
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

    // Only enforce on state-changing events
    const isStateChanging = STATE_CHANGING_EVENTS.some(e =>
      eventName.includes(e) || eventName.toLowerCase().includes(e.split('.').pop())
    );
    if (!isStateChanging) {
      result.checked = true;
      return result;
    }

    // Check 1: Must have gateChecks or gateResults in payload
    const gateChecks = payload.gateChecks || payload.gateResults ||
                       payload.gates || payload.preChecks || [];
    const gatesPassed = Array.isArray(gateChecks) ? gateChecks : [gateChecks];

    if (!gatesPassed.length || (gatesPassed.length === 1 && !gatesPassed[0])) {
      result.passed = false;
      result.findings.push({
        level: 'critical',
        message: `[CRITICAL] 状态变更操作缺少Gate检查: event="${eventName}"`,
        detail: '任何影响系统状态的操作必须通过至少一个自动化Gate检查。',
        remediation: '在操作前添加gate-check步骤，将结果放入payload.gateChecks'
      });
      return result;
    }

    // Check 2: At least one gate must have passed
    const anyPassed = gatesPassed.some(g => {
      if (typeof g === 'object') return g.passed === true || g.ok === true || g.status === 'passed';
      return g === true || g === 'passed';
    });

    if (!anyPassed) {
      result.passed = false;
      result.findings.push({
        level: 'critical',
        message: `[CRITICAL] 所有Gate检查均未通过: event="${eventName}"`,
        detail: `共${gatesPassed.length}个Gate，无一通过。操作应被阻断。`,
        remediation: '修复Gate检查失败项后重试'
      });
    }

    // Check 3: Gate results must have timestamps (traceability)
    const hasTimestamps = gatesPassed.every(g =>
      typeof g !== 'object' || g.timestamp || g.checkedAt || g.ts
    );
    if (!hasTimestamps && gatesPassed.length > 0 && typeof gatesPassed[0] === 'object') {
      result.findings.push({
        level: 'warning',
        message: 'Gate检查结果缺少时间戳，影响可追溯性',
        detail: '建议每个gate结果包含timestamp字段'
      });
    }

    result.checked = true;
  } catch (err) {
    result.passed = false;
    result.findings.push({ level: 'error', message: err.message });
  }

  return result;
}

module.exports = { check };
