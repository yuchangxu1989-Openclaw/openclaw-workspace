'use strict';
const fs = require('fs');
const path = require('path');

const LAYERS = ['L1', 'L2', 'L3', 'L4', 'L5'];

const RULES = {
  L1: [/\b(create|created|modify|modified|update|updated|delete|deleted|remove|removed)\b/i, /\b(lifecycle|object|entity|record)\b/i],
  L2: [/\b(threshold|limit|quota|counter|count|exceed|spike|peak|rate)\b/i, /\b(metric|latency|error_rate|qps|rps)\b/i],
  L3: [/\b(intent|semantic|dialog|conversation|utterance|routing)\b/i, /\b(intent_scanner|intent_dispatch|user_message)\b/i],
  L4: [/\b(discovery|insight|knowledge|research|learning|academic|public|web)\b/i, /\b(novel|finding|incremental)\b/i],
  L5: [/\b(pattern|recurring|repeat|systemic|regression|repair|rework|loop)\b/i, /\b(root_cause|rca|postmortem|anti-pattern)\b/i]
};

class Registry {
  constructor() { this.store = new Map(); }
  register(type, layer, meta = {}) {
    if (!type || !LAYERS.includes(layer)) throw new Error(`invalid register: ${type} ${layer}`);
    const item = { type, layer, meta, at: new Date().toISOString() };
    this.store.set(type, item);
    return item;
  }
  get(type) { return this.store.get(type) || null; }
  list() { return [...this.store.values()]; }
}

const registry = new Registry();

function classifyEventType(type = '') {
  const t = String(type || '').trim();
  if (!t) return { layer: 'L3', confidence: 0.2, reason: 'empty-default' };
  const reg = registry.get(t);
  if (reg) return { layer: reg.layer, confidence: 1, reason: 'registry' };

  let best = { layer: 'L3', score: 0 };
  for (const layer of LAYERS) {
    const score = (RULES[layer] || []).reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);
    if (score > best.score) best = { layer, score };
  }
  return { layer: best.layer, confidence: best.score > 0 ? Math.min(0.95, 0.5 + best.score * 0.2) : 0.4, reason: best.score > 0 ? 'rule-match' : 'fallback' };
}

function parseJsonl(eventsFile) {
  const fp = path.resolve(eventsFile);
  if (!fs.existsSync(fp)) return [];
  return fs.readFileSync(fp, 'utf8').split('\n').map(s => s.trim()).filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
}

function coverageCheck(events = []) {
  const counts = { L1: 0, L2: 0, L3: 0, L4: 0, L5: 0 };
  const typeCounts = new Map();
  for (const ev of events) {
    const type = ev.type || ev.eventType || ev.name || 'unknown';
    const { layer } = classifyEventType(type);
    counts[layer] += 1;
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  }
  const total = Object.values(counts).reduce((a,b)=>a+b,0);
  const ratio = Object.fromEntries(LAYERS.map(l => [l, total ? Number((counts[l]/total).toFixed(4)) : 0]));
  return { total, counts, ratio, typeCounts: [...typeCounts.entries()] };
}

function generateHealthReport({ eventsFile = 'infrastructure/event-bus/events.jsonl', events } = {}) {
  const list = Array.isArray(events) ? events : parseJsonl(eventsFile);
  const cov = coverageCheck(list);
  const alerts = [];
  for (const l of LAYERS) if (cov.counts[l] === 0) alerts.push({ level: 'medium', code: 'BLANK_LAYER', message: `${l} 层0事件` });

  const dominant = Object.entries(cov.ratio).sort((a,b)=>b[1]-a[1])[0];
  if (dominant && dominant[1] >= 0.7 && cov.total >= 20) alerts.push({ level: 'medium', code: 'DISTRIBUTION_SKEW', message: `${dominant[0]} 占比 ${(dominant[1]*100).toFixed(1)}%` });

  const top = [...cov.typeCounts].sort((a,b)=>b[1]-a[1])[0];
  if (top && cov.total && top[1]/cov.total >= 0.5 && top[1] >= 20) alerts.push({ level: 'high', code: 'EVENT_STORM', message: `事件风暴 ${top[0]} ${(top[1]/cov.total*100).toFixed(1)}%` });

  return {
    model: 'five-layer-event-model',
    generatedAt: new Date().toISOString(),
    source: Array.isArray(events) ? 'inline-events' : path.resolve(eventsFile),
    totalEvents: cov.total,
    distribution: cov.counts,
    ratio: cov.ratio,
    topTypes: cov.typeCounts.sort((a,b)=>b[1]-a[1]).slice(0,10),
    alerts,
    healthy: alerts.length === 0
  };
}

module.exports = {
  LAYERS,
  registry,
  registerEventType: (type, layer, meta) => registry.register(type, layer, meta),
  classifyEventType,
  coverageCheck,
  generateHealthReport
};
