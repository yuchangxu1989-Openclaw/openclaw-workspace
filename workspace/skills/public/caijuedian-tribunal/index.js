#!/usr/bin/env node
/**
 * 裁决殿 v2.0 ⚡🏛️ — 完整LLM驱动执行引擎
 *
 * 使用 council.js 生成prompt，通过 OpenAI-compatible API 执行三轮对抗。
 * Round 1 并行 → Round 2 串行 → Round 3 终审裁决
 *
 * CLI:
 *   node index.js --topic "议题" --context "背景" --mode 7
 *   LLM_API_KEY=xxx node index.js --topic "..."
 *
 * Module:
 *   const { execute } = require('./index.js');
 *   const result = await execute('议题', '背景', { mode: '7' });
 */

'use strict';

const {
  convene,
  buildRound2Prompts,
  buildRound3Prompt,
  parseArgs: parseBaseArgs,
} = require('./council.js');

// ─── LLM Client ─────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
const DEFAULT_MODEL = 'glm-4-flash';
const DEFAULT_TIMEOUT_MS = 60000;

/**
 * Call an OpenAI-compatible chat completion API.
 * @param {string} prompt   — user message
 * @param {object} config   — { apiKey, baseUrl, model, timeoutMs }
 * @returns {Promise<string>} — assistant reply content
 */
async function callLLM(prompt, config = {}) {
  const apiKey = config.apiKey || process.env.LLM_API_KEY || process.env.ZHIPU_API_KEY_1;
  const baseUrl = (config.baseUrl || process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = config.model || process.env.LLM_MODEL || DEFAULT_MODEL;
  const timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS;

  if (!apiKey) {
    throw new Error('No API key. Set LLM_API_KEY or ZHIPU_API_KEY_1 env var, or pass apiKey option.');
  }

  const url = `${baseUrl}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`LLM API ${resp.status}: ${body.slice(0, 200)}`);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`LLM returned empty content: ${JSON.stringify(data).slice(0, 200)}`);
    }
    return content;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`LLM call timed out after ${timeoutMs}ms`);
    }
    throw err;
  }
}

// ─── Core Engine ────────────────────────────────────────────────────

/**
 * Execute a full tribunal session with actual LLM calls.
 *
 * @param {string} topic          — The issue to deliberate
 * @param {string} context        — Background material
 * @param {object} [options]
 * @param {string} [options.mode='7']       — '7' | '5' | '3'
 * @param {string} [options.model]          — LLM model name
 * @param {string} [options.apiKey]         — API key
 * @param {string} [options.baseUrl]        — API base URL
 * @param {boolean} [options.parallel=true] — Parallel Round 1
 * @param {number} [options.timeoutMs]      — Per-call timeout
 * @param {boolean} [options.verbose=false] — Print progress
 * @returns {Promise<object>} — Full tribunal result
 */
async function execute(topic, context, options = {}) {
  const startTime = Date.now();
  const mode = String(options.mode || '7');
  const verbose = options.verbose || false;
  const parallel = options.parallel !== false;

  const llmConfig = {
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    model: options.model,
    timeoutMs: options.timeoutMs,
  };

  if (verbose) {
    const modelName = options.model || process.env.LLM_MODEL || DEFAULT_MODEL;
    console.error(`⚡🏛️ 裁决殿启动 — 模式: ${mode}席 | 模型: ${modelName}`);
    console.error(`📋 议题: ${topic}`);
    console.error('');
  }

  // Generate Round 1 prompts
  const plan = convene(topic, context, { mode });
  const round1Prompts = plan.rounds.round1.prompts;

  // ═══ Round 1: Independent Deliberation ═══
  if (verbose) console.error(`🔵 Round 1: 独立审议 (${round1Prompts.length}席${parallel ? '并行' : '串行'})...`);

  const round1Results = [];

  if (parallel) {
    const promises = round1Prompts.map(async (p) => {
      try {
        const result = await callLLM(p.prompt, llmConfig);
        return { seat: p.seat, seatTitle: p.seatTitle, result, status: 'ok' };
      } catch (err) {
        if (verbose) console.error(`  ⚠️ ${p.seatTitle} 缺席: ${err.message}`);
        return { seat: p.seat, seatTitle: p.seatTitle, result: `[缺席: ${err.message}]`, status: 'absent' };
      }
    });
    round1Results.push(...await Promise.all(promises));
  } else {
    for (const p of round1Prompts) {
      try {
        const result = await callLLM(p.prompt, llmConfig);
        round1Results.push({ seat: p.seat, seatTitle: p.seatTitle, result, status: 'ok' });
      } catch (err) {
        if (verbose) console.error(`  ⚠️ ${p.seatTitle} 缺席: ${err.message}`);
        round1Results.push({ seat: p.seat, seatTitle: p.seatTitle, result: `[缺席: ${err.message}]`, status: 'absent' });
      }
    }
  }

  const r1OkCount = round1Results.filter(r => r.status === 'ok').length;
  if (verbose) console.error(`  ✅ Round 1 完成: ${r1OkCount}/${round1Results.length} 席到场\n`);

  // ═══ Round 2: Cross Battle ═══
  if (verbose) console.error(`🟡 Round 2: 交叉Battle (${round1Results.length}席串行)...`);

  const round2Prompts = buildRound2Prompts(topic, round1Results, mode);
  const round2Results = [];

  for (const p of round2Prompts) {
    try {
      const result = await callLLM(p.prompt, llmConfig);
      round2Results.push({ seat: p.seat, seatTitle: p.seatTitle, result, status: 'ok' });
      if (verbose) console.error(`  ✓ ${p.seatTitle} 完成交叉质疑`);
    } catch (err) {
      if (verbose) console.error(`  ⚠️ ${p.seatTitle} 缺席: ${err.message}`);
      round2Results.push({ seat: p.seat, seatTitle: p.seatTitle, result: `[缺席: ${err.message}]`, status: 'absent' });
    }
  }

  const r2OkCount = round2Results.filter(r => r.status === 'ok').length;
  if (verbose) console.error(`  ✅ Round 2 完成: ${r2OkCount}/${round2Results.length} 席完成质疑\n`);

  // ═══ Round 3: Final Verdict ═══
  if (verbose) console.error(`🔴 Round 3: 终审裁决...`);

  const round3PromptData = buildRound3Prompt(topic, round1Results, round2Results);
  let round3Result;

  try {
    const verdictText = await callLLM(round3PromptData.prompt, llmConfig);
    const score = extractScore(verdictText);
    round3Result = { verdict: verdictText, score, status: 'ok' };
    if (verbose) console.error(`  ✅ 裁决完成，综合评分: ${score}/10\n`);
  } catch (err) {
    if (verbose) console.error(`  ❌ 裁决失败: ${err.message}\n`);
    round3Result = { verdict: `[裁决失败: ${err.message}]`, score: null, status: 'failed' };
  }

  const durationMs = Date.now() - startTime;
  const modelName = options.model || process.env.LLM_MODEL || DEFAULT_MODEL;

  const result = {
    topic,
    context: context || '',
    mode,
    model: modelName,
    seats: plan.seats,
    rounds: {
      round1: round1Results,
      round2: round2Results,
      round3: round3Result,
    },
    summary: {
      round1_present: `${r1OkCount}/${round1Results.length}`,
      round2_present: `${r2OkCount}/${round2Results.length}`,
      round3_status: round3Result.status,
      final_score: round3Result.score,
    },
    duration_ms: durationMs,
    timestamp: new Date().toISOString(),
  };

  if (verbose) {
    console.error(`⏱️  总耗时: ${(durationMs / 1000).toFixed(1)}s`);
    console.error(`📊 到场率: R1=${result.summary.round1_present} R2=${result.summary.round2_present}`);
    console.error(`⚖️  综合评分: ${round3Result.score}/10`);
  }

  return result;
}

/**
 * Extract numeric score from Round 3 verdict text.
 * Looks for patterns like "X/10", "评分：X", "综合评分】X" etc.
 */
function extractScore(text) {
  // Try "综合评分】X/10" or "X/10"
  const patterns = [
    /综合评分[】\]：:]\s*(\d+(?:\.\d+)?)\s*[\/／]/,
    /评分[】\]：:]\s*(\d+(?:\.\d+)?)\s*[\/／]/,
    /(\d+(?:\.\d+)?)\s*[\/／]\s*10/,
  ];

  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const score = parseFloat(m[1]);
      if (score >= 0 && score <= 10) return score;
    }
  }
  return null;
}

// ─── Formatted Output ───────────────────────────────────────────────

/**
 * Format the tribunal result as a readable report.
 */
function formatReport(result) {
  const lines = [];
  lines.push(`\n${'═'.repeat(60)}`);
  lines.push(`⚡🏛️ 裁决殿裁决报告`);
  lines.push(`${'═'.repeat(60)}`);
  lines.push(`📋 议题: ${result.topic}`);
  lines.push(`📐 模式: ${result.mode}席 | 模型: ${result.model}`);
  lines.push(`⏱️  耗时: ${(result.duration_ms / 1000).toFixed(1)}s`);
  lines.push(`📅 时间: ${result.timestamp}`);
  lines.push('');

  // Round 1
  lines.push(`${'─'.repeat(60)}`);
  lines.push(`🔵 Round 1: 独立审议 (${result.summary.round1_present})`);
  lines.push(`${'─'.repeat(60)}`);
  for (const r of result.rounds.round1) {
    const icon = r.status === 'ok' ? '✓' : '✗';
    lines.push(`\n${icon} ${r.seatTitle}`);
    lines.push(r.result);
  }

  // Round 2
  lines.push(`\n${'─'.repeat(60)}`);
  lines.push(`🟡 Round 2: 交叉Battle (${result.summary.round2_present})`);
  lines.push(`${'─'.repeat(60)}`);
  for (const r of result.rounds.round2) {
    const icon = r.status === 'ok' ? '✓' : '✗';
    lines.push(`\n${icon} ${r.seatTitle}`);
    lines.push(r.result);
  }

  // Round 3
  lines.push(`\n${'─'.repeat(60)}`);
  lines.push(`🔴 Round 3: 终审裁决`);
  lines.push(`${'─'.repeat(60)}`);
  lines.push(result.rounds.round3.verdict);

  // Summary
  lines.push(`\n${'═'.repeat(60)}`);
  lines.push(`⚖️  综合评分: ${result.rounds.round3.score ?? 'N/A'}/10`);
  lines.push(`${'═'.repeat(60)}\n`);

  return lines.join('\n');
}

// ─── CLI ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = parseBaseArgs(argv);
  // Extra flags for execution
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--model'   && argv[i + 1]) { args.model   = argv[++i]; continue; }
    if (arg === '--api-key' && argv[i + 1]) { args.apiKey   = argv[++i]; continue; }
    if (arg === '--base-url' && argv[i + 1]) { args.baseUrl  = argv[++i]; continue; }
    if (arg === '--verbose' || arg === '-v')  { args.verbose  = true; continue; }
    if (arg === '--json')                     { args.json     = true; continue; }
    if (arg === '--serial')                   { args.parallel = false; continue; }
    if (arg === '--prompt-only')              { args.promptOnly = true; continue; }
    if (arg === '--dry-run')                  { args.promptOnly = true; continue; }
  }
  return args;
}

function printUsage() {
  console.log(`
裁决殿 v2.0 ⚡🏛️ — LLM驱动的三轮对抗式决策引擎

Usage:
  node index.js --topic "议题" [options]

Options:
  --topic      议题（必填）
  --context    背景材料
  --mode       席位模式: 7|5|3  [default: 7]
  --model      LLM模型名 [default: glm-4-flash]
  --api-key    API密钥 (或设置 LLM_API_KEY / ZHIPU_API_KEY_1)
  --base-url   API地址 (或设置 LLM_BASE_URL)
  --verbose    显示进度信息
  --json       输出JSON格式（默认输出可读报告）
  --serial     Round 1串行执行（默认并行）
  --prompt-only 仅输出prompt，不调用LLM
  --help       显示帮助

Environment Variables:
  LLM_API_KEY     API密钥
  LLM_BASE_URL    API地址
  LLM_MODEL       默认模型
  ZHIPU_API_KEY_1 智谱API密钥（备选）

Examples:
  node index.js --topic "是否应该重构" --mode 3 --verbose
  node index.js --topic "技术选型" --model gpt-4 --json
  node index.js --topic "方向决策" --prompt-only
`.trim());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (!args.topic) {
    console.error('Error: --topic is required. Use --help for usage.');
    process.exit(1);
  }

  // Prompt-only mode: delegate to council.js logic
  if (args.promptOnly) {
    const plan = convene(args.topic, args.context || '', { mode: args.mode });
    console.log(JSON.stringify(plan, null, 2));
    process.exit(0);
  }

  try {
    const result = await execute(args.topic, args.context || '', {
      mode: args.mode,
      model: args.model,
      apiKey: args.apiKey,
      baseUrl: args.baseUrl,
      parallel: args.parallel,
      verbose: args.verbose !== false, // Default verbose for CLI
    });

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatReport(result));
    }
  } catch (err) {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

// ─── Exports ────────────────────────────────────────────────────────

module.exports = {
  execute,
  callLLM,
  extractScore,
  formatReport,
};
