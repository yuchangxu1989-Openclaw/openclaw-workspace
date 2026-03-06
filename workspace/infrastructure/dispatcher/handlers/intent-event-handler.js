'use strict';

/**
 * Intent Event Handler — 为 intent.ruleify / intent.reflect / intent.directive
 * 提供真实消费路径，避免停留在 no_route / 报告层。
 *
 * - intent.ruleify   → 生成 ISC 规则草案（最小可执行骨架）
 * - intent.reflect   → 触发 CRAS 分析并沉淀洞察
 * - intent.directive → 在 DTO 中创建任务
 */

const fs = require('fs');
const path = require('path');

let _dtoBridge = null;
let _crasBridge = null;

function getDTOBridge() {
  if (!_dtoBridge) {
    _dtoBridge = require(path.join(__dirname, '..', '..', '..', 'skills', 'dto-core', 'event-bridge.js'));
  }
  return _dtoBridge;
}

function getCRASBridge() {
  if (!_crasBridge) {
    _crasBridge = require(path.join(__dirname, '..', '..', '..', 'skills', 'cras', 'event-bridge.js'));
  }
  return _crasBridge;
}

function slugify(input) {
  return String(input || 'intent')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'intent';
}

function shortHash(input) {
  const s = String(input || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).slice(0, 6);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function buildRuleDraft(event) {
  const payload = event.payload || {};
  const target = payload.target || 'intent-derived-policy';
  const summary = payload.summary || payload.evidence || 'Auto-generated from intent.ruleify';
  const ruleSlug = slugify(target);
  const hash = shortHash(`${target}::${summary}`);
  const ruleId = `rule.intent-${ruleSlug}-${hash}`;
  const fileName = `${ruleId}.json`;
  const filePath = path.join('/root/.openclaw/workspace/skills/isc-core/rules', fileName);

  if (fs.existsSync(filePath)) {
    return { created: false, exists: true, rule_id: ruleId, file: filePath };
  }

  const rule = {
    id: ruleId,
    name: `intent_${ruleSlug}`,
    domain: 'intent',
    type: 'workflow',
    description: summary,
    trigger: {
      events: ['intent.ruleify'],
      conditions: [
        { field: 'target', op: 'contains', value: target }
      ],
      actions: [
        {
          type: 'auto_trigger',
          description: `Auto-created from intent.ruleify: ${target}`
        }
      ]
    },
    action: {
      handler: 'skill-isc-handler'
    },
    governance: {
      auto_execute: false,
      source: 'intent-event-handler',
      derived_from_event: event.id || null
    },
    metadata: {
      intent_type: payload.intent_type || 'RULEIFY',
      target,
      confidence: payload.confidence ?? null,
      source_file: payload.source_file || null,
      evidence: payload.evidence || null,
      created_at: new Date().toISOString()
    }
  };

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(rule, null, 2) + '\n');
  return { created: true, exists: false, rule_id: ruleId, file: filePath };
}

function handleRuleify(event) {
  const draft = buildRuleDraft(event);
  return {
    status: 'ok',
    handler: 'intent-event-handler',
    action: 'ruleify',
    result: draft
  };
}

function handleReflect(event) {
  const bridge = getCRASBridge();
  const payload = event.payload || {};
  return {
    status: 'ok',
    handler: 'intent-event-handler',
    action: 'reflect',
    result: bridge.analyzeRequest({
      ...event,
      payload: {
        ...payload,
        type: 'system.error',
        source: 'intent.reflect',
        error: payload.summary || payload.evidence || payload.target || 'intent reflect',
        original_intent_type: payload.intent_type || 'REFLECT'
      }
    })
  };
}

function handleDirective(event) {
  const bridge = getDTOBridge();
  const payload = event.payload || {};
  return {
    status: 'ok',
    handler: 'intent-event-handler',
    action: 'directive',
    result: bridge.createTaskFromEvent({
      ...event,
      payload: {
        ...payload,
        task_name: payload.target || payload.summary || 'intent-directive-task',
        description: payload.summary || payload.evidence || 'Created from intent.directive'
      }
    })
  };
}

function handle(event) {
  const eventType = event.type || event.eventType || '';
  if (eventType === 'intent.ruleify') return handleRuleify(event);
  if (eventType === 'intent.reflect') return handleReflect(event);
  if (eventType === 'intent.directive') return handleDirective(event);

  return {
    status: 'skipped',
    handler: 'intent-event-handler',
    reason: `unsupported event type: ${eventType}`
  };
}

module.exports = handle;
module.exports.handle = handle;
