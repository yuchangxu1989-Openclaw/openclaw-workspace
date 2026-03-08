'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WORKSPACE } = require('../shared/paths');

const STORE_DIR = path.join(WORKSPACE, 'memory', 'global-autonomy');
const CANDIDATES_FILE = path.join(STORE_DIR, 'concept-candidates.jsonl');
const BADCASE_FILE = path.join(STORE_DIR, 'concept-badcases.jsonl');
const REGISTRY_FILE = path.join(STORE_DIR, 'concept-registry.json');
const DECISION_FILE = path.join(STORE_DIR, 'decision-snapshot.json');
const DEFAULT_DEADLINE_MS = 15000;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function ensureStore() {
  ensureDir(STORE_DIR);
  if (!fs.existsSync(CANDIDATES_FILE)) fs.writeFileSync(CANDIDATES_FILE, '', 'utf8');
  if (!fs.existsSync(BADCASE_FILE)) fs.writeFileSync(BADCASE_FILE, '', 'utf8');
  if (!fs.existsSync(REGISTRY_FILE)) fs.writeFileSync(REGISTRY_FILE, JSON.stringify({ concepts: {}, updated_at: null }, null, 2) + '\n', 'utf8');
  if (!fs.existsSync(DECISION_FILE)) fs.writeFileSync(DECISION_FILE, JSON.stringify({ available_concepts: [], updated_at: null }, null, 2) + '\n', 'utf8');
}

function safeParseJson(line) {
  try { return JSON.parse(line); } catch { return null; }
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').map(s => s.trim()).filter(Boolean).map(safeParseJson).filter(Boolean);
}

function readRegistry() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
  } catch {
    return { concepts: {}, updated_at: null };
  }
}

function writeRegistry(data) {
  ensureStore();
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function writeDecisionSnapshot(registry) {
  const concepts = Object.values(registry?.concepts || {}).sort((a, b) => String(a.label).localeCompare(String(b.label), 'zh-CN'));
  const snapshot = {
    updated_at: new Date().toISOString(),
    available_concepts: concepts.map(c => ({
      key: c.key,
      label: c.label,
      kind: c.kind,
      first_seen_at: c.first_seen_at,
      admitted_at: c.admitted_at,
      source: c.source,
      status: c.status || 'candidate',
    })),
  };
  fs.writeFileSync(DECISION_FILE, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  return snapshot;
}

function normalizeConceptLabel(label) {
  return String(label || '')
    .trim()
    .replace(/[，。！？、；：,.!?;:()（）\[\]{}"'“”‘’]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function conceptKey(kind, label) {
  const normalized = normalizeConceptLabel(label).toLowerCase();
  const hash = crypto.createHash('sha1').update(`${kind}::${normalized}`).digest('hex').slice(0, 12);
  return `${kind}_${hash}`;
}

function extractConcepts(text) {
  const input = String(text || '').trim();
  if (!input) return [];
  const results = [];
  const seen = new Set();
  const patterns = [
    { kind: 'keyword', regex: /(?:关键词|关键字|概念|术语)[:：]\s*([^，。；;\n]+)/g },
    { kind: 'event', regex: /(?:事件|事故|异常|发布|上线|故障)[:：]\s*([^，。；;\n]+)/g },
    { kind: 'intent', regex: /(?:意图|目标|诉求|需求)[:：]\s*([^，。；;\n]+)/g },
  ];
  for (const { kind, regex } of patterns) {
    let match;
    while ((match = regex.exec(input))) {
      const label = normalizeConceptLabel(match[1]);
      if (!label || label.length < 2) continue;
      const key = conceptKey(kind, label);
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ kind, label, key, source: 'explicit_pattern' });
    }
  }

  const quoted = input.match(/["“”'‘’《》【】\[]([^"“”'‘’《》【】\]]{2,40})["“”'‘’》】\]]/g) || [];
  for (const raw of quoted) {
    const label = normalizeConceptLabel(raw.slice(1, -1));
    if (!label || label.length < 2) continue;
    const key = conceptKey('keyword', label);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ kind: 'keyword', label, key, source: 'quoted' });
  }

  const mixedTokens = input.match(/[A-Za-z][A-Za-z0-9._-]{2,}|[\u4e00-\u9fa5]{2,16}/g) || [];
  for (const token of mixedTokens) {
    const label = normalizeConceptLabel(token);
    if (!label || label.length < 2) continue;
    if (/^(请问|帮我|我们|你们|这个|那个|什么|怎么|为什么|一下|一下子|需要|进行|实现|如果|必须|自动|纳入|候选集)$/.test(label)) continue;
    const key = conceptKey('keyword', label);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ kind: 'keyword', label, key, source: 'token_fallback' });
    if (results.length >= 12) break;
  }

  return results.slice(0, 12);
}

function admitConcepts({ text, context = {}, source = 'intent-inline-hook', detectedAt = Date.now(), deadlineMs = DEFAULT_DEADLINE_MS }) {
  ensureStore();
  const concepts = extractConcepts(text);
  const registry = readRegistry();
  registry.concepts = registry.concepts || {};
  const nowIso = new Date(detectedAt).toISOString();
  const admitted = [];
  const alreadyKnown = [];
  const badcases = [];

  for (const concept of concepts) {
    const existing = registry.concepts[concept.key];
    if (existing) {
      alreadyKnown.push(existing);
      continue;
    }
    const admittedAt = Date.now();
    const latencyMs = admittedAt - detectedAt;
    const record = {
      ...concept,
      source,
      session_id: context.session_id || context.sessionId || 'unknown',
      channel: context.channel || 'unknown',
      detected_at: nowIso,
      admitted_at: new Date(admittedAt).toISOString(),
      latency_ms: latencyMs,
      deadline_ms: deadlineMs,
      status: latencyMs > deadlineMs ? 'badcase' : 'candidate',
      source_text: String(text || '').slice(0, 300),
    };
    registry.concepts[concept.key] = record;
    fs.appendFileSync(CANDIDATES_FILE, JSON.stringify(record) + '\n', 'utf8');
    admitted.push(record);
    if (latencyMs > deadlineMs) {
      const badcase = {
        type: 'concept_admission_timeout',
        key: concept.key,
        label: concept.label,
        kind: concept.kind,
        detected_at: nowIso,
        admitted_at: record.admitted_at,
        latency_ms: latencyMs,
        deadline_ms: deadlineMs,
        session_id: record.session_id,
      };
      badcases.push(badcase);
      fs.appendFileSync(BADCASE_FILE, JSON.stringify(badcase) + '\n', 'utf8');
    }
  }

  registry.updated_at = new Date().toISOString();
  writeRegistry(registry);
  const decisionSnapshot = writeDecisionSnapshot(registry);

  return {
    detected_count: concepts.length,
    admitted,
    already_known: alreadyKnown,
    badcases,
    decision_snapshot: decisionSnapshot,
  };
}

function getDecisionSnapshot() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(DECISION_FILE, 'utf8'));
  } catch {
    const registry = readRegistry();
    return writeDecisionSnapshot(registry);
  }
}

function getRecentBadcases(limit = 20) {
  return readJsonl(BADCASE_FILE).slice(-limit);
}

module.exports = {
  DEFAULT_DEADLINE_MS,
  extractConcepts,
  admitConcepts,
  getDecisionSnapshot,
  getRecentBadcases,
  _paths: {
    STORE_DIR,
    CANDIDATES_FILE,
    BADCASE_FILE,
    REGISTRY_FILE,
    DECISION_FILE,
  },
};
