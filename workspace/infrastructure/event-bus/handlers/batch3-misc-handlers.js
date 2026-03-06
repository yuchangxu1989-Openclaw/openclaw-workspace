const fs = require('fs');
const path = require('path');

const WORKSPACE = '/root/.openclaw/workspace';
const LOG_DIR = path.join(WORKSPACE, 'infrastructure', 'logs');

function appendLog(name, data) {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(path.join(LOG_DIR, `${name}.jsonl`), JSON.stringify({ timestamp: new Date().toISOString(), ...data }) + '\n');
}

function passFail(issues) {
  return issues.length === 0 ? 'pass' : 'block';
}

async function genericCheck(event, rule, checkerName, fn) {
  const payload = event.payload || {};
  const out = fn(payload, event, rule);
  const result = out.result || passFail(out.issues || []);
  appendLog(checkerName, { handler: checkerName, eventType: event.type, ruleId: rule.id, result, ...out });
  return { success: result !== 'block', result, ...out };
}

module.exports.intentTypeConvergenceHandler = async (event, rule, context) =>
  genericCheck(event, rule, 'intent-type-convergence', (p) => {
    const allowed = ['emotion_polarity', 'rule_trigger', 'complex', 'implicit', 'multi_intent_single_sentence'];
    const requested = p.intentType || p.intent_type || '';
    const canonical = p.canonicalType || p.canonical_type || requested;
    const issues = [];
    if (!requested) issues.push('missing_intent_type');
    if (canonical && !allowed.includes(canonical)) issues.push(`unsupported_type:${canonical}`);
    return { issues, details: issues.length ? `意图类型未收敛: ${issues.join(',')}` : '意图类型收敛检查通过', allowed, requested, canonical };
  });

module.exports.intentUnknownDiscoveryHandler = async (event, rule, context) =>
  genericCheck(event, rule, 'intent-unknown-discovery', (p) => {
    const text = (p.text || p.query || '').trim();
    const confidence = Number(p.intentConfidence ?? p.confidence ?? 0);
    const unknown = !p.intent || confidence < 0.55;
    const discovered = unknown ? { unknownIntent: true, hint: text.slice(0, 120), confidence } : { unknownIntent: false };
    return { result: 'pass', details: unknown ? '发现未知意图并标注候选' : '未发现未知意图', discovered };
  });

module.exports.semanticIntentEventHandler = async (event, rule, context) =>
  genericCheck(event, rule, 'semantic-intent-event', (p) => {
    const hasIntent = !!(p.intent || p.semanticIntent);
    const hasEvent = !!(p.sourceEvent || p.eventRef || event.type);
    const issues = [];
    if (!hasIntent) issues.push('missing_semantic_intent');
    if (!hasEvent) issues.push('missing_source_event');
    return { issues, details: issues.length ? '语义意图事件结构不完整' : '语义意图事件结构完整' };
  });
