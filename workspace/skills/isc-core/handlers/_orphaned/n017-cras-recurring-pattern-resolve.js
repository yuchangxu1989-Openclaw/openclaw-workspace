#!/usr/bin/env node
/**
 * ISC Handler: N017 CRAS Recurring Pattern Auto-Resolve
 * CRAS重复模式自动解决 — 同一问题模式≥2次时主动根因分析并自动解决。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { scanFiles, writeReport, gateResult } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');
const RECURRENCE_THRESHOLD = parseInt(process.env.ISC_RECURRENCE_THRESHOLD || '2', 10);

/**
 * 从 CRAS 日志目录收集模式签名并统计频次
 */
function collectPatterns(crasDir) {
  const patternMap = new Map(); // signature -> { count, examples[] }

  if (!fs.existsSync(crasDir)) return patternMap;

  const logFiles = scanFiles(crasDir, /\.(json|jsonl)$/, null, { maxDepth: 2 });
  for (const f of logFiles) {
    try {
      const raw = fs.readFileSync(f, 'utf8');
      const lines = raw.includes('\n') ? raw.split('\n').filter(Boolean) : [raw];
      for (const line of lines) {
        const entry = JSON.parse(line);
        const sig = entry.pattern_signature || entry.error_type || entry.category || null;
        if (!sig) continue;
        if (!patternMap.has(sig)) {
          patternMap.set(sig, { count: 0, examples: [] });
        }
        const rec = patternMap.get(sig);
        rec.count++;
        if (rec.examples.length < 3) {
          rec.examples.push({ file: f, message: entry.message || entry.description || '' });
        }
      }
    } catch { /* skip */ }
  }
  return patternMap;
}

/**
 * 生成根因分析摘要
 */
function generateRootCauseSummary(sig, record) {
  return {
    pattern: sig,
    occurrences: record.count,
    examples: record.examples,
    suggested_action: record.count >= 5 ? 'escalate_to_rule' : 'auto_resolve',
    resolution: 'Pattern documented; trigger auto-resolve workflow',
  };
}

function main() {
  const checks = [];
  const crasDir = path.join(WORKSPACE, 'skills', 'cras', 'logs');
  const altCrasDir = path.join(WORKSPACE, 'reports', 'cras');

  const patterns = collectPatterns(crasDir);
  // Also check alternative directory
  const altPatterns = collectPatterns(altCrasDir);
  for (const [sig, rec] of altPatterns) {
    if (patterns.has(sig)) {
      patterns.get(sig).count += rec.count;
      patterns.get(sig).examples.push(...rec.examples);
    } else {
      patterns.set(sig, rec);
    }
  }

  const recurring = [];
  for (const [sig, rec] of patterns) {
    if (rec.count >= RECURRENCE_THRESHOLD) {
      recurring.push(generateRootCauseSummary(sig, rec));
    }
  }

  checks.push({
    name: 'pattern-scan',
    ok: true,
    message: `Scanned ${patterns.size} unique pattern(s), ${recurring.length} recurring`,
  });

  if (recurring.length === 0) {
    checks.push({ name: 'no-recurring', ok: true, message: 'No recurring patterns above threshold' });
  } else {
    for (const r of recurring) {
      checks.push({
        name: `pattern:${r.pattern}`,
        ok: r.suggested_action !== 'escalate_to_rule',
        message: `${r.occurrences} occurrences — ${r.suggested_action}`,
      });
    }
  }

  const result = gateResult('n017-cras-recurring-pattern-resolve', checks, { failClosed: false });

  const reportData = { ...result, recurring_patterns: recurring };
  const reportPath = path.join(WORKSPACE, 'reports', 'isc', `n017-cras-patterns-${Date.now()}.json`);
  writeReport(reportPath, reportData);

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.exitCode);
}

main();
