#!/usr/bin/env node
/**
 * check-rule-dedup.js — ISC规则去重检查（Phase 1快筛 + Phase 2语义深检）
 * 
 * Phase 1: event交集快筛（pre-commit用）
 * Phase 2: LLM语义三维判断（意图/事件链/执行效果）
 * 
 * Usage:
 *   node check-rule-dedup.js <rule_file.json> [--rules-dir <dir>] [--quick|--deep] [--verbose]
 *   node check-rule-dedup.js --scan-all [--rules-dir <dir>] [--deep]
 * 
 * Modes:
 *   --quick     只跑Phase 1（默认，pre-commit用）
 *   --deep      Phase 1 + Phase 2（创建规则时用）
 *   --scan-all  扫描所有规则两两比对，输出重复报告
 * 
 * Exit 0 = OK | Exit 1 = 阻止（发现重复） | Exit 2 = 参数错误
 */
'use strict';

const fs = require('fs');
const path = require('path');

const WS = path.resolve(__dirname, '..');
const DEFAULT_RULES_DIR = path.join(WS, 'skills/isc-core/rules');

// ─── Args ───────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    file: null,
    rulesDir: DEFAULT_RULES_DIR,
    verbose: false,
    mode: 'quick',  // quick | deep
    scanAll: false,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--rules-dir' && args[i + 1]) opts.rulesDir = path.resolve(args[++i]);
    else if (args[i] === '--verbose' || args[i] === '-v') opts.verbose = true;
    else if (args[i] === '--quick') opts.mode = 'quick';
    else if (args[i] === '--deep') opts.mode = 'deep';
    else if (args[i] === '--scan-all') opts.scanAll = true;
    else if (!args[i].startsWith('--')) opts.file = path.resolve(args[i]);
  }
  return opts;
}

// ─── Phase 1: Event extraction & overlap ────────────────────────────────────

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

// ─── Phase 2: Semantic deep check ──────────────────────────────────────────

const PHASE2_PROMPT = `你是ISC规则去重判官。给你两条规则的完整定义，请判断它们是否实质性重复。

规则A：{rule_a_json}
规则B：{rule_b_json}

请分三个维度判断：
1. 意图等价：两条规则想解决的问题是否相同？
2. 事件链等价：监听的事件和产出的action是否形成相同的因果链？
3. 执行效果等价：最终对系统的影响是否相同？

严格输出JSON（不要额外文字）：{"duplicate": bool, "intent_equivalent": bool, "event_chain_equivalent": bool, "execution_equivalent": bool, "reason": "..."}`;

// ─── LLM via infrastructure/llm-context (no direct HTTP calls) ──────

const llmContext = require(path.join(WS, 'infrastructure/llm-context'));

/**
 * Fallback: field-exact comparison when LLM unavailable
 */
function fallbackDeepCheck(ruleA, ruleB) {
  const intentEq = (ruleA.description || '') === (ruleB.description || '') &&
                   (ruleA.name || '') === (ruleB.name || '');
  
  const eventsA = extractEvents(ruleA).sort().join(',');
  const eventsB = extractEvents(ruleB).sort().join(',');
  const eventChainEq = eventsA === eventsB;
  
  const handlerA = ruleA?.action?.handler || ruleA?.action?.type || '';
  const handlerB = ruleB?.action?.handler || ruleB?.action?.type || '';
  const condA = JSON.stringify(ruleA?.conditions || ruleA?.trigger?.conditions || '');
  const condB = JSON.stringify(ruleB?.conditions || ruleB?.trigger?.conditions || '');
  const executionEq = handlerA === handlerB && condA === condB;

  const duplicate = intentEq && eventChainEq && executionEq;
  return {
    duplicate,
    intent_equivalent: intentEq,
    event_chain_equivalent: eventChainEq,
    execution_equivalent: executionEq,
    reason: duplicate ? '字段精确比对：三维度完全相同' : '字段精确比对：至少一个维度不同',
    method: 'fallback',
  };
}

/**
 * LLM semantic dedup — all routing handled by llm-context
 */

async function phase2Check(ruleA, ruleB) {
  const prompt = PHASE2_PROMPT
    .replace('{rule_a_json}', JSON.stringify(ruleA, null, 2))
    .replace('{rule_b_json}', JSON.stringify(ruleB, null, 2));

  try {
    const result = await llmContext.chat(
      [{ role: 'user', content: prompt }],
      { capability: 'chat', priority: 'cost', temperature: 0.1, timeout: 15000 }
    );
    const text = result.content || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in LLM response');
    const parsed = JSON.parse(match[0]);
    parsed.method = `${result.provider}/${result.model}`;
    return parsed;
  } catch (e) {
    // All LLM failed, fallback to field comparison
    const fb = fallbackDeepCheck(ruleA, ruleB);
    fb.llm_errors = [e.message];
    fb.warning = 'LLM_FAILED — 降级到字段比对，结果可能不准确';
    return fb;
  }
}

// ─── Load rules ─────────────────────────────────────────────────────────────

function loadRulesFromDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .map(f => {
      try {
        const rule = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        rule.__file = f;
        return rule;
      } catch (_) { return null; }
    })
    .filter(Boolean);
}

// ─── Main: single file check ───────────────────────────────────────────────

async function checkSingleFile(opts) {
  if (!opts.file) {
    console.error('[DEDUP] 用法: node check-rule-dedup.js <rule_file.json>');
    process.exit(2);
  }
  if (!fs.existsSync(opts.file)) {
    console.error(`[DEDUP] 文件不存在: ${opts.file}`);
    process.exit(2);
  }
  if (!fs.existsSync(opts.rulesDir)) {
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

  const existingFiles = fs.readdirSync(opts.rulesDir)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .map(f => path.join(opts.rulesDir, f))
    .filter(f => path.resolve(f) !== newFile);

  

  for (const f of existingFiles) {
    let rule;
    try { rule = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { continue; }

    const existingId = rule.id || rule.rule_id || '';

    // Same ID = hard block
    if (newId && existingId && newId === existingId) {
      errors.push(`[DEDUP-ID] 规则ID "${newId}" 已存在于 ${path.basename(f)}，不能重复创建`);
      continue;
    }

    // Phase 1: Event overlap
    const existingEvents = extractEvents(rule);
    const overlap = eventOverlap(newEvents, existingEvents);

    if (overlap < 0.5) {
      if (opts.verbose && overlap > 0) {
        console.log(`  [DEDUP] ℹ️  与 ${path.basename(f)} event重叠 ${(overlap*100).toFixed(0)}%（低风险）`);
      }
      continue;  // Phase 1 pass → no duplicate
    }

    // overlap >= 50% → Phase 2 if deep mode
    if (opts.mode === 'deep') {
      const result = await phase2Check(newRule, rule);
      if (result.duplicate) {
        errors.push(`[DEDUP-SEMANTIC] 与 ${path.basename(f)} 语义重复（${result.reason}）`);
        console.log(`  📊 三维分析: 意图=${result.intent_equivalent} 事件链=${result.event_chain_equivalent} 执行=${result.execution_equivalent}`);
      } else {
        warnings.push(`[DEDUP-EVENT] 与 ${path.basename(f)} event重叠 ${(overlap*100).toFixed(0)}% 但语义不同（${result.reason}）`);
      }
    } else {
      // Quick mode: just warn on high overlap
      if (overlap >= 0.8) {
        warnings.push(`[DEDUP-EVENT] 与 ${path.basename(f)} event重叠 ${(overlap*100).toFixed(0)}%，建议人工确认是否重复`);
      } else if (opts.verbose) {
        console.log(`  [DEDUP] ℹ️  与 ${path.basename(f)} event重叠 ${(overlap*100).toFixed(0)}%（低风险）`);
      }
    }
  }

  if (warnings.length) warnings.forEach(w => console.log(`  ⚠️  ${w}`));
  if (errors.length) {
    errors.forEach(e => console.log(`  🚫 ${e}`));
    process.exit(1);
  }
  process.exit(0);
}

// ─── Main: scan-all ─────────────────────────────────────────────────────────

async function scanAll(opts) {
  if (!fs.existsSync(opts.rulesDir)) {
    console.error('[DEDUP] 规则目录不存在:', opts.rulesDir);
    process.exit(2);
  }

  const rules = loadRulesFromDir(opts.rulesDir);
  console.log(`[DEDUP] 扫描 ${rules.length} 条规则...`);

  
  const pairs = [];

  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const evA = extractEvents(rules[i]);
      const evB = extractEvents(rules[j]);
      const overlap = eventOverlap(evA, evB);
      if (overlap < 0.5) continue;

      const pair = {
        ruleA: rules[i].__file,
        ruleB: rules[j].__file,
        eventOverlap: overlap,
      };

      if (opts.mode === 'deep') {
        pair.phase2 = await phase2Check(rules[i], rules[j]);
      }
      pairs.push(pair);
    }
  }

  if (!pairs.length) {
    console.log('[DEDUP] ✅ 未发现高重叠规则对');
    process.exit(0);
  }

  console.log(`\n[DEDUP] 发现 ${pairs.length} 对高重叠规则：\n`);
  for (const p of pairs) {
    const dup = p.phase2?.duplicate ? '🚫 DUPLICATE' : '⚠️  HIGH_OVERLAP';
    console.log(`${dup}  ${p.ruleA} ↔ ${p.ruleB}  (event overlap: ${(p.eventOverlap*100).toFixed(0)}%)`);
    if (p.phase2) {
      console.log(`   意图=${p.phase2.intent_equivalent} 事件链=${p.phase2.event_chain_equivalent} 执行=${p.phase2.execution_equivalent}`);
      console.log(`   原因: ${p.phase2.reason}`);
    }
  }

  const dupes = pairs.filter(p => p.phase2?.duplicate);
  if (dupes.length) {
    console.log(`\n[DEDUP] 🚫 发现 ${dupes.length} 对语义重复规则`);
    process.exit(1);
  }
  process.exit(0);
}

// ─── Entry ──────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.scanAll) {
    await scanAll(opts);
  } else {
    await checkSingleFile(opts);
  }
}

// Export for testing
module.exports = {
  parseArgs,
  extractEvents,
  eventOverlap,
  phase2Check,
  fallbackDeepCheck,
  loadRulesFromDir,
  PHASE2_PROMPT,
};

// Run if main
if (require.main === module) {
  main().catch(e => {
    console.error('[DEDUP] 未知错误:', e.message);
    process.exit(2);
  });
}
