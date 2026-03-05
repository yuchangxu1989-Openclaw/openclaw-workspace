#!/usr/bin/env node
// =============================================================================
// batch-revalidate.mjs — 批量验证已废弃规则
// =============================================================================
// 对 rules/_deprecated/ 下每条规则，与当前活跃 rules/ 做三维度去重检测
// 直接复用 check-rule-dedup.js 的核心逻辑（内联，避免子进程开销）
// =============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.resolve(__dirname, '..');

const DEPRECATED_DIR = path.join(BASE, 'rules/_deprecated');
const RULES_DIR = path.join(BASE, 'rules');
const OUTPUT_PATH = '/root/.openclaw/workspace/reports/isc-dedup-batch-raw.json';

// ─── Claude API配置 (与check-rule-dedup.js保持一致) ────────────────────────
const CLAUDE_CONFIG = {
  baseUrl: 'https://api.penguinsaichat.dpdns.org',
  apiKey: 'REDACTED_CLAUDE_API_KEY',
  model: 'claude-opus-4-6',
  maxTokens: 512,
  timeoutMs: 30_000,
};

// ─── 工具函数 ────────────────────────────────────────────────────────────────

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

function extractConditionSummary(rule) {
  const parts = [];
  if (rule?.trigger?.description) parts.push(rule.trigger.description);
  if (typeof rule?.trigger?.condition === 'string') parts.push(rule.trigger.condition);
  if (Array.isArray(rule?.trigger?.conditions)) {
    rule.trigger.conditions.forEach(c => parts.push(JSON.stringify(c)));
  }
  if (rule?.condition) parts.push(JSON.stringify(rule.condition));
  if (!parts.length && rule?.description) parts.push(rule.description);
  return parts.join(' | ') || '(无condition信息)';
}

function extractActionSummary(rule) {
  const a = rule?.action;
  if (!a) return '(无action)';
  const parts = [];
  if (a.type) parts.push(`type=${a.type}`);
  if (a.handler) parts.push(`handler=${a.handler}`);
  if (a.on_failure) parts.push(`on_failure=${a.on_failure}`);
  if (a.description) parts.push(a.description);
  const rest = { ...a };
  ['type','handler','on_failure','description'].forEach(k => delete rest[k]);
  if (Object.keys(rest).length) parts.push(JSON.stringify(rest).slice(0, 150));
  return parts.join(', ') || JSON.stringify(a).slice(0, 150);
}

async function callClaude(prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLAUDE_CONFIG.timeoutMs);
  try {
    const res = await fetch(`${CLAUDE_CONFIG.baseUrl}/v1/messages`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': CLAUDE_CONFIG.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: CLAUDE_CONFIG.model,
        max_tokens: CLAUDE_CONFIG.maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data?.content?.[0]?.text || '';
  } finally {
    clearTimeout(timer);
  }
}

function parseJSON(text) {
  try { return JSON.parse(text.trim()); } catch (_) {}
  const m = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (m) { try { return JSON.parse(m[1]); } catch (_) {} }
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s !== -1 && e !== -1) { try { return JSON.parse(text.slice(s, e+1)); } catch (_) {} }
  return null;
}

async function checkDuplicate(depRule, activeRule) {
  const prompt = `你是ISC规则系统的去重仲裁官。判断以下两条规则是否重复。

重复的判定标准（三维度必须同时满足）：
1. event重叠：监听的事件有实质交集
2. condition等价：触发条件在逻辑上覆盖同一场景
3. action相同：最终执行的是同一件事

规则A（已废弃的规则，待验证）:
- ID: ${depRule.id || '?'}
- Description: ${depRule.description || depRule.rule_name || '?'}
- Events: ${JSON.stringify(extractEvents(depRule))}
- Condition: ${extractConditionSummary(depRule)}
- Action: ${extractActionSummary(depRule)}

规则B（当前活跃规则）:
- ID: ${activeRule.id || '?'}
- Description: ${activeRule.description || activeRule.rule_name || '?'}
- Events: ${JSON.stringify(extractEvents(activeRule))}
- Condition: ${extractConditionSummary(activeRule)}
- Action: ${extractActionSummary(activeRule)}

严格输出JSON（无其他文字）:
{"duplicate":true或false,"reason":"一句话判断依据","dimensions":{"event_overlap":0到1,"condition_equivalent":true或false,"action_equivalent":true或false}}`;

  const raw = await callClaude(prompt);
  const parsed = parseJSON(raw);
  if (!parsed) throw new Error(`无法解析LLM响应: ${raw.slice(0, 100)}`);
  return {
    duplicate: Boolean(parsed.duplicate),
    reason: parsed.reason || '(无)',
    dimensions: {
      event_overlap: parsed.dimensions?.event_overlap ?? 0,
      condition_equivalent: Boolean(parsed.dimensions?.condition_equivalent),
      action_equivalent: Boolean(parsed.dimensions?.action_equivalent),
    },
  };
}

// ─── 加载活跃规则 ────────────────────────────────────────────────────────────

function loadActiveRules() {
  return fs.readdirSync(RULES_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .map(f => {
      try {
        const rule = JSON.parse(fs.readFileSync(path.join(RULES_DIR, f), 'utf8'));
        rule._file = f;
        return rule;
      } catch (_) { return null; }
    })
    .filter(Boolean);
}

// ─── 检测单条废弃规则 ────────────────────────────────────────────────────────

async function checkDeprecatedRule(depFile, activeRules) {
  const filePath = path.join(DEPRECATED_DIR, depFile);
  let depRule;
  try {
    depRule = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return { file: depFile, error: `解析失败: ${e.message}`, verdict: 'ERROR', duplicates: [] };
  }

  const depEvents = extractEvents(depRule);
  
  // 阶段一：event快筛
  const candidates = activeRules.filter(active => {
    const activeEvents = extractEvents(active);
    return depEvents.length === 0 || eventOverlap(depEvents, activeEvents) > 0;
  });

  console.log(`  [${depFile}] events=${JSON.stringify(depEvents)} candidates=${candidates.length}/${activeRules.length}`);

  if (candidates.length === 0) {
    console.log(`  → 无event交集，判定：无重复（可能误杀）`);
    return {
      file: depFile,
      id: depRule.id,
      description: depRule.description || depRule.rule_name,
      dep_events: depEvents,
      verdict: 'NO_DUPLICATE',
      reason: '与所有活跃规则无event交集',
      duplicates: [],
      candidates_checked: 0,
    };
  }

  // 阶段二：LLM深检（串行，避免并发限速）
  const duplicatesFound = [];
  const details = [];
  let apiFailures = 0;

  for (const active of candidates) {
    try {
      const check = await checkDuplicate(depRule, active);
      details.push({ active_id: active.id, active_file: active._file, ...check });
      if (check.duplicate) {
        duplicatesFound.push({ active_id: active.id, active_file: active._file, reason: check.reason, dimensions: check.dimensions });
        console.log(`    ⚠ 重复 with ${active._file}: ${check.reason}`);
        // 找到一个重复就足够确认废弃，但继续检查其他候选（为了完整报告）
      }
    } catch (e) {
      console.log(`    ? API失败 checking ${active._file}: ${e.message}`);
      apiFailures++;
      details.push({ active_id: active.id, active_file: active._file, api_error: e.message });
    }
  }

  const verdict = duplicatesFound.length > 0 ? 'DUPLICATE_CONFIRMED' :
                  apiFailures === candidates.length ? 'API_FAILED' : 'NO_DUPLICATE';

  console.log(`  → 判定: ${verdict} (重复=${duplicatesFound.length}, API失败=${apiFailures})`);

  return {
    file: depFile,
    id: depRule.id,
    description: depRule.description || depRule.rule_name,
    dep_events: depEvents,
    verdict,
    duplicates: duplicatesFound,
    candidates_checked: candidates.length,
    api_failures: apiFailures,
    all_checks: details,
  };
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== ISC废弃规则去重验证 ===');
  console.log(`废弃目录: ${DEPRECATED_DIR}`);
  console.log(`活跃规则目录: ${RULES_DIR}`);

  const activeRules = loadActiveRules();
  console.log(`\n加载活跃规则: ${activeRules.length}条\n`);

  const depFiles = fs.readdirSync(DEPRECATED_DIR).filter(f => f.endsWith('.json'));
  console.log(`待验证废弃规则: ${depFiles.length}条\n`);

  const results = [];

  for (let i = 0; i < depFiles.length; i++) {
    const f = depFiles[i];
    console.log(`\n[${i+1}/${depFiles.length}] 检查: ${f}`);
    const result = await checkDeprecatedRule(f, activeRules);
    results.push(result);
  }

  // 保存原始结果
  fs.mkdirSync('/root/.openclaw/workspace/reports', { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
  console.log(`\n\n=== 完成 ===`);
  console.log(`原始结果已保存到: ${OUTPUT_PATH}`);

  // 统计
  const confirmed = results.filter(r => r.verdict === 'DUPLICATE_CONFIRMED');
  const noDup = results.filter(r => r.verdict === 'NO_DUPLICATE');
  const apiFailed = results.filter(r => r.verdict === 'API_FAILED');
  const errors = results.filter(r => r.verdict === 'ERROR');

  console.log(`\n统计:`);
  console.log(`  确认废弃正确 (重复): ${confirmed.length}`);
  console.log(`  可能误杀 (无重复): ${noDup.length}`);
  console.log(`  API全失败: ${apiFailed.length}`);
  console.log(`  文件错误: ${errors.length}`);

  if (noDup.length > 0) {
    console.log(`\n可能误杀的规则:`);
    noDup.forEach(r => console.log(`  - ${r.file} (${r.description || r.id})`));
  }
}

main().catch(e => {
  console.error(`致命错误: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
