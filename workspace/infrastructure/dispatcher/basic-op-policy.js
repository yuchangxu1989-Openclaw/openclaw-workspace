'use strict';

/**
 * Basic-op auto expansion policy / ISC steel-stamp.
 *
 * Globalized rule: if user intent is a "基操类任务" (basic operation) and the
 * request text implies batch / same-caliber / derivative / immediate execution,
 * the system should auto-expand into executable sibling tasks and enqueue them
 * immediately instead of stopping at main-thread analysis.
 */

const BASIC_OP_PATTERNS = [
  /基操/i,
  /扩列/i,
  /自动扩列/i,
  /自动派生/i,
  /派生执行/i,
  /同类请求/i,
  /按用户口径/i,
  /立即执行/i,
  /批量/i,
  /批处理/i,
  /一并处理/i,
  /顺手把.*也/i,
  /同类.*都/i,
  /把.*全都/i,
];

const BATCH_CUES = [
  /并|以及|和|同时|一并|顺带|外加|另外|再把/i,
  /全部|都|同类|相同口径|类似|相关/i,
  /自动扩列|自动派生|立即执行/i,
];

const EXECUTIONAL_CUES = [
  /执行|推进|落地|处理|修复|补齐|接入|固化|创建|生成|发送|同步|分发/i,
];

function detectBasicOpIntent(text) {
  const source = String(text || '').trim();
  if (!source) {
    return { hit: false, score: 0, reasons: [] };
  }

  const reasons = [];
  let score = 0;

  if (BASIC_OP_PATTERNS.some((re) => re.test(source))) {
    score += 2;
    reasons.push('basic-op-keyword');
  }
  if (BATCH_CUES.some((re) => re.test(source))) {
    score += 1;
    reasons.push('batch-cue');
  }
  if (EXECUTIONAL_CUES.some((re) => re.test(source))) {
    score += 1;
    reasons.push('executional-cue');
  }

  return {
    hit: score >= 2,
    score,
    reasons,
  };
}

function splitTextToClauses(text) {
  return String(text || '')
    .split(/[；;。\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function deriveBasicOpTasks(text, meta = {}) {
  const source = String(text || '').trim();
  const clauses = splitTextToClauses(source);
  const tasks = [];
  const seen = new Set();

  function pushTask(kind, title, description, extra = {}) {
    const key = `${kind}::${title}::${description}`;
    if (seen.has(key)) return;
    seen.add(key);
    tasks.push({
      kind,
      title,
      description,
      priority: extra.priority || meta.priority || 'high',
      tags: Array.isArray(extra.tags) ? extra.tags : [],
      payload: extra.payload || {},
    });
  }

  for (const clause of clauses) {
    if (/规则|钢印/i.test(clause)) {
      pushTask('rule', '补正式钢印/规则', clause, { tags: ['basic-op', 'rule'] });
    }
    if (/ISC/i.test(clause) || /意图/i.test(clause) || /事件/i.test(clause) || /执行链/i.test(clause)) {
      pushTask('integration', '接入 ISC / 意图 / 事件 / 执行链', clause, { tags: ['basic-op', 'integration'] });
    }
    if (/自动命中/i.test(clause) || /扩列执行/i.test(clause) || /主线程分析/i.test(clause)) {
      pushTask('dispatch', '让同类请求自动命中扩列执行', clause, { tags: ['basic-op', 'dispatch'] });
    }
    if (/验证/i.test(clause) || /最小验证/i.test(clause) || /验收/i.test(clause)) {
      pushTask('validation', '补最小验证', clause, { tags: ['basic-op', 'validation'] });
    }
  }

  if (tasks.length === 0 && detectBasicOpIntent(source).hit) {
    pushTask('execution', '按用户口径自动扩列并执行', source, { tags: ['basic-op', 'execution'] });
  }

  return tasks;
}

function shouldAutoExpandBasicOp(text, meta = {}) {
  const signal = detectBasicOpIntent(text);
  const derivedTasks = deriveBasicOpTasks(text, meta);
  return {
    shouldExpand: signal.hit && derivedTasks.length > 0,
    signal,
    derivedTasks,
  };
}

module.exports = {
  BASIC_OP_PATTERNS,
  BATCH_CUES,
  EXECUTIONAL_CUES,
  detectBasicOpIntent,
  deriveBasicOpTasks,
  shouldAutoExpandBasicOp,
};
