#!/usr/bin/env node
// =============================================================================
// batch-revalidate-v2.mjs — 批量验证已废弃规则（优化版）
// =============================================================================
// 三维度去重 + 智能预筛（避免无events规则调用LLM N*71次）
// =============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.resolve(__dirname, '..');

const DEPRECATED_DIR = path.join(BASE, 'rules/_deprecated');
const RULES_DIR = path.join(BASE, 'rules');
const OUTPUT_PATH = '/root/.openclaw/workspace/reports/isc-dedup-batch-raw.json';

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
  return parts.join(' | ') || '(无condition)';
}

function extractActionSummary(rule) {
  const a = rule?.action;
  if (!a) return '(无action)';
  const parts = [];
  if (a.type) parts.push(`type=${a.type}`);
  if (a.handler) parts.push(`handler=${a.handler}`);
  if (a.description) parts.push(a.description);
  const rest = { ...a };
  ['type','handler','on_failure','description'].forEach(k => delete rest[k]);
  if (Object.keys(rest).length) parts.push(JSON.stringify(rest).slice(0, 120));
  return parts.join(', ') || JSON.stringify(a).slice(0, 120);
}

/** 简单关键词重叠预筛（用于无events规则的快筛，避免LLM全量调用） */
function keywordOverlap(ruleA, ruleB) {
  const textA = [
    ruleA.description, ruleA.rule_name, ruleA.id,
    extractConditionSummary(ruleA), extractActionSummary(ruleA)
  ].join(' ').toLowerCase();
  const textB = [
    ruleB.description, ruleB.rule_name, ruleB.id,
    extractConditionSummary(ruleB), extractActionSummary(ruleB)
  ].join(' ').toLowerCase();

  // 提取有意义的词（4字符以上）
  const wordsA = new Set(textA.split(/\W+/).filter(w => w.length >= 4));
  const wordsB = new Set(textB.split(/\W+/).filter(w => w.length >= 4));
  const intersection = [...wordsA].filter(w => wordsB.has(w));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size > 0 ? intersection.length / union.size : 0;
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

重复标准（三维度同时满足）：
1. event重叠：监听的事件有实质交集
2. condition等价：触发条件覆盖同一场景
3. action相同：最终执行同一件事

规则A（废弃候选）:
- ID: ${depRule.id || '?'}
- Desc: ${depRule.description || depRule.rule_name || '?'}
- Events: ${JSON.stringify(extractEvents(depRule))}
- Condition: ${extractConditionSummary(depRule)}
- Action: ${extractActionSummary(depRule)}

规则B（活跃规则）:
- ID: ${activeRule.id || '?'}
- Desc: ${activeRule.description || activeRule.rule_name || '?'}
- Events: ${JSON.stringify(extractEvents(activeRule))}
- Condition: ${extractConditionSummary(activeRule)}
- Action: ${extractActionSummary(activeRule)}

仅输出JSON（无其他文字）:
{"duplicate":true或false,"reason":"一句话","dimensions":{"event_overlap":0到1,"condition_equivalent":true或false,"action_equivalent":true或false}}`;

  const raw = await callClaude(prompt);
  const parsed = parseJSON(raw);
  if (!parsed) throw new Error(`无法解析: ${raw.slice(0, 80)}`);
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

async function checkDeprecatedRule(depFile, activeRules) {
  const filePath = path.join(DEPRECATED_DIR, depFile);
  let depRule;
  try {
    depRule = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return { file: depFile, error: `解析失败: ${e.message}`, verdict: 'ERROR', duplicates: [] };
  }

  const depEvents = extractEvents(depRule);
  let candidates;
  let noEventsMode = false;

  if (depEvents.length > 0) {
    // 有events：用event交集快筛
    candidates = activeRules.filter(active => {
      const activeEvents = extractEvents(active);
      return eventOverlap(depEvents, activeEvents) > 0;
    });
  } else {
    // 无events：用关键词重叠预筛，只取重叠度>0.1的候选（最多10个）
    noEventsMode = true;
    const scored = activeRules.map(active => ({
      rule: active,
      score: keywordOverlap(depRule, active),
    })).filter(x => x.score > 0.1).sort((a, b) => b.score - a.score).slice(0, 10);
    candidates = scored.map(x => x.rule);
    console.log(`  [无events模式] 关键词预筛: ${candidates.length}候选 (来自${activeRules.length})`);
  }

  console.log(`  events=${JSON.stringify(depEvents)} candidates=${candidates.length}/${activeRules.length}${noEventsMode?' (keyword筛)':''}`);

  if (candidates.length === 0) {
    const reason = depEvents.length > 0 ? '与所有活跃规则无event交集' : '与所有活跃规则关键词相似度极低';
    console.log(`  → 无候选，判定：无重复`);
    return {
      file: depFile,
      id: depRule.id,
      description: depRule.description || depRule.rule_name,
      dep_events: depEvents,
      verdict: 'NO_DUPLICATE',
      reason,
      duplicates: [],
      candidates_checked: 0,
      no_events_mode: noEventsMode,
    };
  }

  // LLM深检
  const duplicatesFound = [];
  const details = [];
  let apiFailures = 0;

  for (const active of candidates) {
    try {
      const check = await checkDuplicate(depRule, active);
      details.push({ active_id: active.id, active_file: active._file, ...check });
      if (check.duplicate) {
        duplicatesFound.push({
          active_id: active.id,
          active_file: active._file,
          reason: check.reason,
          dimensions: check.dimensions,
        });
        console.log(`    ⚠ 重复 with ${active._file}: ${check.reason}`);
      }
    } catch (e) {
      console.log(`    ? API失败 ${active._file}: ${e.message}`);
      apiFailures++;
      details.push({ active_id: active.id, active_file: active._file, api_error: e.message });
    }
  }

  const verdict = duplicatesFound.length > 0 ? 'DUPLICATE_CONFIRMED' :
                  (apiFailures > 0 && apiFailures === candidates.length) ? 'API_FAILED' : 'NO_DUPLICATE';

  console.log(`  → ${verdict} (重复=${duplicatesFound.length}, API失败=${apiFailures})`);

  return {
    file: depFile,
    id: depRule.id,
    description: depRule.description || depRule.rule_name,
    dep_events: depEvents,
    verdict,
    duplicates: duplicatesFound,
    candidates_checked: candidates.length,
    api_failures: apiFailures,
    no_events_mode: noEventsMode,
    all_checks: details,
  };
}

async function main() {
  console.log('=== ISC废弃规则去重验证 v2 ===\n');

  const activeRules = loadActiveRules();
  console.log(`活跃规则: ${activeRules.length}条`);

  const depFiles = fs.readdirSync(DEPRECATED_DIR).filter(f => f.endsWith('.json'));
  console.log(`废弃规则: ${depFiles.length}条\n`);

  const results = [];

  for (let i = 0; i < depFiles.length; i++) {
    const f = depFiles[i];
    console.log(`\n[${i+1}/${depFiles.length}] ${f}`);
    const result = await checkDeprecatedRule(f, activeRules);
    results.push(result);
  }

  fs.mkdirSync('/root/.openclaw/workspace/reports', { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));

  const confirmed = results.filter(r => r.verdict === 'DUPLICATE_CONFIRMED');
  const noDup = results.filter(r => r.verdict === 'NO_DUPLICATE');
  const apiFailed = results.filter(r => r.verdict === 'API_FAILED');
  const errors = results.filter(r => r.verdict === 'ERROR');

  console.log(`\n\n=== 完成 ===`);
  console.log(`确认废弃: ${confirmed.length} | 可能误杀: ${noDup.length} | API失败: ${apiFailed.length} | 错误: ${errors.length}`);
  console.log(`结果: ${OUTPUT_PATH}`);

  if (noDup.length > 0) {
    console.log(`\n可能误杀:`);
    noDup.forEach(r => console.log(`  - ${r.file}`));
  }
}

main().catch(e => {
  console.error(`致命错误: ${e.message}`);
  process.exit(1);
});
