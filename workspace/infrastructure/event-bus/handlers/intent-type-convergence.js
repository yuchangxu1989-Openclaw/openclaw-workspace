'use strict';

/**
 * 自主执行器：意图类型收敛检查
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 扫描意图注册表 → 发现不MECE → 自动合并/拆分 → 更新注册表 → 验证
 */

const fs = require('fs');
const path = require('path');

const ALLOWED_TYPES = [
  'emotion_polarity',
  'rule_trigger',
  'complex',
  'implicit',
  'multi_intent_single_sentence',
  'query',
  'command',
  'navigation',
  'confirmation',
  'rejection',
];

// MECE 分类映射：不规范类型 → 应该归入的规范类型
const MERGE_MAP = {
  emotion: 'emotion_polarity',
  polarity: 'emotion_polarity',
  sentiment: 'emotion_polarity',
  trigger: 'rule_trigger',
  rule: 'rule_trigger',
  multi_intent: 'multi_intent_single_sentence',
  multi: 'multi_intent_single_sentence',
  compound: 'complex',
  composite: 'complex',
  unclear: 'implicit',
  hidden: 'implicit',
  ask: 'query',
  question: 'query',
  search: 'query',
  action: 'command',
  execute: 'command',
  navigate: 'navigation',
  goto: 'navigation',
  yes: 'confirmation',
  affirm: 'confirmation',
  no: 'rejection',
  deny: 'rejection',
  cancel: 'rejection',
};

function loadRegistry(registryPath) {
  if (!fs.existsSync(registryPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch {
    return null;
  }
}

function saveRegistry(registryPath, data) {
  fs.writeFileSync(registryPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const registryPath = path.join(root, 'infrastructure', 'intent-registry.json');
  const actions = [];
  const errors = [];

  // ─── 感知：加载意图注册表 ───
  let registry = loadRegistry(registryPath);
  if (!registry) {
    // 如果注册表不存在，从事件和默认值创建一个
    registry = { types: [...ALLOWED_TYPES], aliases: {}, entries: [] };
    saveRegistry(registryPath, registry);
    actions.push('created_registry');
    logger.info?.('[intent-type-convergence] 创建意图注册表');
  }

  const types = registry.types || [];
  const aliases = registry.aliases || {};
  let modified = false;

  // ─── 判断：检查MECE性 ───
  // 1) 发现不在允许列表中的类型
  const nonStandard = types.filter(t => !ALLOWED_TYPES.includes(t));

  // 2) 检查事件携带的意图类型
  const payload = event?.payload || {};
  const requestedType = payload.intentType || payload.intent_type || '';
  const canonicalType = payload.canonicalType || payload.canonical_type || requestedType;

  // ─── 自主执行：自动合并/拆分 ───
  // 处理注册表中的非标准类型
  for (const ns of nonStandard) {
    const normalized = ns.toLowerCase().replace(/[-_\s]+/g, '_');
    const mergeTarget = MERGE_MAP[normalized] || MERGE_MAP[ns.toLowerCase()];
    if (mergeTarget && ALLOWED_TYPES.includes(mergeTarget)) {
      // 自动合并：将非标准类型映射到规范类型
      aliases[ns] = mergeTarget;
      const idx = types.indexOf(ns);
      if (idx !== -1) types.splice(idx, 1);
      if (!types.includes(mergeTarget)) types.push(mergeTarget);
      actions.push(`merged:${ns}→${mergeTarget}`);
      modified = true;
    } else {
      // 无法自动映射 → 标记为待人工确认，但不阻塞
      aliases[ns] = '__pending_review__';
      actions.push(`flagged_for_review:${ns}`);
      modified = true;
    }
  }

  // 处理事件中携带的非标准类型
  let eventTypeFixed = false;
  if (canonicalType && !ALLOWED_TYPES.includes(canonicalType)) {
    const normalized = canonicalType.toLowerCase().replace(/[-_\s]+/g, '_');
    const mergeTarget = MERGE_MAP[normalized] || MERGE_MAP[canonicalType.toLowerCase()];
    if (mergeTarget) {
      actions.push(`event_type_remapped:${canonicalType}→${mergeTarget}`);
      eventTypeFixed = true;
    } else {
      actions.push(`event_type_unknown:${canonicalType}`);
    }
  }

  // 确保ALLOWED_TYPES都在注册表中（MECE完整性）
  for (const at of ALLOWED_TYPES) {
    if (!types.includes(at)) {
      types.push(at);
      actions.push(`added_missing_type:${at}`);
      modified = true;
    }
  }

  // ─── 写回注册表 ───
  if (modified) {
    registry.types = types;
    registry.aliases = aliases;
    registry.lastConvergenceCheck = new Date().toISOString();
    saveRegistry(registryPath, registry);
    logger.info?.(`[intent-type-convergence] 注册表已更新: ${actions.join(', ')}`);
  }

  // ─── 验证：重新加载并验证 ───
  const verified = loadRegistry(registryPath);
  const stillNonStandard = (verified?.types || []).filter(
    t => !ALLOWED_TYPES.includes(t)
  );
  const verifyOk = stillNonStandard.length === 0;

  // ─── 闭环：通知（仅在有pending review或验证失败时） ───
  const pendingReview = Object.entries(aliases).filter(([, v]) => v === '__pending_review__');
  if (pendingReview.length > 0 && context?.notify) {
    await context.notify(
      `[intent-type-convergence] ${pendingReview.length}个意图类型无法自动归类，需人工确认: ${pendingReview.map(([k]) => k).join(', ')}`,
      'warning'
    );
  }

  // ─── 事件传播 ───
  if (context?.bus?.emit && modified) {
    await context.bus.emit('intent-registry.updated', {
      actions,
      typeCount: types.length,
      aliasCount: Object.keys(aliases).length,
    });
  }

  return {
    ok: verifyOk,
    autonomous: true,
    actions,
    errors: errors.length ? errors : undefined,
    registry: {
      types: verified?.types || types,
      aliasCount: Object.keys(verified?.aliases || aliases).length,
      pendingReview: pendingReview.map(([k]) => k),
    },
    verification: verifyOk ? '收敛验证通过' : `仍有${stillNonStandard.length}个非标准类型`,
    message: modified
      ? `自主修复完成: ${actions.length}项操作, ${pendingReview.length}项待人工确认`
      : '意图类型已收敛，无需修复',
  };
};
