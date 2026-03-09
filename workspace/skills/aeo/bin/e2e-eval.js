#!/usr/bin/env node
/**
 * e2e-eval.js — End-to-end evaluation pipeline (L1 Intent + L2 Decision Path)
 *
 * Usage:
 *   node e2e-eval.js --level l1 --batch 10 --offset 0 --data-dir <path>
 *   node e2e-eval.js --level l2 --batch 10 --offset 0
 *   node e2e-eval.js --level l1l2 --batch 10        # run both layers
 *   node e2e-eval.js --level l1 --batch 3 --dry-run  # prompt preview only
 *   node e2e-eval.js --model glm-4-0520             # use specific model
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');

// ── CLI args ────────────────────────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    level:    { type: 'string', default: 'l1l2' },
    batch:    { type: 'string', default: '10' },
    offset:   { type: 'string', default: '0' },
    'data-dir': { type: 'string', default: '' },
    'dry-run': { type: 'boolean', default: false },
    'out-dir': { type: 'string', default: '' },
    model:    { type: 'string', default: 'glm-4-plus' },
  },
  strict: false,
});

const LEVEL      = args.level;                    // l1 | l2 | l1l2
const BATCH_SIZE  = Math.min(parseInt(args.batch, 10) || 10, 10); // ISC铁律: 上限10
const OFFSET      = parseInt(args.offset, 10) || 0;
const DRY_RUN     = args['dry-run'];
const DATA_DIR    = args['data-dir'] ||
  path.resolve(__dirname, '../../../tests/benchmarks/intent/c2-golden');
const OUT_DIR     = args['out-dir'] ||
  path.resolve(__dirname, '../../../reports/e2e-eval-results');

// ── Zhipu API config ────────────────────────────────────────────────────────
const ZHIPU_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL_FALLBACK_CHAIN = [args.model, 'glm-4-plus', 'glm-4-0520', 'glm-4-flash'];
let   activeModel    = args.model;  // resolved after first successful call or fallback
const TIMEOUT_MS     = 30_000;  // 30s per call
const MAX_RETRIES    = 1;

function loadApiKey() {
  const envPath = path.resolve('/root/.openclaw/.secrets/zhipu-keys.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`Zhipu key file not found: ${envPath}`);
  }
  const content = fs.readFileSync(envPath, 'utf-8');
  const m = content.match(/ZHIPU_API_KEY_1="?([^"\n]+)"?/);
  if (!m) throw new Error('ZHIPU_API_KEY_1 not found in env file');
  return m[1].trim();
}

// ── Load evaluation cases ───────────────────────────────────────────────────
function loadCases(dataDir) {
  const files = fs.readdirSync(dataDir)
    .filter(f => f.startsWith('mined-') && f.endsWith('.json'))
    .sort();
  const all = [];
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8'));
    if (Array.isArray(raw)) all.push(...raw);
    else all.push(raw);
  }
  return all;
}

// ── Prompt builders ─────────────────────────────────────────────────────────
function buildL1Prompt(c) {
  return `你是AI系统评测专家。判断以下用户输入中的核心意图是否被正确理解。

用户输入：${c.input}
对话背景：${c.context || '无'}
期望的系统理解：${c.expected_output}

请判断：
1. 用户的核心意图是什么？（一句话）
2. 期望理解是否正确捕捉了用户意图？（是/否）
3. 意图理解的准确度评分（0-100）

严格输出JSON，不要输出其他内容：{"intent_summary":"...","correct":true或false,"score":数字}`;
}

function buildL2Prompt(c, intentSummary) {
  const intent = intentSummary || c.expected_output;
  const steps = Array.isArray(c.execution_chain_steps)
    ? c.execution_chain_steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
    : String(c.execution_chain_steps || '无');
  return `你是AI系统评测专家。判断以下场景中系统应选择的执行路径是否合理。

用户输入：${c.input}
对话背景：${c.context || '无'}
用户核心意图：${intent}
期望执行链：
${steps}

请判断：
1. 这条执行链是否合理覆盖了用户意图？
2. 有哪些步骤是多余的？哪些关键步骤缺失？
3. 执行路径覆盖率评分（0-100）

严格输出JSON，不要输出其他内容：{"coverage_score":数字,"missing_steps":["..."],"redundant_steps":["..."],"pass":true或false}`;
}

// ── LLM call (Zhipu glm-4-flash) ───────────────────────────────────────────
async function callLLM(prompt, apiKey, model) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const body = JSON.stringify({
    model: model || activeModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 512,
  });

  try {
    const res = await fetch(ZHIPU_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    return content;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('timeout');
    throw err;
  }
}

/** Call LLM with 1 retry + model fallback chain on failure */
async function callLLMWithRetry(prompt, apiKey) {
  // De-duplicate fallback chain while preserving order
  const chain = [...new Set(MODEL_FALLBACK_CHAIN)];
  for (let mi = 0; mi < chain.length; mi++) {
    const model = chain[mi];
    try {
      const result = await callLLM(prompt, apiKey, model);
      if (model !== activeModel) {
        console.log(`\n  [model-fallback] ${activeModel} → ${model}`);
        activeModel = model;
      }
      return result;
    } catch (e) {
      // If model not found / not supported, try next in chain
      const isModelError = /model|not.?found|not.?support|1301/i.test(e.message);
      if (isModelError && mi < chain.length - 1) {
        continue; // try next model
      }
      // For non-model errors, retry once with same model
      if (!isModelError) {
        try { return await callLLM(prompt, apiKey, model); } catch {}
      }
      // Last model in chain — throw
      if (mi === chain.length - 1) throw e;
    }
  }
}

/** Extract JSON from LLM response (handles markdown fences, leading text, etc.) */
function extractJSON(text) {
  // Try direct parse first
  try { return JSON.parse(text.trim()); } catch {}
  // Try extracting from ```json ... ```
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch {}
  }
  // Try finding first { ... }
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch {}
  }
  return null;
}

// ── Evaluation runners ──────────────────────────────────────────────────────
async function evalL1(c, apiKey, dryRun) {
  const prompt = buildL1Prompt(c);
  if (dryRun) {
    return { status: 'dry-run', prompt, correct: null, score: null, intent_summary: null };
  }
  try {
    const raw = await callLLMWithRetry(prompt, apiKey);
    const parsed = extractJSON(raw);
    if (!parsed) {
      return { status: 'parse_error', raw: raw.slice(0, 300), correct: false, score: 0, intent_summary: null };
    }
    return {
      status: 'ok',
      correct: !!parsed.correct,
      score: typeof parsed.score === 'number' ? parsed.score : 0,
      intent_summary: parsed.intent_summary || null,
    };
  } catch (err) {
    const status = err.message === 'timeout' ? 'timeout' : 'error';
    return { status, error: err.message, correct: false, score: 0, intent_summary: null };
  }
}

async function evalL2(c, intentSummary, apiKey, dryRun) {
  const prompt = buildL2Prompt(c, intentSummary);
  if (dryRun) {
    return { status: 'dry-run', prompt, pass: null, coverage_score: null, missing_steps: [], redundant_steps: [] };
  }
  try {
    const raw = await callLLMWithRetry(prompt, apiKey);
    const parsed = extractJSON(raw);
    if (!parsed) {
      return { status: 'parse_error', raw: raw.slice(0, 300), pass: false, coverage_score: 0, missing_steps: [], redundant_steps: [] };
    }
    const coverage = typeof parsed.coverage_score === 'number' ? parsed.coverage_score : 0;
    return {
      status: 'ok',
      pass: coverage >= 80,
      coverage_score: coverage,
      missing_steps: parsed.missing_steps || [],
      redundant_steps: parsed.redundant_steps || [],
    };
  } catch (err) {
    const status = err.message === 'timeout' ? 'timeout' : 'error';
    return { status, error: err.message, pass: false, coverage_score: 0, missing_steps: [], redundant_steps: [] };
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[e2e-eval] level=${LEVEL} batch=${BATCH_SIZE} offset=${OFFSET} model=${activeModel} dry-run=${DRY_RUN}`);
  console.log(`[e2e-eval] data-dir: ${DATA_DIR}`);

  const allCases = loadCases(DATA_DIR);
  console.log(`[e2e-eval] Total cases loaded: ${allCases.length}`);

  const batch = allCases.slice(OFFSET, OFFSET + BATCH_SIZE);
  if (batch.length === 0) {
    console.log('[e2e-eval] No cases in range. Done.');
    return;
  }
  console.log(`[e2e-eval] Evaluating ${batch.length} cases (offset ${OFFSET}–${OFFSET + batch.length - 1})`);

  const apiKey = DRY_RUN ? null : loadApiKey();
  const doL1 = LEVEL === 'l1' || LEVEL === 'l1l2';
  const doL2 = LEVEL === 'l2' || LEVEL === 'l1l2';

  const results = [];
  let l1Pass = 0, l2Pass = 0, l2CoverageSum = 0, l2Count = 0;

  for (let i = 0; i < batch.length; i++) {
    const c = batch[i];
    const caseId = c.id || `case-${OFFSET + i}`;
    process.stdout.write(`  [${i + 1}/${batch.length}] ${caseId} ...`);

    const entry = { case_id: caseId };
    let intentSummary = null;

    // L1
    if (doL1) {
      const l1 = await evalL1(c, apiKey, DRY_RUN);
      entry.l1 = { correct: l1.correct, score: l1.score, status: l1.status };
      if (DRY_RUN) entry.l1.prompt = l1.prompt;
      if (l1.error) entry.l1.error = l1.error;
      if (l1.correct) l1Pass++;
      intentSummary = l1.intent_summary;
    }

    // L2
    if (doL2) {
      const l2 = await evalL2(c, intentSummary, apiKey, DRY_RUN);
      entry.l2 = { pass: l2.pass, coverage_score: l2.coverage_score, status: l2.status };
      if (l2.missing_steps?.length) entry.l2.missing_steps = l2.missing_steps;
      if (l2.redundant_steps?.length) entry.l2.redundant_steps = l2.redundant_steps;
      if (DRY_RUN) entry.l2.prompt = l2.prompt;
      if (l2.error) entry.l2.error = l2.error;
      if (l2.pass) l2Pass++;
      if (typeof l2.coverage_score === 'number') {
        l2CoverageSum += l2.coverage_score;
        l2Count++;
      }
    }

    results.push(entry);
    const marks = [];
    if (entry.l1) marks.push(`L1:${entry.l1.correct ? '✓' : '✗'}(${entry.l1.score})`);
    if (entry.l2) marks.push(`L2:${entry.l2.pass ? '✓' : '✗'}(${entry.l2.coverage_score})`);
    console.log(` ${marks.join(' ')}`);
  }

  // Build report
  const now = new Date();
  const ts = now.toISOString().slice(0, 10);
  const seq = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
  const report = {
    eval_id: `e2e-${LEVEL}-${ts}-${seq}`,
    level: LEVEL,
    timestamp: now.toISOString(),
    total: batch.length,
    offset: OFFSET,
    dry_run: DRY_RUN,
    model: activeModel,
  };

  if (doL1) {
    report.l1_pass = l1Pass;
    report.l1_accuracy = +(l1Pass / batch.length).toFixed(4);
  }
  if (doL2) {
    report.l2_pass = l2Pass;
    report.l2_avg_coverage = l2Count > 0 ? +(l2CoverageSum / l2Count / 100).toFixed(4) : 0;
  }
  report.results = results;

  // Write output
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${report.eval_id}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n[e2e-eval] Report written: ${outFile}`);

  // Summary
  console.log('\n═══ Summary ═══');
  console.log(`  Cases: ${batch.length} (offset ${OFFSET})`);
  if (doL1) console.log(`  L1 Intent:   ${l1Pass}/${batch.length} pass (${(report.l1_accuracy * 100).toFixed(1)}%)`);
  if (doL2) console.log(`  L2 Decision: ${l2Pass}/${batch.length} pass (avg coverage ${(report.l2_avg_coverage * 100).toFixed(1)}%)`);
  if (DRY_RUN) console.log('  ⚠ DRY-RUN mode — no API calls made');
}

main().catch(err => {
  console.error('[e2e-eval] Fatal:', err.message);
  process.exit(1);
});
