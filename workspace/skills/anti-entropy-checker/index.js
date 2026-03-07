#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function readInput({ text, filePath }) {
  if (text && String(text).trim()) return String(text);
  if (!filePath) throw new Error('Missing input: provide text or path');
  return fs.readFileSync(filePath, 'utf8');
}

function normalizeType(type, filePath = '') {
  if (type && type !== 'auto') return type;
  const p = (filePath || '').toLowerCase();
  if (p.endsWith('.json')) return 'rule';
  if (p.endsWith('skill.md')) return 'skill';
  return 'design';
}

function addViolation(arr, dimension, severity, message, evidence, suggestion) {
  arr.push({ dimension, severity, message, evidence, suggestion });
}

function checkScalability(content, violations) {
  let score = 25;
  const patterns = [
    { re: /\b(max|limit|timeout|retry)\s*[:=]\s*\d{1,3}\b/gi, msg: '疑似硬编码阈值，10x规模可能失效' },
    { re: /if\s*\([^\)]*===?\s*['"][^'"]+['"]\)/gi, msg: '枚举式条件分支偏多，扩展性风险' },
    { re: /TODO\s*:\s*scale|暂不考虑扩展|先写死/gi, msg: '显式承认暂不扩展，存在10x风险' }
  ];
  for (const p of patterns) {
    const m = content.match(p.re);
    if (m && m.length) {
      score -= Math.min(8, m.length * 2);
      addViolation(violations, 'scalability', 'high', p.msg, m.slice(0, 3), '抽象配置/分层扩展点，避免写死与枚举分支');
    }
  }
  return Math.max(0, score);
}

function checkGeneralizability(content, violations) {
  let score = 25;
  const bad = [
    /仅适用于|只针对|临时方案|一次性|quick fix/gi,
    /for\s+this\s+case\s+only|one-off/gi
  ];
  bad.forEach((re) => {
    const m = content.match(re);
    if (m && m.length) {
      score -= Math.min(10, m.length * 3);
      addViolation(violations, 'generalizability', 'medium', '方案偏单点修复，泛化不足', m.slice(0, 3), '补充问题分类、适用边界与可复用抽象');
    }
  });

  if (!/抽象|通用|复用|接口|模式|模板|rule|handler|pipeline/gi.test(content)) {
    score -= 8;
    addViolation(violations, 'generalizability', 'medium', '缺少通用抽象信号', ['未检出抽象/复用关键词'], '补充接口化设计与复用机制');
  }
  return Math.max(0, score);
}

function checkGrowability(content, violations) {
  let score = 25;
  if (!/index\.js|\.json|规则|rule|handler|自动|脚本|pipeline|测试|test/gi.test(content)) {
    score -= 15;
    addViolation(violations, 'growability', 'high', '知识未明显沉淀为可执行资产', ['缺少规则/代码/自动化信号'], '将经验固化为规则、脚本、检查器与测试');
  }
  if (/建议|原则|思路/.test(content) && !/步骤|执行|命令|实现|函数|代码/.test(content)) {
    score -= 8;
    addViolation(violations, 'growability', 'medium', '偏理念描述，执行闭环不足', ['原则性词汇多，执行词汇少'], '补充可执行步骤与可验证输出');
  }
  return Math.max(0, score);
}

function checkEntropyDirection(content, violations) {
  let score = 25;
  const repeated = content.match(/([A-Za-z_][\w-]{2,})\b(?:[\s\S]*?\b\1\b){4,}/g);
  if (repeated && repeated.length) {
    score -= 6;
    addViolation(violations, 'entropy_direction', 'low', '存在潜在重复与冗余表达', repeated.slice(0, 2), '提炼公共模块，减少重复描述/实现');
  }

  const hasCamel = /\b[a-z]+[A-Z][A-Za-z]*\b/.test(content);
  const hasSnake = /\b[a-z]+_[a-z0-9_]+\b/.test(content);
  const hasKebab = /\b[a-z]+-[a-z0-9-]+\b/.test(content);
  const styleCount = [hasCamel, hasSnake, hasKebab].filter(Boolean).length;
  if (styleCount >= 3) {
    score -= 8;
    addViolation(violations, 'entropy_direction', 'medium', '命名风格混杂，系统有序性下降', ['camelCase + snake_case + kebab-case'], '明确单一命名规范并统一迁移');
  }

  if (/重复代码|命名不一致|耦合|冲突|混乱/gi.test(content)) {
    score -= 5;
    addViolation(violations, 'entropy_direction', 'medium', '文本中已出现熵增风险提示', ['检出“重复/耦合/混乱/冲突”等关键词'], '先治理结构与命名，再叠加功能');
  }
  return Math.max(0, score);
}

function evaluate(input) {
  const { text, path: filePath, type = 'auto', strict = true } = input || {};
  const content = readInput({ text, filePath });
  const docType = normalizeType(type, filePath);
  const violations = [];

  const s1 = checkScalability(content, violations);
  const s2 = checkGeneralizability(content, violations);
  const s3 = checkGrowability(content, violations);
  const s4 = checkEntropyDirection(content, violations);

  const score = s1 + s2 + s3 + s4;
  const hardFail = violations.some((v) => v.severity === 'high');
  const passLine = strict ? 80 : 70;
  const pass = score >= passLine && !hardFail;

  return {
    ok: true,
    type: docType,
    score,
    pass,
    passLine,
    dimensionScores: {
      scalability: s1,
      generalizability: s2,
      growability: s3,
      entropy_direction: s4
    },
    violations,
    summary: pass
      ? '通过反熵增门控：当前变更整体趋向有序，可继续推进。'
      : '未通过反熵增门控：存在熵增风险，请按违规建议整改后再提交。'
  };
}

function handler(event) {
  const payload = (event && event.payload) || event || {};
  const result = evaluate(payload);

  // [Gap4] 发布反熵事件到 L3 EventBus
  try {
    const busPath = require('path').join(__dirname, '..', '..', 'infrastructure', 'event-bus', 'bus-adapter.js');
    const bus = require(busPath);
    if (result && !result.pass) {
      bus.emit('anti.entropy.issue.detected', {
        score: result.score,
        violations_count: (result.violations || []).length,
        violations: (result.violations || []).slice(0, 3), // 最多3条
        source_path: payload.filePath || payload.path || 'unknown',
      }, 'anti-entropy-checker');
    } else if (result && result.pass && (result.violations || []).length === 0) {
      // 清洁通过 — 不发事件，避免噪声
    } else if (result && result.pass) {
      // 有轻微问题但通过
      bus.emit('anti.entropy.fix.applied', {
        score: result.score,
        violations_count: (result.violations || []).length,
        source_path: payload.filePath || payload.path || 'unknown',
      }, 'anti-entropy-checker');
    }
  } catch (_) {
    // bus不可用时静默降级，不影响主流程
  }

  return result;
}

function parseArgv(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--path') out.path = argv[++i];
    else if (a === '--type') out.type = argv[++i];
    else if (a === '--text') out.text = argv[++i];
    else if (a === '--strict') out.strict = argv[++i] !== 'false';
  }
  return out;
}

if (require.main === module) {
  try {
    const args = parseArgv(process.argv);
    const result = evaluate(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.pass ? 0 : 2);
  } catch (err) {
    process.stderr.write(`[anti-entropy-checker] ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { evaluate, handler };
