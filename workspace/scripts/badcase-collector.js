#!/usr/bin/env node
'use strict';

/**
 * badcase-collector.js — 端到端Badcase采集器
 *
 * 职责：
 * 1. collectBadcase(label, error, context) — 统一采集入口
 * 2. 自动分类错误类型（超时/逻辑错/依赖缺失/权限/配置/未知）
 * 3. 写入 memory/badcases/ （MemOS兼容，kind='badcase'）
 * 4. 写入 logs/badcases/ 目录备份
 * 5. 追加到 tests/badcases/ 索引
 * 6. 生成ISC规则改进建议
 *
 * 用法：
 *   const { collectBadcase } = require('./badcase-collector');
 *   collectBadcase('my-task-label', error, { taskId, agent, phase });
 *
 *   CLI: node badcase-collector.js <label> <error_message> [category]
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.WORKSPACE || '/root/.openclaw/workspace';
const MEMORY_BADCASES_DIR = path.join(WORKSPACE, 'memory', 'badcases');
const LOGS_BADCASES_DIR = path.join(WORKSPACE, 'logs', 'badcases');
const TESTS_BADCASES_DIR = path.join(WORKSPACE, 'tests', 'badcases');
const ISC_SUGGESTIONS_DIR = path.join(WORKSPACE, 'logs', 'isc-suggestions');

// ─── 错误分类规则 ───

const CATEGORY_RULES = [
  { category: 'timeout',        patterns: [/timeout/i, /timed?\s*out/i, /ETIMEDOUT/i, /deadline/i, /超时/] },
  { category: 'dependency',     patterns: [/ENOENT/i, /not found/i, /missing/i, /cannot find/i, /依赖缺失/, /module not found/i] },
  { category: 'permission',     patterns: [/EACCES/i, /permission/i, /forbidden/i, /403/, /权限/] },
  { category: 'config_error',   patterns: [/config/i, /invalid.*json/i, /parse error/i, /配置错误/, /ENOENT.*\.json/i] },
  { category: 'logic_error',    patterns: [/assert/i, /TypeError/i, /ReferenceError/i, /undefined is not/i, /逻辑错/, /null/i] },
  { category: 'network',        patterns: [/ECONNREFUSED/i, /ECONNRESET/i, /socket/i, /network/i, /fetch.*fail/i, /网络/] },
  { category: 'resource',       patterns: [/ENOMEM/i, /out of memory/i, /disk full/i, /quota/i, /资源不足/] },
  { category: 'role_violation',  patterns: [/role.*separation/i, /角色分离/, /violation/i] },
  { category: 'repeated_failure', patterns: [/retry.*exhaust/i, /max.*retries/i, /重复失败/] },
  { category: 'correction',     patterns: [/correction/i, /纠正/, /用户.*修正/] },
];

/**
 * 自动分类错误
 */
function classifyError(errorMsg) {
  if (!errorMsg) return 'uncategorized';
  const msg = String(errorMsg);
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some(p => p.test(msg))) {
      return rule.category;
    }
  }
  return 'uncategorized';
}

/**
 * 确保目录存在
 */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * 生成ISC规则改进建议
 */
function generateIscSuggestion(badcaseEntry) {
  const suggestions = {
    timeout:          { rule: 'ISC-TIMEOUT-GUARD', suggestion: '增加超时预检门禁，spawn前估算任务复杂度并设置合理timeout' },
    dependency:       { rule: 'ISC-DEPENDENCY-CHECK', suggestion: '增加依赖预检规则，执行前验证所需文件/模块存在' },
    permission:       { rule: 'ISC-PERMISSION-PREFLIGHT', suggestion: '增加权限预检规则，操作前验证文件/API权限' },
    config_error:     { rule: 'ISC-CONFIG-VALIDATE', suggestion: '增加配置校验门禁，修改配置后自动validate' },
    logic_error:      { rule: 'ISC-LOGIC-GUARD', suggestion: '增加关键路径断言，对核心函数入参做类型检查' },
    network:          { rule: 'ISC-NETWORK-RETRY', suggestion: '增加网络重试规则，对外部API调用增加指数退避重试' },
    resource:         { rule: 'ISC-RESOURCE-MONITOR', suggestion: '增加资源监控规则，执行前检查磁盘/内存余量' },
    role_violation:   { rule: 'ISC-ROLE-SEPARATION', suggestion: '强化角色分离规则，确保执行者和评审者不同' },
    repeated_failure: { rule: 'ISC-FAILURE-CIRCUIT-BREAKER', suggestion: '增加熔断规则，同类错误连续N次后暂停并上报' },
    correction:       { rule: 'ISC-CORRECTION-LEARN', suggestion: '将用户纠正转化为规则，避免同类问题再次发生' },
    uncategorized:    { rule: 'ISC-UNKNOWN-TRIAGE', suggestion: '新增错误分类规则，覆盖此类未知错误' },
  };
  return suggestions[badcaseEntry.category] || suggestions.uncategorized;
}

/**
 * 核心采集函数
 *
 * @param {string} label - 任务标签（如子Agent label）
 * @param {string|Error} error - 错误信息或Error对象
 * @param {Object} context - 上下文
 * @param {string} [context.taskId] - 任务ID
 * @param {string} [context.agent] - 执行Agent
 * @param {string} [context.phase] - PDCA阶段
 * @param {string} [context.category] - 手动指定分类（可选，不传则自动分类）
 * @param {string} [context.correctBehavior] - 正确行为描述
 * @param {string} [context.rootCause] - 根因
 * @returns {Object} { ok, badcaseId, category, paths }
 */
function collectBadcase(label, error, context = {}) {
  const errorMsg = error instanceof Error ? error.message : String(error || '');
  const errorStack = error instanceof Error ? error.stack : '';
  const now = new Date();
  const ts = now.toISOString();
  const dateStr = ts.slice(0, 10);
  const badcaseId = `bc-${dateStr}-${label}-${Date.now()}`;

  // 自动分类
  const category = context.category || classifyError(errorMsg);

  // 构造badcase记录
  const entry = {
    id: badcaseId,
    kind: 'badcase',
    label,
    category,
    severity: ['timeout', 'logic_error', 'role_violation'].includes(category) ? 'P1' : 'P2',
    error_message: errorMsg,
    error_stack: errorStack || undefined,
    task_id: context.taskId || undefined,
    agent: context.agent || undefined,
    phase: context.phase || undefined,
    correct_behavior: context.correctBehavior || undefined,
    root_cause: context.rootCause || undefined,
    timestamp: ts,
    harvested_at: ts,
  };

  // 生成ISC改进建议
  const iscSuggestion = generateIscSuggestion(entry);
  entry.isc_suggestion = iscSuggestion;

  const paths = {};

  try {
    // 1. 写入 memory/badcases/ （MemOS兼容）
    ensureDir(MEMORY_BADCASES_DIR);
    const memPath = path.join(MEMORY_BADCASES_DIR, `${badcaseId}.json`);
    fs.writeFileSync(memPath, JSON.stringify(entry, null, 2) + '\n');
    paths.memory = memPath;

    // 2. 写入 logs/badcases/ 备份
    ensureDir(LOGS_BADCASES_DIR);
    const logPath = path.join(LOGS_BADCASES_DIR, `${badcaseId}.json`);
    fs.writeFileSync(logPath, JSON.stringify(entry, null, 2) + '\n');
    paths.log = logPath;

    // 3. 追加到 tests/badcases/ 日索引
    ensureDir(TESTS_BADCASES_DIR);
    const indexPath = path.join(TESTS_BADCASES_DIR, `${dateStr}-collected.json`);
    let index = [];
    try { index = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch {}
    if (!Array.isArray(index)) index = [];
    // 去重
    if (!index.some(e => e.id === badcaseId)) {
      index.push(entry);
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
    }
    paths.index = indexPath;

    // 4. 写入ISC改进建议
    ensureDir(ISC_SUGGESTIONS_DIR);
    const suggPath = path.join(ISC_SUGGESTIONS_DIR, `${badcaseId}-suggestion.json`);
    fs.writeFileSync(suggPath, JSON.stringify({
      badcase_id: badcaseId,
      category,
      ...iscSuggestion,
      created_at: ts,
    }, null, 2) + '\n');
    paths.suggestion = suggPath;

    console.log(`[badcase-collector] ✅ ${badcaseId} | ${category} | ${label}`);
    return { ok: true, badcaseId, category, paths, entry };
  } catch (err) {
    console.error(`[badcase-collector] ❌ 写入失败: ${err.message}`);
    return { ok: false, badcaseId, category, error: err.message };
  }
}

// ─── CLI模式 ───

if (require.main === module) {
  const [label, errorMsg, category] = process.argv.slice(2);
  if (!label || !errorMsg) {
    console.error('用法: node badcase-collector.js <label> <error_message> [category]');
    process.exit(1);
  }
  const result = collectBadcase(label, errorMsg, { category: category || undefined });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

module.exports = { collectBadcase, classifyError, generateIscSuggestion };
