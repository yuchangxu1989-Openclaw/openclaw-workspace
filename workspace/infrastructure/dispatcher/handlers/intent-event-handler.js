'use strict';

/**
 * Intent Event Handler — 为 intent.ruleify / intent.reflect / intent.directive
 * 提供真实消费路径，避免停留在 no-route / 报告层。
 *
 * - intent.ruleify   → 生成 ISC 规则草案（最小可执行骨架）+ 发出 isc.rule.created
 * - intent.reflect   → 触发 CRAS 分析并沉淀洞察
 * - intent.directive → 在 本地任务编排 中创建任务
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = '/root/.openclaw/workspace';
const RULES_DIR = path.join(WORKSPACE, 'skills', 'isc-core', 'rules');
const REPORT_FILE = path.join(WORKSPACE, 'infrastructure', 'logs', 'intent-event-handler.jsonl');

let _dtoBridge = null;
let _crasBridge = null;
let _bus = null;

function getDTOBridge() {
  if (!_dtoBridge) {
    _dtoBridge = require(path.join(__dirname, '..', '..', '..', 'skills', 'lto-core', 'event-bridge.js'));
  }
  return _dtoBridge;
}

function getCRASBridge() {
  if (!_crasBridge) {
    _crasBridge = require(path.join(__dirname, '..', '..', '..', 'skills', 'cras', 'event-bridge.js'));
  }
  return _crasBridge;
}

function getBus() {
  if (!_bus) {
    _bus = require(path.join(__dirname, '..', '..', '..', 'infrastructure', 'event-bus', 'bus-adapter'));
  }
  return _bus;
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

function appendReport(entry) {
  ensureDir(path.dirname(REPORT_FILE));
  fs.appendFileSync(REPORT_FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

function normalizePayload(event) {
  const payload = event.payload || {};
  return {
    ...payload,
    intent_type: payload.intent_type || event.type?.split('.').pop()?.toUpperCase() || null,
    target: payload.target || payload.subject || payload.name || null,
    summary: payload.summary || payload.description || null,
    evidence: payload.evidence || payload.quote || null,
    confidence: payload.confidence ?? null,
    source_event_id: event.id || null,
    source_event_type: event.type || null,
    source_file: payload.source_file || null,
  };
}

function buildRuleDraft(event) {
  const payload = normalizePayload(event);
  const target = payload.target || 'intent-derived-policy';
  const summary = payload.summary || payload.evidence || 'Auto-generated from intent.ruleify';
  const ruleSlug = slugify(target);
  const hash = shortHash(`${target}::${summary}`);
  const ruleId = `rule.intent-${ruleSlug}-${hash}`;
  const fileName = `${ruleId}.json`;
  const filePath = path.join(RULES_DIR, fileName);

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
      confidence: payload.confidence,
      source_file: payload.source_file,
      evidence: payload.evidence,
      created_at: new Date().toISOString()
    }
  };

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(rule, null, 2) + '\n');
  return { created: true, exists: false, rule_id: ruleId, file: filePath };
}

function handleRuleify(event) {
  const draft = buildRuleDraft(event);
  if (draft.created) {
    getBus().emit('isc.rule.created', {
      rule_id: draft.rule_id,
      file: path.basename(draft.file),
      path: draft.file,
      source_event: event.id || null,
      source_type: event.type || null,
    }, 'intent-event-handler');
  }

  const result = {
    status: 'ok',
    handler: 'intent-event-handler',
    action: 'ruleify',
    result: draft
  };
  appendReport({ eventType: event.type, action: 'ruleify', result: draft });
  return result;
}

function handleReflect(event) {
  const payload = normalizePayload(event);
  const result = getCRASBridge().analyzeRequest({
    ...event,
    payload: {
      ...payload,
      type: 'system.error',
      source: 'intent.reflect',
      error: payload.summary || payload.evidence || payload.target || 'intent reflect',
      original_intent_type: payload.intent_type || 'REFLECT'
    }
  });

  const wrapped = {
    status: 'ok',
    handler: 'intent-event-handler',
    action: 'reflect',
    result
  };
  appendReport({ eventType: event.type, action: 'reflect', insight: result?.insight?.id || null });
  return wrapped;
}

function handleDirective(event) {
  const payload = normalizePayload(event);
  const result = getDTOBridge().createTaskFromEvent({
    ...event,
    payload: {
      ...payload,
      task_name: payload.target || payload.summary || 'intent-directive-task',
      description: payload.summary || payload.evidence || 'Created from intent.directive'
    }
  });

  const wrapped = {
    status: 'ok',
    handler: 'intent-event-handler',
    action: 'directive',
    result
  };
  appendReport({ eventType: event.type, action: 'directive', task_id: result?.task_id || null });
  return wrapped;
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
module.exports.handleRuleify = handleRuleify;
module.exports.handleReflect = handleReflect;
module.exports.handleDirective = handleDirective;
module.exports.buildRuleDraft = buildRuleDraft;
