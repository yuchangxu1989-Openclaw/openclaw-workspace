#!/usr/bin/env node
/**
 * 凌霄阁-7人裁决神殿 v1.0 ⚡🏛️
 *
 * 完整裁决引擎 — LLM驱动的多视角三轮对抗式决策
 * 支持7/5/3席降级、并行Round 1、串行Round 2/3
 *
 * Usage:
 *   node council.js --topic "议题" --context "背景" --mode 7
 *   LLM_API_KEY=xxx LLM_BASE_URL=https://... node council.js --topic "..."
 *
 * API:
 *   const { convene } = require('./council.js');
 *   const result = await convene('议题', '背景', { mode: '7' });
 */

'use strict';

// ─── Seat Definitions ───────────────────────────────────────────────

const SEATS = [
  { id: 'dao',  title: '道席', emoji: '🏛️', role: '第一性原理守护者', dimension: '本质与边界',       question: '这个方案的第一性原理是什么？有没有在根基上就错了？' },
  { id: 'zhan', title: '战席', emoji: '⚔️', role: '战略决策者',       dimension: '方向与取舍',       question: '该不该做？优先级对吗？资源投入值得吗？' },
  { id: 'gong', title: '工席', emoji: '🔧', role: '工程实现者',       dimension: '可落地性',         question: '能实现吗？成本多大？技术债多少？' },
  { id: 'dun',  title: '盾席', emoji: '🛡️', role: '质量与安全守护者', dimension: '风险与韧性',       question: '最坏情况是什么？怎么回滚？安全边界在哪？' },
  { id: 'yan',  title: '眼席', emoji: '👁️', role: '用户与市场洞察者', dimension: '用户价值与体验',   question: '用户真的需要吗？体验如何？市场怎么看？' },
  { id: 'yuan', title: '远席', emoji: '🔮', role: '未来与进化预判者', dimension: '可扩展性与成长',   question: '3年后还适用吗？技术趋势如何？进化空间在哪？' },
  { id: 'heng', title: '衡席', emoji: '⚖️', role: '综合仲裁者',       dimension: '平衡与整合',       question: '各方分歧的根因是什么？最优平衡点在哪？' },
];

// Merged seats for degraded modes
const MERGED_SEATS = {
  gong_dun: {
    id: 'gong_dun', title: '工盾席', emoji: '🔧🛡️',
    role: '工程实现与安全守护者',
    dimension: '可落地性与风险',
    question: '能实现吗？成本多大？最坏情况和回滚方案？',
  },
  yan_yuan: {
    id: 'yan_yuan', title: '眼远席', emoji: '👁️🔮',
    role: '用户洞察与未来预判者',
    dimension: '用户价值与长期可扩展性',
    question: '用户真的需要吗？3年后还适用吗？',
  },
};

// ─── Mode → Seat Resolution ────────────────────────────────────────

function getSeatsForMode(mode) {
  const m = String(mode);
  if (m === '7') return [...SEATS];
  if (m === '5') {
    const dao  = SEATS.find(s => s.id === 'dao');
    const zhan = SEATS.find(s => s.id === 'zhan');
    const heng = SEATS.find(s => s.id === 'heng');
    return [dao, zhan, MERGED_SEATS.gong_dun, MERGED_SEATS.yan_yuan, heng];
  }
  if (m === '3') {
    return SEATS.filter(s => ['dao', 'zhan', 'heng'].includes(s.id));
  }
  throw new Error(`Invalid mode "${mode}". Must be 7, 5, or 3.`);
}

// ─── Prompt Builders ────────────────────────────────────────────────

function round1Prompt(topic, context, seat) {
  return `【凌霄阁-7人裁决神殿 · Round 1 · 独立审议】

你是${seat.emoji} ${seat.title}（${seat.role}）。
你的审视维度：${seat.dimension}
你的核心问题：${seat.question}

前提：你的一切分析必须以"断层式领先的全球最顶级AI"为目标。

## 议题
${topic}

## 背景材料
${context || '无额外背景'}

## 输出格式（严格遵守，限800 token）

【立场】支持 / 反对 / 有条件支持
【核心论点】（最多3条，每条一句话）
1. 
2. 
3. 
【关键风险】（从${seat.dimension}维度看到的最大风险）

【信心度】X/10
【一句话结论】`;
}

function round2Prompt(topic, round1Results, seat) {
  const othersViews = round1Results
    .filter(r => r.seat !== seat.id)
    .map(r => `${r.seatTitle || r.seat}：${r.result}`)
    .join('\n\n---\n\n');

  const myView = round1Results.find(r => r.seat === seat.id);

  return `【凌霄阁-7人裁决神殿 · Round 2 · 交叉Battle】

你是${seat.emoji} ${seat.title}（${seat.role}）。

## 议题
${topic}

## 其他神官的观点
${othersViews}

## 你的Round 1立场
${myView ? myView.result : '（缺席）'}

## 输出格式（严格遵守，限600 token）

【挑战】（指出其他神官论点的最大漏洞，至少2个）
1. 对X席：
2. 对Y席：
【回应】（回应对你的质疑）

【立场修正】修正 / 坚持，理由：
【信心度变化】从X到Y，原因：`;
}

function round3Prompt(topic, round1Results, round2Results) {
  const r1Summary = round1Results
    .map(r => `${r.seatTitle || r.seat}：${r.result}`)
    .join('\n\n');
  const r2Summary = round2Results
    .map(r => `${r.seatTitle || r.seat}：${r.result}`)
    .join('\n\n');

  return `【凌霄阁-7人裁决神殿 · Round 3 · 终审裁决】

你是⚖️ 衡席（综合仲裁者）+ 🏛️ 道席（第一性原理审核）。

## 议题
${topic}

## Round 1 各方独立观点
${r1Summary}

## Round 2 交叉Battle结果
${r2Summary}

## 输出格式（限1500 token）

【核心分歧】各方最根本的分歧是什么
【事实判断】哪些争议可以用事实解决
【价值判断】哪些争议是价值取向不同
【裁决】最终建议（含条件和边界）
【风险缓解】针对反对方最强论点的应对措施
【执行建议】下一步怎么做
【第一性原理检验】（道席审核）裁决是否偏离了根基？
【综合评分】X/10`;
}

// ─── LLM Client ─────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
const DEFAULT_MODEL    = 'glm-5';

/**
 * Call an OpenAI-compatible chat completion endpoint.
 * @param {string} prompt  — user message
 * @param {object} opts    — { baseUrl, apiKey, model, timeout }
 * @returns {string} assistant reply text
 */
async function callLLM(prompt, opts = {}) {
  const baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const apiKey  = opts.apiKey;
  const model   = opts.model || DEFAULT_MODEL;
  const timeout = opts.timeout || 120_000;

  if (!apiKey) throw new Error('LLM API key is required (pass apiKey or set LLM_API_KEY)');

  const url = `${baseUrl}/chat/completions`;
  const body = JSON.stringify({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 2048,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LLM API ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from LLM');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Core Engine ────────────────────────────────────────────────────

/**
 * Convene the Lingxiao Tribunal.
 *
 * @param {string} topic          — The issue to deliberate
 * @param {string} context        — Background material
 * @param {object} [options]
 * @param {string} [options.mode='7']       — '7' | '5' | '3'
 * @param {string} [options.model]          — LLM model name
 * @param {string} [options.apiKey]         — LLM API key
 * @param {string} [options.baseUrl]        — LLM base URL
 * @param {boolean}[options.parallel=true]  — Parallel Round 1
 * @param {number} [options.timeout]        — Per-call timeout ms
 * @param {Function}[options._callLLM]      — Override LLM caller (for testing)
 * @returns {object} Structured verdict report
 */
async function convene(topic, context, options = {}) {
  const startTime = Date.now();
  const mode      = String(options.mode || '7');
  const model     = options.model   || DEFAULT_MODEL;
  const apiKey    = options.apiKey   || process.env.LLM_API_KEY;
  const baseUrl   = options.baseUrl  || process.env.LLM_BASE_URL || DEFAULT_BASE_URL;
  const parallel  = options.parallel !== false;
  const timeout   = options.timeout  || 120_000;
  const llmCall   = options._callLLM || callLLM;

  if (!topic) throw new Error('Topic is required');

  const seats = getSeatsForMode(mode);
  const llmOpts = { baseUrl, apiKey, model, timeout };

  // ── Round 1: Independent deliberation ──
  const round1Tasks = seats.map(seat => {
    const prompt = round1Prompt(topic, context, seat);
    return llmCall(prompt, llmOpts)
      .then(result => ({
        seat: seat.id,
        seatTitle: `${seat.emoji} ${seat.title}`,
        result,
        status: 'ok',
      }))
      .catch(err => ({
        seat: seat.id,
        seatTitle: `${seat.emoji} ${seat.title}`,
        result: `[缺席: ${err.message}]`,
        status: 'absent',
        error: err.message,
      }));
  });

  let round1Results;
  if (parallel) {
    round1Results = await Promise.all(round1Tasks);
  } else {
    round1Results = [];
    for (const task of round1Tasks) {
      round1Results.push(await task);
    }
  }

  // ── Round 2: Cross-examination (serial) ──
  const round2Results = [];
  for (const seat of seats) {
    const prompt = round2Prompt(topic, round1Results, seat);
    try {
      const result = await llmCall(prompt, llmOpts);
      round2Results.push({
        seat: seat.id,
        seatTitle: `${seat.emoji} ${seat.title}`,
        result,
        status: 'ok',
      });
    } catch (err) {
      round2Results.push({
        seat: seat.id,
        seatTitle: `${seat.emoji} ${seat.title}`,
        result: `[缺席: ${err.message}]`,
        status: 'absent',
        error: err.message,
      });
    }
  }

  // ── Round 3: Final verdict (serial) ──
  let round3;
  const r3Prompt = round3Prompt(topic, round1Results, round2Results);
  try {
    const verdictText = await llmCall(r3Prompt, llmOpts);
    // Try to extract score from verdict text
    const scoreMatch = verdictText.match(/【综合评分】\s*([\d.]+)/);
    round3 = {
      verdict: verdictText,
      score: scoreMatch ? parseFloat(scoreMatch[1]) : null,
      status: 'ok',
    };
  } catch (err) {
    round3 = {
      verdict: `[裁决失败: ${err.message}]`,
      score: null,
      status: 'absent',
      error: err.message,
    };
  }

  return {
    topic,
    mode,
    rounds: {
      round1: round1Results,
      round2: round2Results,
      round3,
    },
    duration_ms: Date.now() - startTime,
    model,
  };
}

// ─── CLI Entry Point ────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--topic'   && argv[i + 1]) { args.topic   = argv[++i]; continue; }
    if (arg === '--context' && argv[i + 1]) { args.context = argv[++i]; continue; }
    if (arg === '--mode'    && argv[i + 1]) { args.mode    = argv[++i]; continue; }
    if (arg === '--model'   && argv[i + 1]) { args.model   = argv[++i]; continue; }
    if (arg === '--baseUrl' && argv[i + 1]) { args.baseUrl = argv[++i]; continue; }
    if (arg === '--apiKey'  && argv[i + 1]) { args.apiKey  = argv[++i]; continue; }
    if (arg === '--timeout' && argv[i + 1]) { args.timeout = parseInt(argv[++i], 10); continue; }
    if (arg === '--serial')                 { args.parallel = false; continue; }
    if (arg === '--help' || arg === '-h')   { args.help = true; continue; }
  }
  return args;
}

function printUsage() {
  console.log(`
凌霄阁-7人裁决神殿 v1.0 ⚡🏛️

Usage:
  node council.js --topic "议题" [--context "背景"] [--mode 7|5|3] [--model glm-5]

Options:
  --topic    议题（必填）
  --context  背景材料
  --mode     席位模式: 7（全席）, 5（精简）, 3（极限）  [default: 7]
  --model    LLM模型名                                  [default: glm-5]
  --baseUrl  LLM API基地址                               [default: GLM-5 endpoint]
  --apiKey   LLM API密钥（或设置 LLM_API_KEY 环境变量）
  --timeout  每次调用超时（毫秒）                         [default: 120000]
  --serial   Round 1 串行执行（默认并行）
  --help     显示帮助

Environment:
  LLM_API_KEY   — API密钥
  LLM_BASE_URL  — API基地址
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

  try {
    const result = await convene(args.topic, args.context || '', {
      mode:     args.mode,
      model:    args.model,
      apiKey:   args.apiKey,
      baseUrl:  args.baseUrl,
      parallel: args.parallel,
      timeout:  args.timeout,
    });

    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  }
}

// Run CLI only when executed directly
if (require.main === module) {
  main();
}

// ─── Exports ────────────────────────────────────────────────────────

module.exports = {
  SEATS,
  MERGED_SEATS,
  getSeatsForMode,
  round1Prompt,
  round2Prompt,
  round3Prompt,
  callLLM,
  convene,
  parseArgs,
};
