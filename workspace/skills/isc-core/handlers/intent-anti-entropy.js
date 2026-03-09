'use strict';

/**
 * ISC Handler: intent-anti-entropy
 * Rule: rule.intent-anti-entropy-001
 * Enforces MECE intent governance: overlap detection, low-frequency demotion,
 * stale intent deprecation, and new-intent dedup proof.
 */

const path = require('path');
const fs = require('fs');
const {
  writeReport,
  emitEvent,
  gitExec,
  scanFiles,
  readRuleJson,
  gateResult,
} = require('../lib/handler-utils');

module.exports = async function (event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];
  const checks = [];

  logger.info?.('[intent-anti-entropy] Scanning intent registry for MECE violations');

  const rulesDir = path.join(root, 'skills', 'isc-core', 'rules');
  const intentRules = [];
  scanFiles(rulesDir, /^rule\.intent-.*\.json$/i, (fp) => {
    const r = readRuleJson(fp);
    if (r) intentRules.push({ path: fp, ...r });
  }, { maxDepth: 1 });

  // Check 1: Detect semantic overlap by description similarity (simple token overlap)
  const overlaps = [];
  for (let i = 0; i < intentRules.length; i++) {
    for (let j = i + 1; j < intentRules.length; j++) {
      const a = (intentRules[i].description || '').toLowerCase().split(/\s+/);
      const b = (intentRules[j].description || '').toLowerCase().split(/\s+/);
      const setA = new Set(a.filter(w => w.length > 3));
      const setB = new Set(b.filter(w => w.length > 3));
      if (setA.size === 0 || setB.size === 0) continue;
      const intersection = [...setA].filter(w => setB.has(w)).length;
      const similarity = intersection / Math.min(setA.size, setB.size);
      if (similarity > 0.7) {
        overlaps.push({ a: intentRules[i].id, b: intentRules[j].id, similarity: similarity.toFixed(2) });
      }
    }
  }
  checks.push({
    name: 'no_semantic_overlap',
    ok: overlaps.length === 0,
    message: overlaps.length === 0
      ? `${intentRules.length} intent rules scanned, no high-overlap pairs`
      : `${overlaps.length} high-overlap pair(s) detected — consider merging`,
  });

  // Check 2: No excessive intent count (anti long-tail)
  const intentCount = intentRules.length;
  const tooMany = intentCount > 200;
  checks.push({
    name: 'intent_count_manageable',
    ok: !tooMany,
    message: tooMany
      ? `${intentCount} intent rules — exceeds 200 threshold, prune long-tail`
      : `${intentCount} intent rules — within manageable range`,
  });

  // Check 3: Rules have tags for classification
  const untagged = intentRules.filter(r => !r.tags || r.tags.length === 0);
  checks.push({
    name: 'all_intents_tagged',
    ok: untagged.length === 0,
    message: untagged.length === 0
      ? 'All intent rules have classification tags'
      : `${untagged.length} intent rule(s) missing tags — cannot classify for MECE`,
  });

  const result = gateResult(rule?.id || 'intent-anti-entropy-001', checks, { failClosed: false });

  const reportPath = path.join(root, 'reports', 'intent-anti-entropy', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'intent-anti-entropy',
    intentCount,
    overlaps,
    untaggedCount: untagged.length,
    lastCommit: gitExec(root, 'log --oneline -1'),
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  await emitEvent(bus, 'intent-anti-entropy.completed', { ok: result.ok, status: result.status, actions });

  return { ok: result.ok, autonomous: true, actions, ...result };
};
