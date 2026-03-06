'use strict';

/**
 * Model routing / budget governance for multi-agent dispatch.
 *
 * Policy target:
 *   - Default to gpt-5.4
 *   - Opus only for very important architecture design / hard troubleshooting
 *   - Enforceable in code, auditable in task state / pending dispatches / tests
 */

const DEFAULT_MODEL = 'codex/gpt-5.4';
const OPUS_MODEL = 'claude-opus-4-20250514';
const ALLOWED_OPUS_PRIORITIES = new Set(['critical']);
const OPUS_JUSTIFICATION_MIN_LEN = 12;

const ARCHITECTURE_PATTERNS = [
  /架构/i,
  /architecture/i,
  /system\s*design/i,
  /design\s*review/i,
  /tech\s*lead/i,
  /technical\s*design/i,
  /方案设计/i,
  /架构设计/i,
  /系统设计/i,
  /系统方案/i,
];

const TROUBLESHOOTING_PATTERNS = [
  /疑难/i,
  /杂症/i,
  /疑难杂症/i,
  /hard\s*bug/i,
  /deep\s*debug/i,
  /root\s*cause/i,
  /incident/i,
  /sev[ -]?(0|1|p0|p1)/i,
  /生产故障/i,
  /线上故障/i,
  /复杂排障/i,
  /根因分析/i,
];

const DISALLOWED_OPUS_PATTERNS = [
  /文档/i,
  /写作/i,
  /report/i,
  /summary/i,
  /总结/i,
  /润色/i,
  /翻译/i,
  /整理/i,
  /填表/i,
  /demo/i,
  /example/i,
  /测试用例/i,
  /单元测试/i,
  /脚本/i,
  /crud/i,
  /boilerplate/i,
  /样板/i,
  /普通编码/i,
];

function textOf(task = {}) {
  return [
    task.title,
    task.description,
    task.reason,
    task.justification,
    task.opusReason,
    task.payload && task.payload.reason,
    task.payload && task.payload.justification,
    task.payload && task.payload.opusReason,
    Array.isArray(task.tags) ? task.tags.join(' ') : '',
  ].filter(Boolean).join('\n');
}

function includesAny(text, patterns) {
  return patterns.some((p) => p.test(text));
}

function normalizePriority(priority) {
  return priority || 'normal';
}

function isOpusModel(model = '') {
  return /opus/i.test(model);
}

function isArchitectureOrHardTroubleshooting(task = {}) {
  const text = textOf(task);
  return includesAny(text, ARCHITECTURE_PATTERNS) || includesAny(text, TROUBLESHOOTING_PATTERNS);
}

function hasDisallowedOpusShape(task = {}) {
  const text = textOf(task);
  return includesAny(text, DISALLOWED_OPUS_PATTERNS);
}

function readJustification(task = {}) {
  const raw = task.opusReason || task.justification || task.reason ||
    (task.payload && (task.payload.opusReason || task.payload.justification || task.payload.reason)) || '';
  return String(raw).trim();
}

function evaluateOpusEligibility(task = {}) {
  const priority = normalizePriority(task.priority);
  const justification = readJustification(task);
  const categoryOk = isArchitectureOrHardTroubleshooting(task);
  const priorityOk = ALLOWED_OPUS_PRIORITIES.has(priority);
  const justificationOk = justification.length >= OPUS_JUSTIFICATION_MIN_LEN;
  const disallowed = hasDisallowedOpusShape(task);

  return {
    allowed: priorityOk && categoryOk && justificationOk && !disallowed,
    checks: {
      priorityOk,
      categoryOk,
      justificationOk,
      disallowed,
    },
    justification,
  };
}

function chooseGovernedModel(task = {}) {
  const requestedModel = task.model || null;
  const evaluation = evaluateOpusEligibility(task);
  const requestedOpus = isOpusModel(requestedModel || '');

  if (requestedOpus) {
    if (evaluation.allowed) {
      return {
        requestedModel,
        finalModel: requestedModel,
        changed: false,
        allowed: true,
        reason: 'opus_allowed_by_policy',
        evaluation,
      };
    }

    return {
      requestedModel,
      finalModel: DEFAULT_MODEL,
      changed: true,
      allowed: false,
      reason: 'opus_downgraded_by_policy',
      evaluation,
    };
  }

  return {
    requestedModel,
    finalModel: requestedModel || DEFAULT_MODEL,
    changed: (requestedModel || DEFAULT_MODEL) !== requestedModel,
    allowed: true,
    reason: requestedModel ? 'requested_model_kept' : 'defaulted_to_gpt_5_4',
    evaluation,
  };
}

function applyModelGovernance(task = {}) {
  const decision = chooseGovernedModel(task);
  const governed = {
    ...task,
    model: decision.finalModel,
    governance: {
      policy: 'default-gpt-5.4-opus-only-critical-architecture-or-hard-troubleshooting',
      requestedModel: decision.requestedModel,
      finalModel: decision.finalModel,
      changed: decision.changed,
      reason: decision.reason,
      opus: {
        requested: isOpusModel(decision.requestedModel || ''),
        allowed: decision.evaluation.allowed,
        checks: decision.evaluation.checks,
        justification: decision.evaluation.justification,
      },
    },
  };

  if (governed.payload && typeof governed.payload === 'object') {
    governed.payload = {
      ...governed.payload,
      governance: governed.governance,
    };
  }

  return governed;
}

module.exports = {
  DEFAULT_MODEL,
  OPUS_MODEL,
  isOpusModel,
  isArchitectureOrHardTroubleshooting,
  evaluateOpusEligibility,
  chooseGovernedModel,
  applyModelGovernance,
};
