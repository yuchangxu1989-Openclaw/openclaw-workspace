#!/usr/bin/env node
/**
 * e2e-eval.js — End-to-end evaluation pipeline (L1 Intent + L2 Decision Path)
 *
 * Two-model architecture:
 *   --test-model   被测模型 (generates intent / execution path)
 *   --judge-model  评委模型 (scores test-model output vs golden)
 *
 * Usage:
 *   node e2e-eval.js --level l1l2 --batch 10
 *   node e2e-eval.js --level l1 --batch 3 --dry-run
 *   node e2e-eval.js --test-model glm-4-flash --judge-model glm-5
 *   node e2e-eval.js --test-model claude-opus-4-6 --judge-model glm-5
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');

// ── CLI args ────────────────────────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    level:         { type: 'string', default: 'l1l2' },
    batch:         { type: 'string', default: '10' },
    offset:        { type: 'string', default: '0' },
    'data-dir':    { type: 'string', default: '' },
    'dry-run':     { type: 'boolean', default: false },
    'out-dir':     { type: 'string', default: '' },
    'test-model':  { type: 'string', default: 'glm-5' },
    'judge-model': { type: 'string', default: 'glm-5' },
    // legacy compat
    model:         { type: 'string', default: '' },
  },
  strict: false,
});

// If legacy --model is passed, use it for both
if (args.model) {
  if (!args['test-model'] || args['test-model'] === 'glm-5') args['test-model'] = args.model;
  if (!args['judge-model'] || args['judge-model'] === 'glm-5') args['judge-model'] = args.model;
}

const LEVEL       = args.level;                    // l1 | l2 | l1l2
const BATCH_SIZE  = Math.min(parseInt(args.batch, 10) || 10, 10); // ISC铁律: 上限10
const OFFSET      = parseInt(args.offset, 10) || 0;
const DRY_RUN     = args['dry-run'];
const DATA_DIR    = args['data-dir'] ||
  path.resolve(__dirname, '../../../tests/benchmarks/intent/c2-golden');
const OUT_DIR     = args['out-dir'] ||
  path.resolve(__dirname, '../../../reports/e2e-eval-results');
const TEST_MODEL  = args['test-model'];
const JUDGE_MODEL = args['judge-model'];

// ── Zhipu API config ────────────────────────────────────────────────────────
const ZHIPU_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const TIMEOUT_MS     = 45_000;  // 45s per call (GLM-5 can be slower)

// Track resolved models after fallback (per role)
const resolvedModels = { test: TEST_MODEL, judge: JUDGE_MODEL };

function buildFallbackChain(primary) {
  return [...new Set([primary, 'glm-5', 'glm-4-0520', 'glm-4-flash'])];
}

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
  const all = [];
  const seen = new Set();

  // Load mined-*.json (primary golden cases)
  const minedFiles = fs.readdirSync(dataDir)
    .filter(f => f.startsWith('mined-') && f.endsWith('.json'))
    .sort();
  for (const f of minedFiles) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8'));
      const items = Array.isArray(raw) ? raw : [raw];
      for (const item of items) {
        if (item.id && !seen.has(item.id)) {
          seen.add(item.id);
          all.push(item);
        } else if (!item.id) {
          all.push(item);
        }
      }
    } catch (e) {
      console.warn(`  [loadCases] skip ${f}: ${e.message}`);
    }
  }

  // Load goodcases-split/*.json (auto-generated goodcases)
  const splitDir = path.join(dataDir, 'goodcases-split');
  if (fs.existsSync(splitDir)) {
    const splitFiles = fs.readdirSync(splitDir)
      .filter(f => f.endsWith('.json'))
      .sort();
    for (const f of splitFiles) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(splitDir, f), 'utf-8'));
        const items = Array.isArray(raw) ? raw : [raw];
        for (const item of items) {
          if (item.id && !seen.has(item.id)) {
            seen.add(item.id);
            all.push(item);
          } else if (!item.id) {
            all.push(item);
          }
        }
      } catch (e) {
        console.warn(`  [loadCases] skip goodcases-split/${f}: ${e.message}`);
      }
    }
  }

  // Load goodcases-from-badcases.json
  const goodcasesFile = path.join(dataDir, 'goodcases-from-badcases.json');
  if (fs.existsSync(goodcasesFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(goodcasesFile, 'utf-8'));
      const items = Array.isArray(raw) ? raw : [raw];
      for (const item of items) {
        if (item.id && !seen.has(item.id)) {
          seen.add(item.id);
          all.push(item);
        }
      }
    } catch (e) {
      console.warn(`  [loadCases] skip goodcases-from-badcases.json: ${e.message}`);
    }
  }

  return all;
}

// ── Prompt builders ─────────────────────────────────────────────────────────

// L1 Step 1: test-model — understand the user intent (no golden answer shown)
function buildL1TestPrompt(c) {
  return `你是一个AI助手。请仔细阅读以下用户输入和对话背景，用一句话精确概括用户的核心意图，然后给出你认为系统应该如何响应。

用户输入：${c.input}
对话背景：${c.context || '无'}

严格输出JSON，不要输出其他内容：
{"intent_summary":"用户的核心意图（一句话）","proposed_response":"系统应该如何响应（简要描述）"}`;
}

// L1 Step 2: judge-model — compare test-model's understanding vs golden
function buildL1JudgePrompt(c, actualIntent) {
  return `你是AI系统评测专家。请判断被测系统对用户意图的理解是否正确。

原始用户输入：${c.input}
对话背景：${c.context || '无'}

被测系统的意图理解：${actualIntent}
标准答案（期望的系统理解）：${c.expected_output}

请判断：
1. 被测系统是否正确理解了用户的核心意图？
2. 被测系统的理解与标准答案的核心目标是否一致？（忽略措辞差异，关注语义一致性）
3. 意图理解的准确度评分（0-100，80+为正确）

严格输出JSON，不要输出其他内容：{"correct":true或false,"score":数字,"reasoning":"简要判断理由"}`;
}

// L2 Step 1: test-model — propose execution path (no golden chain shown)
function buildL2TestPrompt(c, intent) {
  return `你是一个AI助手。给定以下用户请求和意图，请设计具体的执行步骤链来完成用户需求。

用户输入：${c.input}
对话背景：${c.context || '无'}
用户核心意图：${intent}

请列出系统应执行的具体步骤（按顺序）。

严格输出JSON，不要输出其他内容：
{"execution_steps":["步骤1","步骤2","步骤3",...]}`;
}

// L2 Step 2: judge-model — compare test-model's chain vs golden chain
function buildL2JudgePrompt(c, actualSteps) {
  const goldenSteps = Array.isArray(c.execution_chain_steps)
    ? c.execution_chain_steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
    : String(c.execution_chain_steps || '无');
  const testSteps = Array.isArray(actualSteps)
    ? actualSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')
    : String(actualSteps || '无');
  return `你是AI系统评测专家。请对比被测系统提出的执行路径与标准执行链，评估覆盖率。

用户输入：${c.input}
对话背景：${c.context || '无'}

被测系统的执行路径：
${testSteps}

标准执行链：
${goldenSteps}

请判断：
1. 被测系统的执行路径覆盖了标准执行链中多少关键步骤？
2. 哪些标准步骤被遗漏了？哪些是多余的？
3. 覆盖率评分（0-100，80+为通过）

严格输出JSON，不要输出其他内容：{"coverage_score":数字,"missing_steps":["遗漏的标准步骤"],"redundant_steps":["多余的步骤"],"pass":true或false,"reasoning":"简要判断理由"}`;
}

// ── LLM call ────────────────────────────────────────────────────────────────
async function callLLM(prompt, apiKey, model) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const body = JSON.stringify({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 1024,
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
    return data.choices?.[0]?.message?.content || '';
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('timeout');
    throw err;
  }
}

/**
 * Call LLM with model fallback chain.
 * @param {string} role  'test' | 'judge' — tracks resolved model per role
 */
async function callLLMWithFallback(prompt, apiKey, role) {
  const primary = role === 'test' ? TEST_MODEL : JUDGE_MODEL;
  const chain = buildFallbackChain(primary);
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    try {
      const result = await callLLM(prompt, apiKey, model);
      if (model !== resolvedModels[role]) {
        console.log(`\n  [${role}-model-fallback] ${resolvedModels[role]} → ${model}`);
        resolvedModels[role] = model;
      }
      return result;
    } catch (e) {
      const isModelError = /model|not.?found|not.?support|1301/i.test(e.message);
      if (isModelError && i < chain.length - 1) continue;
      // Non-model error: retry once
      if (!isModelError) {
        try { return await callLLM(prompt, apiKey, model); } catch {}
      }
      if (i === chain.length - 1) throw e;
    }
  }
}

/** Extract JSON from LLM response (handles markdown fences, leading text, nested braces) */
function extractJSON(text) {
  try { return JSON.parse(text.trim()); } catch {}
  // Try extracting from ```json ... ```
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch {}
  }
  // Balanced-brace extraction (handles nested arrays/objects)
  const start = text.indexOf('{');
  if (start !== -1) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch { break; }
      }
    }
  }
  // Last resort: greedy match
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch {}
  }
  return null;
}

// ── Evaluation runners ──────────────────────────────────────────────────────

/**
 * L1: Two-step intent evaluation
 *  Step 1 → test-model produces actual_intent
 *  Step 2 → judge-model scores actual_intent vs golden
 */
async function evalL1(c, apiKey, dryRun) {
  const testPrompt = buildL1TestPrompt(c);
  if (dryRun) {
    const judgePrompt = buildL1JudgePrompt(c, '<test-model输出的意图>');
    return {
      status: 'dry-run', correct: null, score: null,
      intent_summary: null, actual_response: null,
      prompts: { test: testPrompt, judge: judgePrompt },
    };
  }

  try {
    // Step 1: test-model understands intent
    const testRaw = await callLLMWithFallback(testPrompt, apiKey, 'test');
    const testParsed = extractJSON(testRaw);
    const actualIntent = testParsed?.intent_summary || testRaw.slice(0, 200);
    const actualResponse = testParsed?.proposed_response || null;

    // Step 2: judge-model evaluates
    const judgePrompt = buildL1JudgePrompt(c, actualIntent);
    const judgeRaw = await callLLMWithFallback(judgePrompt, apiKey, 'judge');
    const judgeParsed = extractJSON(judgeRaw);

    if (!judgeParsed) {
      return {
        status: 'parse_error', raw: judgeRaw.slice(0, 300),
        correct: false, score: 0,
        intent_summary: actualIntent, actual_response: actualResponse,
      };
    }
    return {
      status: 'ok',
      correct: !!judgeParsed.correct,
      score: typeof judgeParsed.score === 'number' ? judgeParsed.score : 0,
      intent_summary: actualIntent,
      actual_response: actualResponse,
      reasoning: judgeParsed.reasoning || null,
    };
  } catch (err) {
    const status = err.message === 'timeout' ? 'timeout' : 'error';
    return { status, error: err.message, correct: false, score: 0, intent_summary: null, actual_response: null };
  }
}

/**
 * L2: Two-step decision path evaluation
 *  Step 1 → test-model proposes execution chain
 *  Step 2 → judge-model scores actual chain vs golden
 */
async function evalL2(c, intentSummary, apiKey, dryRun) {
  const intent = intentSummary || c.expected_output;
  const testPrompt = buildL2TestPrompt(c, intent);
  if (dryRun) {
    const judgePrompt = buildL2JudgePrompt(c, ['<test-model输出的步骤>']);
    return {
      status: 'dry-run', pass: null, coverage_score: null,
      actual_steps: [], missing_steps: [], redundant_steps: [],
      prompts: { test: testPrompt, judge: judgePrompt },
    };
  }

  try {
    // Step 1: test-model proposes execution path
    const testRaw = await callLLMWithFallback(testPrompt, apiKey, 'test');
    const testParsed = extractJSON(testRaw);
    const actualSteps = testParsed?.execution_steps || [];

    // Step 2: judge-model evaluates coverage
    const judgePrompt = buildL2JudgePrompt(c, actualSteps);
    const judgeRaw = await callLLMWithFallback(judgePrompt, apiKey, 'judge');
    const judgeParsed = extractJSON(judgeRaw);

    if (!judgeParsed) {
      return {
        status: 'parse_error', raw: judgeRaw.slice(0, 300),
        pass: false, coverage_score: 0,
        actual_steps: actualSteps, missing_steps: [], redundant_steps: [],
      };
    }
    const coverage = typeof judgeParsed.coverage_score === 'number' ? judgeParsed.coverage_score : 0;
    return {
      status: 'ok',
      pass: coverage >= 80,
      coverage_score: coverage,
      actual_steps: actualSteps,
      missing_steps: judgeParsed.missing_steps || [],
      redundant_steps: judgeParsed.redundant_steps || [],
      reasoning: judgeParsed.reasoning || null,
    };
  } catch (err) {
    const status = err.message === 'timeout' ? 'timeout' : 'error';
    return { status, error: err.message, pass: false, coverage_score: 0, actual_steps: [], missing_steps: [], redundant_steps: [] };
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[e2e-eval] level=${LEVEL} batch=${BATCH_SIZE} offset=${OFFSET} dry-run=${DRY_RUN}`);
  console.log(`[e2e-eval] test-model=${TEST_MODEL}  judge-model=${JUDGE_MODEL}`);
  console.log(`[e2e-eval] data-dir: ${DATA_DIR}`);

  const allCases = loadCases(DATA_DIR);
  console.log(`[e2e-eval] Total cases loaded: ${allCases.length}`);

  const batch = allCases.slice(OFFSET, OFFSET + BATCH_SIZE);
  if (batch.length === 0) {
    console.log('[e2e-eval] No cases in range. Done.');
    return;
  }
  console.log(`[e2e-eval] Evaluating ${batch.length} cases (offset ${OFFSET}–${OFFSET + batch.length - 1})\n`);

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
      entry.l1 = {
        correct: l1.correct, score: l1.score, status: l1.status,
        actual_intent: l1.intent_summary,
      };
      if (l1.actual_response) entry.l1.actual_response = l1.actual_response;
      if (l1.reasoning) entry.l1.reasoning = l1.reasoning;
      if (DRY_RUN) entry.l1.prompts = l1.prompts;
      if (l1.error) entry.l1.error = l1.error;
      if (l1.correct) l1Pass++;
      intentSummary = l1.intent_summary;
    }

    // L2
    if (doL2) {
      const l2 = await evalL2(c, intentSummary, apiKey, DRY_RUN);
      entry.l2 = {
        pass: l2.pass, coverage_score: l2.coverage_score, status: l2.status,
        actual_steps: l2.actual_steps,
      };
      if (l2.missing_steps?.length) entry.l2.missing_steps = l2.missing_steps;
      if (l2.redundant_steps?.length) entry.l2.redundant_steps = l2.redundant_steps;
      if (l2.reasoning) entry.l2.reasoning = l2.reasoning;
      if (DRY_RUN) entry.l2.prompts = l2.prompts;
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
  const modelTag = TEST_MODEL === JUDGE_MODEL
    ? TEST_MODEL.replace(/[^a-z0-9-]/gi, '')
    : `${TEST_MODEL.replace(/[^a-z0-9-]/gi, '')}_j-${JUDGE_MODEL.replace(/[^a-z0-9-]/gi, '')}`;
  const report = {
    eval_id: `e2e-${LEVEL}-${modelTag}-${ts}-${seq}`,
    level: LEVEL,
    timestamp: now.toISOString(),
    total: batch.length,
    offset: OFFSET,
    dry_run: DRY_RUN,
    test_model: resolvedModels.test,
    judge_model: resolvedModels.judge,
    test_model_requested: TEST_MODEL,
    judge_model_requested: JUDGE_MODEL,
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
  console.log(`  Cases:       ${batch.length} (offset ${OFFSET})`);
  console.log(`  Test model:  ${resolvedModels.test}`);
  console.log(`  Judge model: ${resolvedModels.judge}`);
  if (doL1) console.log(`  L1 Intent:   ${l1Pass}/${batch.length} pass (${(report.l1_accuracy * 100).toFixed(1)}%)`);
  if (doL2) console.log(`  L2 Decision: ${l2Pass}/${batch.length} pass (avg coverage ${(report.l2_avg_coverage * 100).toFixed(1)}%)`);
  if (DRY_RUN) console.log('  ⚠ DRY-RUN mode — no API calls made');
}

main().catch(err => {
  console.error('[e2e-eval] Fatal:', err.message);
  process.exit(1);
});
