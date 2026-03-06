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

// ─── No direct LLM calls — prompts are generated, caller executes ──

// ─── Core Engine ────────────────────────────────────────────────────

/**
 * Generate all prompts for a Lingxiao Tribunal session.
 * Returns a structured plan of prompts; the caller (Agent) is responsible
 * for executing them via sessions_spawn or its own LLM capability.
 *
 * @param {string} topic          — The issue to deliberate
 * @param {string} context        — Background material
 * @param {object} [options]
 * @param {string} [options.mode='7']       — '7' | '5' | '3'
 * @returns {object} { topic, mode, seats, rounds } with prompt lists
 */
function convene(topic, context, options = {}) {
  const mode = String(options.mode || '7');
  if (!topic) throw new Error('Topic is required');

  const seats = getSeatsForMode(mode);

  // Round 1: Independent deliberation prompts (can be executed in parallel)
  const round1Prompts = seats.map(seat => ({
    seat: seat.id,
    seatTitle: `${seat.emoji} ${seat.title}`,
    prompt: round1Prompt(topic, context, seat),
  }));

  return {
    topic,
    mode,
    seats: seats.map(s => ({ id: s.id, title: s.title, emoji: s.emoji })),
    rounds: {
      round1: {
        prompts: round1Prompts,
        parallel: true,
        description: 'Round 1: 独立审议 — 各席并行生成观点',
      },
      // Round 2 & 3 prompts depend on Round 1 results.
      // Use buildRound2Prompts() and buildRound3Prompt() after Round 1 execution.
      round2: {
        description: 'Round 2: 交叉Battle — 需Round 1结果，调用 buildRound2Prompts(topic, round1Results, seats)',
      },
      round3: {
        description: 'Round 3: 终审裁决 — 需Round 1+2结果，调用 buildRound3Prompt(topic, round1Results, round2Results)',
      },
    },
    // NOTE: LLM执行由调用方（Agent）负责，此函数仅生成prompt
    _callLLM_note: '由调用方注入LLM能力 — 使用sessions_spawn或Agent自身模型执行prompt',
  };
}

/**
 * Build Round 2 prompts after Round 1 results are available.
 * @param {string} topic
 * @param {Array<{seat: string, seatTitle: string, result: string}>} round1Results
 * @param {string} mode — '7' | '5' | '3'
 * @returns {Array<{seat: string, seatTitle: string, prompt: string}>}
 */
function buildRound2Prompts(topic, round1Results, mode) {
  const seats = getSeatsForMode(mode || '7');
  return seats.map(seat => ({
    seat: seat.id,
    seatTitle: `${seat.emoji} ${seat.title}`,
    prompt: round2Prompt(topic, round1Results, seat),
  }));
}

/**
 * Build Round 3 prompt after Round 1 and Round 2 results are available.
 * @param {string} topic
 * @param {Array} round1Results
 * @param {Array} round2Results
 * @returns {{prompt: string}}
 */
function buildRound3Prompt(topic, round1Results, round2Results) {
  return {
    prompt: round3Prompt(topic, round1Results, round2Results),
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
    if (arg === '--timeout' && argv[i + 1]) { args.timeout = parseInt(argv[++i], 10); continue; }
    if (arg === '--serial')                 { args.parallel = false; continue; }
    if (arg === '--help' || arg === '-h')   { args.help = true; continue; }
  }
  return args;
}

function printUsage() {
  console.log(`
凌霄阁-7人裁决神殿 v2.0 ⚡🏛️ (prompt-only, no direct LLM calls)

Usage:
  node council.js --topic "议题" [--context "背景"] [--mode 7|5|3]

Outputs structured JSON with prompts for each round.
The calling Agent is responsible for executing prompts via sessions_spawn or its own model.

Options:
  --topic    议题（必填）
  --context  背景材料
  --mode     席位模式: 7（全席）, 5（精简）, 3（极限）  [default: 7]
  --help     显示帮助
`.trim());
}

function main() {
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
    const result = convene(args.topic, args.context || '', {
      mode: args.mode,
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
  convene,
  buildRound2Prompts,
  buildRound3Prompt,
  parseArgs,
};
