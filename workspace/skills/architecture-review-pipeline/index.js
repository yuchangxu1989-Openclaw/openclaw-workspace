#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const STATES = {
  DRAFT: 'draft',
  ENGINEERING_REVIEW: 'engineering_review',
  QA_REVIEW: 'qa_review',
  TRIBUNAL: 'tribunal',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

const DEFAULT_CONFIG = {
  reviewers: {
    engineer: { agentId: 'engineer' },
    qa: { agentId: 'qa-analyst' },
    tribunal: { agentId: 'caijuedian-tribunal' }
  },
  thinking: 'high',
  model: undefined,
  timeoutSeconds: 900,
  runTimeoutSeconds: 600
};

function now() {
  return new Date().toISOString();
}

function pushTimeline(timeline, from, to, note) {
  timeline.push({ at: now(), from, to, note });
}

function parseArgs(argv) {
  let designDocPath;
  let configPath;
  let configJson;
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--design-doc' || a === '--designDocPath') {
      designDocPath = argv[++i];
    } else if (a === '--config') {
      configPath = argv[++i];
    } else if (a === '--config-json') {
      configJson = argv[++i];
    }
  }
  if (!designDocPath) {
    throw new Error('缺少必填参数：--design-doc <path>');
  }

  let userConfig = {};
  if (configPath) {
    userConfig = JSON.parse(fs.readFileSync(path.resolve(configPath), 'utf8'));
  }
  if (configJson) {
    userConfig = { ...userConfig, ...JSON.parse(configJson) };
  }

  return { designDocPath, userConfig };
}

function deepMerge(base, ext) {
  if (!ext || typeof ext !== 'object') return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(ext)) {
    const bv = out[k];
    const ev = ext[k];
    if (bv && ev && typeof bv === 'object' && typeof ev === 'object' && !Array.isArray(bv) && !Array.isArray(ev)) {
      out[k] = deepMerge(bv, ev);
    } else {
      out[k] = ev;
    }
  }
  return out;
}

function loadDesignDoc(designDocPath) {
  const full = path.resolve(designDocPath);
  const content = fs.readFileSync(full, 'utf8');
  return { fullPath: full, content };
}

async function spawnReview({ roleName, agentId, designDoc, config }) {
  const task = [
    `你是${roleName}，请对以下架构设计进行严格评审。`,
    '请输出 JSON（不要包裹在代码块中）：',
    '{"verdict":"PASS|FAIL","summary":"...","issues":["..."],"suggestions":["..."]}',
    '要求：verdict 必须显式为 PASS 或 FAIL。',
    `文档路径: ${designDoc.fullPath}`,
    '文档正文如下：',
    designDoc.content
  ].join('\n');

  const payload = {
    runtime: 'subagent',
    mode: 'run',
    agentId,
    task,
    thinking: config.thinking || 'high',
    model: config.model,
    timeoutSeconds: config.timeoutSeconds,
    runTimeoutSeconds: config.runTimeoutSeconds,
    cleanup: 'delete',
    thread: false,
    sandbox: 'inherit',
    cwd: process.cwd(),
    label: `architecture-${roleName}-review`
  };

  if (typeof globalThis.sessions_spawn !== 'function') {
    throw new Error('当前运行环境未注入 sessions_spawn 工具函数。');
  }
  return globalThis.sessions_spawn(payload);
}

function tryParseJson(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch (__) {
      return null;
    }
  }
}

function normalizeReview(result, fallbackRole) {
  const raw = typeof result === 'string' ? result : JSON.stringify(result);
  const parsed = tryParseJson(raw) || {};
  const verdictRaw = String(parsed.verdict || '').toUpperCase();
  const verdict = verdictRaw === 'PASS' ? 'PASS' : 'FAIL';
  return {
    role: fallbackRole,
    verdict,
    summary: parsed.summary || raw,
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    raw
  };
}

async function runPipeline(designDocPath, userConfig = {}) {
  const config = deepMerge(DEFAULT_CONFIG, userConfig);
  const timeline = [];
  let state = STATES.DRAFT;
  const designDoc = loadDesignDoc(designDocPath);

  pushTimeline(timeline, null, STATES.DRAFT, '创建评审流程');

  state = STATES.ENGINEERING_REVIEW;
  pushTimeline(timeline, STATES.DRAFT, STATES.ENGINEERING_REVIEW, '自动派发工程复审');

  const engineeringPromise = spawnReview({
    roleName: '工程师',
    agentId: config.reviewers.engineer.agentId,
    designDoc,
    config
  });

  state = STATES.QA_REVIEW;
  pushTimeline(timeline, STATES.ENGINEERING_REVIEW, STATES.QA_REVIEW, '自动并行派发质量复审');

  const qaPromise = spawnReview({
    roleName: '质量分析师',
    agentId: config.reviewers.qa.agentId,
    designDoc,
    config
  });

  const [engineeringRaw, qaRaw] = await Promise.all([engineeringPromise, qaPromise]);
  const engineering = normalizeReview(engineeringRaw, 'engineering');
  const qa = normalizeReview(qaRaw, 'qa');

  const allIssues = [...engineering.issues, ...qa.issues];
  const bothPass = engineering.verdict === 'PASS' && qa.verdict === 'PASS';

  if (!bothPass) {
    state = STATES.REJECTED;
    pushTimeline(timeline, STATES.QA_REVIEW, STATES.REJECTED, '复审不通过，自动打回');
    return {
      state,
      timeline,
      reviews: { engineering, qa },
      issues: allIssues,
      result: STATES.REJECTED,
      finalDecision: '复审未通过，建议打回架构师修订后重新提交。'
    };
  }

  state = STATES.TRIBUNAL;
  pushTimeline(timeline, STATES.QA_REVIEW, STATES.TRIBUNAL, '双复审通过，进入裁决殿终审');

  const tribunalRaw = await spawnReview({
    roleName: '裁决殿终审团',
    agentId: config.reviewers.tribunal.agentId,
    designDoc,
    config
  });
  const tribunal = normalizeReview(tribunalRaw, 'tribunal');

  if (tribunal.verdict === 'PASS') {
    state = STATES.APPROVED;
    pushTimeline(timeline, STATES.TRIBUNAL, STATES.APPROVED, '终审通过');
  } else {
    state = STATES.REJECTED;
    pushTimeline(timeline, STATES.TRIBUNAL, STATES.REJECTED, '终审不通过');
  }

  return {
    state,
    timeline,
    reviews: { engineering, qa },
    tribunal,
    issues: state === STATES.REJECTED ? [...allIssues, ...tribunal.issues] : [],
    result: state,
    finalDecision:
      state === STATES.APPROVED
        ? '终审通过，建议用户裁决为通过并进入实施阶段。'
        : '终审未通过，建议用户裁决为驳回并要求修订。'
  };
}

async function main() {
  const { designDocPath, userConfig } = parseArgs(process.argv);
  const output = await runPipeline(designDocPath, userConfig);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${err.stack || err.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  STATES,
  DEFAULT_CONFIG,
  runPipeline
};
