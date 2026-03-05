#!/usr/bin/env node
// =============================================================================
// check-rule-dedup.js — ISC规则去重门禁 v2.0
// =============================================================================
// 三维度语义去重：event交集快筛 → Claude Opus深检condition+action等价性
//
// 用法:
//   node check-rule-dedup.js <new_rule_file.json> [--rules-dir <path>] [--verbose]
//
// 退出码:
//   0 = 无重复（安全，可创建）
//   1 = 发现重复（需review）
//   2 = 参数错误/文件不存在
//   3 = API调用失败（默认放行，避免门禁卡死）
// =============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// 配置
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  claude: {
    baseUrl: 'https://api.penguinsaichat.dpdns.org',
    apiKey: (() => {
      if (process.env.CLAUDE_KEY_MAIN) return process.env.CLAUDE_KEY_MAIN;
      try {
        const cfg = JSON.parse(fs.readFileSync('/root/.openclaw/openclaw.json', 'utf8'));
        return cfg?.models?.providers?.claude?.apiKey || null;
      } catch (_) { return null; }
    })(),
    model: 'claude-opus-4-6',
    maxTokens: 1024,
    timeoutMs: 30_000,
  },
  defaultRulesDir: path.resolve(__dirname, '../rules'),
};

// 颜色
const C = {
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

// ─────────────────────────────────────────────────────────────────────────────
// 参数解析
// ─────────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { verbose: false, rulesDir: CONFIG.defaultRulesDir, file: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--verbose' || args[i] === '-v') opts.verbose = true;
    else if (args[i] === '--rules-dir' && args[i + 1]) opts.rulesDir = path.resolve(args[++i]);
    else if (!args[i].startsWith('--')) opts.file = path.resolve(args[i]);
  }
  return opts;
}

// ─────────────────────────────────────────────────────────────────────────────
// 规则解析工具
// ─────────────────────────────────────────────────────────────────────────────

/** 从规则JSON中提取events列表（扁平数组，去重） */
function extractEvents(rule) {
  const events = new Set();

  // trigger.events.L1 / L2 / L3（数组或对象）
  const te = rule?.trigger?.events;
  if (te) {
    if (Array.isArray(te)) {
      te.forEach(e => events.add(String(e)));
    } else if (typeof te === 'object') {
      Object.values(te).flat().forEach(e => events.add(String(e)));
    }
  }

  // trigger.conditions[].event_name
  const tc = rule?.trigger?.conditions;
  if (Array.isArray(tc)) {
    tc.forEach(c => { if (c.event_name) events.add(String(c.event_name)); });
  }

  // auto_trigger.on_events
  const ate = rule?.auto_trigger?.on_events;
  if (Array.isArray(ate)) {
    ate.forEach(e => events.add(String(e)));
  }

  return [...events];
}

/** 计算两个events列表的交集占比 (0~1) */
function eventOverlap(eventsA, eventsB) {
  if (!eventsA.length || !eventsB.length) return 0;
  const setA = new Set(eventsA);
  const setB = new Set(eventsB);
  const intersection = [...setA].filter(e => setB.has(e));
  const union = new Set([...setA, ...setB]);
  return intersection.length / union.size;
}

/** 提取规则的condition文本摘要（供LLM判断） */
function extractConditionSummary(rule) {
  const parts = [];

  // trigger.description
  if (rule?.trigger?.description) parts.push(rule.trigger.description);
  // trigger.condition（字符串）
  if (typeof rule?.trigger?.condition === 'string') parts.push(rule.trigger.condition);
  // trigger.conditions[]（结构化）
  if (Array.isArray(rule?.trigger?.conditions)) {
    rule.trigger.conditions.forEach(c => {
      parts.push(JSON.stringify(c));
    });
  }
  // condition字段（顶层）
  if (rule?.condition) parts.push(JSON.stringify(rule.condition));
  // description兜底
  if (!parts.length && rule?.description) parts.push(rule.description);

  return parts.join(' | ') || '(无condition信息)';
}

/** 提取规则的action摘要 */
function extractActionSummary(rule) {
  const a = rule?.action;
  if (!a) return '(无action)';
  const parts = [];
  if (a.type) parts.push(`type=${a.type}`);
  if (a.handler) parts.push(`handler=${a.handler}`);
  if (a.on_failure) parts.push(`on_failure=${a.on_failure}`);
  if (a.description) parts.push(a.description);
  // 嵌套结构压缩
  const rest = { ...a };
  ['type','handler','on_failure','description'].forEach(k => delete rest[k]);
  if (Object.keys(rest).length) parts.push(JSON.stringify(rest).slice(0, 200));
  return parts.join(', ') || JSON.stringify(a).slice(0, 200);
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude Opus 语义判断
// ─────────────────────────────────────────────────────────────────────────────

const DEDUP_PROMPT = (ruleA, ruleB) => `你是ISC规则系统的去重仲裁官。判断以下两条规则是否重复。

重复的判定标准（三维度必须同时满足）：
1. event重叠：监听的事件有实质交集（已由快筛确认）
2. condition等价：触发条件在逻辑上覆盖同一场景
3. action相同：最终执行的是同一件事（不要求handler名完全一致，看实际效果）

任何一个维度不同 = 不重复。

规则A（新建候选）:
- ID: ${ruleA.id || '?'}
- Description: ${ruleA.description || ruleA.rule_name || '?'}
- Events: ${JSON.stringify(extractEvents(ruleA))}
- Condition: ${extractConditionSummary(ruleA)}
- Action: ${extractActionSummary(ruleA)}

规则B（已有规则）:
- ID: ${ruleB.id || '?'}
- Description: ${ruleB.description || ruleB.rule_name || '?'}
- Events: ${JSON.stringify(extractEvents(ruleB))}
- Condition: ${extractConditionSummary(ruleB)}
- Action: ${extractActionSummary(ruleB)}

请严格输出JSON，不要加任何解释文字（只输出JSON）:
{
  "duplicate": true或false,
  "reason": "一句话说明判断依据",
  "dimensions": {
    "event_overlap": 0到1的数值（事件交集比例），
    "condition_equivalent": true或false,
    "action_equivalent": true或false
  }
}`;

async function callClaudeOpus(prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.claude.timeoutMs);

  try {
    const res = await fetch(`${CONFIG.claude.baseUrl}/v1/messages`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': CONFIG.claude.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: CONFIG.claude.model,
        max_tokens: CONFIG.claude.maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text || '';
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** 解析Claude输出的JSON，容错处理 */
function parseLLMResponse(text) {
  // 尝试直接解析
  try {
    return JSON.parse(text.trim());
  } catch (_) {}

  // 尝试提取```json块
  const match = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (match) {
    try { return JSON.parse(match[1]); } catch (_) {}
  }

  // 尝试找第一个{}块
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (_) {}
  }

  return null;
}

/** 深检单条候选规则是否与新规则语义重复 */
async function deepCheck(newRule, existingRule, verbose) {
  const prompt = DEDUP_PROMPT(newRule, existingRule);

  if (verbose) {
    console.error(C.dim(`  [LLM] 调用 Claude Opus 判断 ${existingRule.id || path.basename(existingRule._file || '')}...`));
  }

  const raw = await callClaudeOpus(prompt);

  if (verbose) {
    console.error(C.dim(`  [LLM] 原始响应: ${raw.slice(0, 300)}`));
  }

  const parsed = parseLLMResponse(raw);
  if (!parsed) {
    throw new Error(`LLM返回无法解析的JSON: ${raw.slice(0, 200)}`);
  }

  return {
    duplicate: Boolean(parsed.duplicate),
    reason: parsed.reason || '(无说明)',
    dimensions: {
      event_overlap: parsed.dimensions?.event_overlap ?? 0,
      condition_equivalent: Boolean(parsed.dimensions?.condition_equivalent),
      action_equivalent: Boolean(parsed.dimensions?.action_equivalent),
    },
    raw_response: raw,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv);

  // 参数检查
  if (!opts.file) {
    console.error(C.red('错误: 缺少参数'));
    console.error('用法: node check-rule-dedup.js <new_rule_file.json> [--rules-dir <path>] [--verbose]');
    process.exit(2);
  }
  if (!fs.existsSync(opts.file)) {
    console.error(C.red(`错误: 文件不存在: ${opts.file}`));
    process.exit(2);
  }
  if (!fs.existsSync(opts.rulesDir)) {
    console.error(C.red(`错误: 规则目录不存在: ${opts.rulesDir}`));
    process.exit(2);
  }

  // 读取新规则
  let newRule;
  try {
    newRule = JSON.parse(fs.readFileSync(opts.file, 'utf8'));
  } catch (e) {
    console.error(C.red(`错误: 无法解析新规则JSON: ${e.message}`));
    process.exit(2);
  }

  const newEvents = extractEvents(newRule);
  const newRuleAbs = path.resolve(opts.file);

  console.log(C.bold(C.cyan('═══════════════════════════════════════════════════════')));
  console.log(C.bold(C.cyan('  ISC规则去重门禁 v2.0 — 三维度语义比对')));
  console.log(C.bold(C.cyan('═══════════════════════════════════════════════════════')));
  console.log(`待检规则   : ${C.bold(path.basename(opts.file))}`);
  console.log(`规则ID     : ${C.bold(newRule.id || '(无ID)')}`);
  console.log(`监听事件   : ${C.bold(JSON.stringify(newEvents))}`);
  console.log(`规则目录   : ${opts.rulesDir}`);
  console.log('');

  // ── 阶段一：event快筛 ────────────────────────────────────────────────────
  console.log(C.bold('【阶段一】Event快筛 — 找出event有交集的候选规则'));
  console.log('─────────────────────────────────────────────────────────');

  if (newEvents.length === 0) {
    console.log(C.yellow('⚠  新规则无events，无法快筛，进入全量深检'));
  }

  const existingFiles = fs.readdirSync(opts.rulesDir)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .map(f => path.join(opts.rulesDir, f))
    .filter(f => path.resolve(f) !== newRuleAbs);

  const candidates = [];  // { file, rule, events, overlapRatio }
  let scanned = 0;

  for (const f of existingFiles) {
    let rule;
    try {
      rule = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (_) {
      if (opts.verbose) console.error(C.dim(`  跳过无法解析: ${path.basename(f)}`));
      continue;
    }

    scanned++;
    const existingEvents = extractEvents(rule);
    const overlap = eventOverlap(newEvents, existingEvents);
    rule._file = f;

    if (newEvents.length === 0 || overlap > 0) {
      candidates.push({ file: f, rule, events: existingEvents, overlapRatio: overlap });
      if (opts.verbose) {
        console.log(C.yellow(`  ⚡ 候选 [event交集=${(overlap * 100).toFixed(0)}%] ${path.basename(f)}`));
      }
    } else {
      if (opts.verbose) {
        console.log(C.dim(`  ✓ 放行 [无event交集] ${path.basename(f)}`));
      }
    }
  }

  console.log(`扫描规则: ${scanned} 条 | 候选规则: ${C.bold(candidates.length)} 条`);

  if (candidates.length === 0) {
    console.log('');
    console.log(C.green(C.bold('✅ 阶段一通过 — 无event交集规则，无需深检')));
    console.log('');
    outputFinalResult({ status: 'APPROVED', phase: 'fast_filter', duplicates: [], scanned, candidates: 0 });
    process.exit(0);
  }

  console.log('');

  // ── 阶段二：Claude Opus深检 ──────────────────────────────────────────────
  console.log(C.bold('【阶段二】Claude Opus深检 — condition + action语义等价判断'));
  console.log('─────────────────────────────────────────────────────────');

  const results = [];
  const duplicates = [];
  let apiFailures = 0;

  for (const candidate of candidates) {
    const label = path.basename(candidate.file);
    process.stdout.write(`  检查 ${C.bold(label)} [event交集=${(candidate.overlapRatio * 100).toFixed(0)}%] ... `);

    try {
      const check = await deepCheck(newRule, candidate.rule, opts.verbose);

      const dims = check.dimensions;
      const dimStr = [
        `event_overlap=${(dims.event_overlap * 100).toFixed(0)}%`,
        `condition_equiv=${dims.condition_equivalent ? '✓' : '✗'}`,
        `action_equiv=${dims.action_equivalent ? '✓' : '✗'}`,
      ].join(' | ');

      if (check.duplicate) {
        console.log(C.red(`⚠  重复`));
        console.log(C.red(`     → ${check.reason}`));
        console.log(C.dim(`     → [${dimStr}]`));
        duplicates.push({ file: candidate.file, id: candidate.rule.id, check });
      } else {
        console.log(C.green(`✓ 不重复`));
        console.log(C.dim(`     → ${check.reason}`));
        console.log(C.dim(`     → [${dimStr}]`));
      }

      results.push({
        file: candidate.file,
        rule_id: candidate.rule.id,
        event_overlap_ratio: candidate.overlapRatio,
        llm_judgment: check,
      });

    } catch (e) {
      console.log(C.yellow(`? API失败 (放行)`));
      console.log(C.yellow(`     → ${e.message}`));
      apiFailures++;
      results.push({
        file: candidate.file,
        rule_id: candidate.rule.id,
        event_overlap_ratio: candidate.overlapRatio,
        llm_judgment: null,
        api_error: e.message,
      });
    }
  }

  console.log('');
  console.log('─────────────────────────────────────────────────────────');

  // ── 最终判决 ─────────────────────────────────────────────────────────────
  if (duplicates.length > 0) {
    console.log(C.red(C.bold(`❌ 发现重复规则 (${duplicates.length}条)`)));
    console.log('');
    console.log(C.bold('重复规则详情:'));
    for (const d of duplicates) {
      console.log(`  • ${C.yellow(path.basename(d.file))}`);
      console.log(`    ID: ${d.id}`);
      console.log(`    原因: ${d.check.reason}`);
      const dims = d.check.dimensions;
      console.log(`    三维度: event_overlap=${(dims.event_overlap*100).toFixed(0)}% | condition=${dims.condition_equivalent?'等价':'不同'} | action=${dims.action_equivalent?'相同':'不同'}`);
    }
    console.log('');
    console.log(C.bold('建议操作:'));
    console.log('  A. 复用现有规则，放弃创建新规则');
    console.log('  B. 修改现有规则覆盖新需求');
    console.log('  C. 在新规则JSON中添加 "justification" 字段说明差异后强制创建');
    console.log('');

    outputFinalResult({
      status: 'BLOCKED',
      phase: 'deep_check',
      duplicates: duplicates.map(d => ({
        file: path.basename(d.file),
        rule_id: d.id,
        reason: d.check.reason,
        dimensions: d.check.dimensions,
      })),
      scanned,
      candidates: candidates.length,
      api_failures: apiFailures,
      all_results: results,
    });
    process.exit(1);

  } else if (apiFailures > 0 && apiFailures === candidates.length) {
    // 所有深检都API失败 → 安全放行但发出警告
    console.log(C.yellow(C.bold(`⚠  深检全部API失败（${apiFailures}/${candidates.length}），默认放行`)));
    console.log(C.yellow('   建议手动检查以下候选规则:'));
    candidates.forEach(c => console.log(`   • ${path.basename(c.file)}`));
    console.log('');
    outputFinalResult({
      status: 'APPROVED_WITH_WARNING',
      phase: 'deep_check_api_failed',
      duplicates: [],
      scanned,
      candidates: candidates.length,
      api_failures: apiFailures,
      warning: '所有LLM深检失败，已放行但需人工确认',
      manual_review: candidates.map(c => path.basename(c.file)),
    });
    process.exit(0);

  } else {
    console.log(C.green(C.bold('✅ 去重检查通过 — 无重复规则，允许创建')));
    if (apiFailures > 0) {
      console.log(C.yellow(`   (注: ${apiFailures}条深检API失败，已默认放行)`));
    }
    console.log('');
    outputFinalResult({
      status: 'APPROVED',
      phase: 'deep_check',
      duplicates: [],
      scanned,
      candidates: candidates.length,
      api_failures: apiFailures,
      all_results: results,
    });
    process.exit(0);
  }
}

function outputFinalResult(result) {
  console.log('DEDUP_RESULT_JSON:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(e => {
  console.error(C.red(`致命错误: ${e.message}`));
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(3);
});
