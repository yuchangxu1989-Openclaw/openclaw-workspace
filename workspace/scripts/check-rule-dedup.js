#!/usr/bin/env node
/**
 * check-rule-dedup.js — Pre-commit ISC规则去重检查（快速模式）
 * 
 * 在pre-commit环境中运行，只做event快筛，不调LLM（避免阻塞提交）。
 * 发现event交集 >80% 时输出警告，发现完全相同ID时阻止。
 * 
 * Usage: node check-rule-dedup.js <rule_file.json> [--rules-dir <dir>]
 * Exit 0 = OK (通过或仅有警告)
 * Exit 1 = 阻止（发现相同ID或完全重复）
 * Exit 2 = 参数错误
 */
'use strict';

const fs = require('fs');
const path = require('path');

const WS = path.resolve(__dirname, '..');
const DEFAULT_RULES_DIR = path.join(WS, 'skills/isc-core/rules');

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { file: null, rulesDir: DEFAULT_RULES_DIR, verbose: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--rules-dir' && args[i + 1]) opts.rulesDir = path.resolve(args[++i]);
    else if (args[i] === '--verbose' || args[i] === '-v') opts.verbose = true;
    else if (!args[i].startsWith('--')) opts.file = path.resolve(args[i]);
  }
  return opts;
}

function extractEvents(rule) {
  const events = new Set();
  const te = rule?.trigger?.events;
  if (te) {
    if (Array.isArray(te)) te.forEach(e => events.add(String(e)));
    else if (typeof te === 'object') Object.values(te).flat().forEach(e => events.add(String(e)));
  }
  const tc = rule?.trigger?.conditions;
  if (Array.isArray(tc)) tc.forEach(c => { if (c.event_name) events.add(String(c.event_name)); });
  const ate = rule?.auto_trigger?.on_events;
  if (Array.isArray(ate)) ate.forEach(e => events.add(String(e)));
  const ta = rule?.trigger?.actions;
  if (Array.isArray(ta)) ta.forEach(a => { if (typeof a === 'string') events.add(a); });
  return [...events];
}

function eventOverlap(eventsA, eventsB) {
  if (!eventsA.length || !eventsB.length) return 0;
  const setA = new Set(eventsA);
  const setB = new Set(eventsB);
  const intersection = [...setA].filter(e => setB.has(e));
  const union = new Set([...setA, ...setB]);
  return intersection.length / union.size;
}

function main() {
  const opts = parseArgs(process.argv);

  if (!opts.file) {
    console.error('[DEDUP] 用法: node check-rule-dedup.js <rule_file.json>');
    process.exit(2);
  }
  if (!fs.existsSync(opts.file)) {
    console.error(`[DEDUP] 文件不存在: ${opts.file}`);
    process.exit(2);
  }
  if (!fs.existsSync(opts.rulesDir)) {
    // 规则目录不存在，放行
    console.log('[DEDUP] ⚠  规则目录不存在，跳过去重检查');
    process.exit(0);
  }

  let newRule;
  try {
    newRule = JSON.parse(fs.readFileSync(opts.file, 'utf8'));
  } catch (e) {
    console.error(`[DEDUP] ❌ JSON解析失败: ${e.message}`);
    process.exit(2);
  }

  const newId = newRule.id || newRule.rule_id || '';
  const newEvents = extractEvents(newRule);
  const newFile = path.resolve(opts.file);

  const errors = [];
  const warnings = [];

  // 扫描所有已有规则
  const existingFiles = fs.readdirSync(opts.rulesDir)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .map(f => path.join(opts.rulesDir, f))
    .filter(f => path.resolve(f) !== newFile);

  for (const f of existingFiles) {
    let rule;
    try {
      rule = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (_) { continue; }

    const existingId = rule.id || rule.rule_id || '';

    // 完全相同ID = 硬阻止（除非是修改同一文件）
    if (newId && existingId && newId === existingId) {
      errors.push(`[DEDUP-ID] 规则ID "${newId}" 已存在于 ${path.basename(f)}，不能重复创建`);
      continue;
    }

    // Event重叠检测
    const existingEvents = extractEvents(rule);
    const overlap = eventOverlap(newEvents, existingEvents);

    if (overlap >= 0.8) {
      warnings.push(`[DEDUP-EVENT] 与 ${path.basename(f)} event重叠 ${(overlap*100).toFixed(0)}%，建议人工确认是否重复`);
    } else if (overlap >= 0.5 && opts.verbose) {
      console.log(`  [DEDUP] ℹ️  与 ${path.basename(f)} event重叠 ${(overlap*100).toFixed(0)}%（低风险）`);
    }
  }

  if (warnings.length) {
    warnings.forEach(w => console.log(`  ⚠️  ${w}`));
  }

  if (errors.length) {
    errors.forEach(e => console.log(`  🚫 ${e}`));
    process.exit(1);
  }

  process.exit(0);
}

main();
