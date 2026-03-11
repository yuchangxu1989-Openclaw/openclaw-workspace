'use strict';

/**
 * quality-audit — 统一质量审计技能
 * 三大组件：auto-qa | isc-audit | completion-review
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE
  || path.join(process.env.OPENCLAW_HOME || '/root/.openclaw', 'workspace');
const ISC_RULES_DIR = path.join(WORKSPACE, 'skills/isc-core/rules');
const HANDLERS_DIR = path.join(WORKSPACE, 'skills/isc-core/handlers');
const REPORTS_DIR = path.join(WORKSPACE, 'reports/quality-audit');

// ─── 工具函数 ───

function sh(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      timeout: opts.timeout || 15000,
      cwd: opts.cwd || WORKSPACE,
    }).trim();
  } catch (e) {
    return opts.fallback !== undefined ? opts.fallback : '';
  }
}

function writeReport(name, data) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(REPORTS_DIR, `${name}-${ts}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return filePath;
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

// ═══════════════════════════════════════════════════════════
// 模式1: Auto-QA — 子Agent完成时自动审计
// ═══════════════════════════════════════════════════════════

async function autoQA(input, logger) {
  const agentId = input.agentId || 'unknown';
  const taskLabel = input.taskLabel || input.label || 'unknown';
  const sessionKey = input.sessionKey || '';
  const status = input.status || 'completed';

  logger.info?.(`[auto-qa] 审计 agent=${agentId} task=${taskLabel}`);

  const checks = [];

  // ── Check 1: 是否有实际文件变更（git diff验证）──
  const diffStat = sh(`git diff --stat HEAD~1 HEAD 2>/dev/null || git diff --stat HEAD 2>/dev/null`);
  const diffFiles = diffStat ? diffStat.split('\n').filter(l => l.includes('|')).map(l => l.split('|')[0].trim()) : [];
  const hasChanges = diffFiles.length > 0;
  checks.push({
    name: 'has_file_changes',
    ok: hasChanges,
    severity: 'high',
    message: hasChanges
      ? `检测到 ${diffFiles.length} 个文件变更`
      : '⚠️ 无文件变更 — 子Agent可能空转',
    details: hasChanges ? diffFiles.slice(0, 20) : [],
  });

  // ── Check 2: 最近commit是否存在且合理 ──
  const lastCommit = sh(`git log -1 --format="%H|%s|%ai" 2>/dev/null`);
  const hasCommit = lastCommit.length > 10;
  let commitAge = 0;
  if (hasCommit) {
    const parts = lastCommit.split('|');
    const commitTime = new Date(parts[2]);
    commitAge = (Date.now() - commitTime.getTime()) / 1000 / 60; // minutes
  }
  const commitRecent = hasCommit && commitAge < 30; // 30分钟内
  checks.push({
    name: 'recent_commit_exists',
    ok: commitRecent,
    severity: 'medium',
    message: commitRecent
      ? `最近commit在 ${Math.round(commitAge)} 分钟前`
      : hasCommit
        ? `最近commit在 ${Math.round(commitAge)} 分钟前（超过30分钟，可能不是本次任务的）`
        : '无commit记录',
  });

  // ── Check 3: 变更文件中是否有语法问题（检查常见错误模式）──
  let syntaxIssues = [];
  for (const f of diffFiles.slice(0, 10)) {
    const fullPath = path.join(WORKSPACE, f);
    if (!fs.existsSync(fullPath)) continue;

    if (f.endsWith('.js') || f.endsWith('.mjs')) {
      // 检查JS语法
      const syntaxCheck = sh(`node -c "${fullPath}" 2>&1`, { fallback: 'error' });
      if (syntaxCheck.includes('SyntaxError') || syntaxCheck === 'error') {
        syntaxIssues.push({ file: f, issue: 'JavaScript语法错误' });
      }
    }
    if (f.endsWith('.json')) {
      const json = readJson(fullPath);
      if (json === null) {
        syntaxIssues.push({ file: f, issue: 'JSON解析失败' });
      }
    }
    if (f.endsWith('.sh')) {
      const bashCheck = sh(`bash -n "${fullPath}" 2>&1`, { fallback: 'error' });
      if (bashCheck && bashCheck !== '') {
        syntaxIssues.push({ file: f, issue: `Shell语法: ${bashCheck.slice(0, 100)}` });
      }
    }
  }
  checks.push({
    name: 'no_syntax_errors',
    ok: syntaxIssues.length === 0,
    severity: 'high',
    message: syntaxIssues.length === 0
      ? '变更文件无语法错误'
      : `发现 ${syntaxIssues.length} 个语法问题`,
    details: syntaxIssues,
  });

  // ── Check 4: 是否有TODO/FIXME占位符残留 ──
  let placeholders = [];
  for (const f of diffFiles.slice(0, 10)) {
    const fullPath = path.join(WORKSPACE, f);
    if (!fs.existsSync(fullPath)) continue;
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (/TODO.*实现|FIXME|PLACEHOLDER|骨架|stub/i.test(line)) {
          placeholders.push({ file: f, line: i + 1, text: line.trim().slice(0, 80) });
        }
      });
    } catch {}
  }
  checks.push({
    name: 'no_placeholder_code',
    ok: placeholders.length === 0,
    severity: 'medium',
    message: placeholders.length === 0
      ? '无占位符/骨架代码残留'
      : `发现 ${placeholders.length} 处占位符残留`,
    details: placeholders.slice(0, 10),
  });

  // ── Check 5: 是否修改了禁止文件（openclaw.json等）──
  const forbiddenFiles = ['openclaw.json', '.env', 'package-lock.json'];
  const forbiddenChanges = diffFiles.filter(f => forbiddenFiles.some(fb => f.endsWith(fb)));
  checks.push({
    name: 'no_forbidden_file_changes',
    ok: forbiddenChanges.length === 0,
    severity: 'critical',
    message: forbiddenChanges.length === 0
      ? '未修改禁止文件'
      : `⛔ 修改了禁止文件: ${forbiddenChanges.join(', ')}`,
    details: forbiddenChanges,
  });

  // ── Check 6: git push状态 ──
  const unpushed = sh(`git log --oneline @{u}..HEAD 2>/dev/null`, { fallback: '' });
  const unpushedCount = unpushed ? unpushed.split('\n').filter(Boolean).length : 0;
  checks.push({
    name: 'changes_pushed',
    ok: unpushedCount === 0,
    severity: 'low',
    message: unpushedCount === 0
      ? '所有commit已push'
      : `${unpushedCount} 个commit未push到远程`,
  });

  // ── 汇总 ──
  const passed = checks.filter(c => c.ok).length;
  const failed = checks.filter(c => !c.ok);
  const criticalFail = failed.some(c => c.severity === 'critical');
  const highFail = failed.some(c => c.severity === 'high');

  let verdict;
  if (criticalFail) verdict = 'fail';
  else if (highFail) verdict = 'partial';
  else if (failed.length > 0) verdict = 'partial';
  else verdict = 'pass';

  const score = verdict === 'pass' ? 10 : verdict === 'partial' ? Math.max(3, Math.round(passed / checks.length * 10)) : Math.round(passed / checks.length * 10);

  const result = {
    mode: 'auto-qa',
    agentId,
    taskLabel,
    verdict,
    score,
    passed: checks.filter(c => c.ok).map(c => c.name),
    issues: checks.filter(c => !c.ok).map(c => ({ name: c.name, severity: c.severity, message: c.message, details: c.details })),
    passedCount: passed,
    failed: checks.length - passed,
    total: checks.length,
    checks,
    timestamp: new Date().toISOString(),
  };

  const reportPath = writeReport(`auto-qa-${agentId}-${taskLabel}`, result);
  result.reportPath = reportPath;

  logger.info?.(`[auto-qa] 结果: ${verdict} (${passed}/${checks.length} 通过)`);
  return result;
}

// ═══════════════════════════════════════════════════════════
// 模式2: ISC规则审计 — 扫描规则完整度
// ═══════════════════════════════════════════════════════════

async function iscAudit(input, logger) {
  logger.info?.(`[isc-audit] 开始ISC规则合规审计`);

  const ruleFiles = [];
  try {
    const entries = fs.readdirSync(ISC_RULES_DIR);
    for (const e of entries) {
      if (e.endsWith('.json') && !e.startsWith('.')) {
        ruleFiles.push(path.join(ISC_RULES_DIR, e));
      }
    }
  } catch (err) {
    return { mode: 'isc-audit', ok: false, error: `无法读取规则目录: ${err.message}` };
  }

  // 获取所有handler文件名（用于检查handler是否存在）
  let handlerFiles = [];
  try {
    handlerFiles = fs.readdirSync(HANDLERS_DIR).filter(f => f.endsWith('.js'));
  } catch {}

  const issues = [];
  const stats = {
    total: ruleFiles.length,
    active: 0,
    deprecated: 0,
    hasIntent: 0,      // 层1: 意图（description/name）
    hasEvent: 0,       // 层2: 事件触发（trigger.event）
    hasPlanning: 0,    // 层3: 规划（action定义）
    hasExecution: 0,   // 层4: 执行（handler/script存在）
    hasVerification: 0, // 层5: 验真（related_rules或验证逻辑）
    fullChain: 0,      // 五层全通
    missingHandler: 0,
    missingTrigger: 0,
    formatIssues: 0,
  };

  const ruleDetails = [];

  for (const ruleFile of ruleFiles) {
    const fileName = path.basename(ruleFile);
    const rule = readJson(ruleFile);

    if (!rule) {
      issues.push({ file: fileName, issue: 'JSON解析失败', severity: 'high' });
      stats.formatIssues++;
      continue;
    }

    const detail = {
      id: rule.id || fileName,
      name: rule.name || '(无名称)',
      status: rule.status || 'unknown',
      layers: { intent: false, event: false, planning: false, execution: false, verification: false },
    };

    if (rule.status === 'active') stats.active++;
    if (rule.status === 'deprecated') stats.deprecated++;

    // 层1: 意图 — 必须有id + name + description
    if (rule.id && rule.name && rule.description) {
      detail.layers.intent = true;
      stats.hasIntent++;
    } else {
      const missing = [];
      if (!rule.id) missing.push('id');
      if (!rule.name) missing.push('name');
      if (!rule.description) missing.push('description');
      issues.push({ file: fileName, issue: `意图层缺失: ${missing.join(',')}`, severity: 'medium' });
    }

    // 层2: 事件触发 — 必须有trigger.event或trigger.events
    const hasTrigger = rule.trigger && (rule.trigger.event || (rule.trigger.events && rule.trigger.events.length > 0));
    if (hasTrigger) {
      detail.layers.event = true;
      stats.hasEvent++;
    } else {
      stats.missingTrigger++;
      issues.push({ file: fileName, issue: '事件层缺失: 无trigger.event定义', severity: 'medium' });
    }

    // 层3: 规划 — 必须有action定义
    const hasAction = rule.action && (rule.action.type || rule.action.method || rule.action.script || rule.action.handler);
    if (hasAction) {
      detail.layers.planning = true;
      stats.hasPlanning++;
    } else {
      issues.push({ file: fileName, issue: '规划层缺失: 无action定义', severity: 'medium' });
    }

    // 层4: 执行 — handler文件必须实际存在
    const handlerRef = rule.handler || rule.action?.handler || rule.action?.script || '';
    let executionOk = false;
    if (handlerRef) {
      // 检查handler文件是否存在
      const handlerName = path.basename(handlerRef);
      const handlerInDir = handlerFiles.some(h => h === handlerName || handlerRef.includes(h.replace('.js', '')));
      const handlerFullPath = path.join(WORKSPACE, handlerRef);
      const handlerExists = handlerInDir || fs.existsSync(handlerFullPath);
      if (handlerExists) {
        executionOk = true;
      } else {
        stats.missingHandler++;
        issues.push({ file: fileName, issue: `执行层: handler不存在 (${handlerRef})`, severity: 'high' });
      }
    } else {
      // 没有handler引用，检查是否有内联逻辑
      if (rule.action?.method && rule.action.method !== 'echo提示主Agent派reviewer/analyst核查') {
        executionOk = true; // 有内联方法
      } else {
        issues.push({ file: fileName, issue: '执行层缺失: 无handler/script引用', severity: 'medium' });
      }
    }
    if (executionOk) {
      detail.layers.execution = true;
      stats.hasExecution++;
    }

    // 层5: 验真 — 有验证机制（related_rules、verification字段、或fullchain_status）
    const hasVerification = rule.verification
      || rule.fullchain_status === 'expanded'
      || (rule.related_rules && rule.related_rules.length > 0)
      || rule.gate
      || rule.quality_gate;
    if (hasVerification) {
      detail.layers.verification = true;
      stats.hasVerification++;
    } else {
      issues.push({ file: fileName, issue: '验真层缺失: 无验证/闭环机制', severity: 'low' });
    }

    // 五层全通？
    const allLayers = Object.values(detail.layers).every(Boolean);
    if (allLayers) stats.fullChain++;
    detail.fullChain = allLayers;

    ruleDetails.push(detail);
  }

  // ── 覆盖率统计 ──
  const coverage = {
    intent: stats.total > 0 ? Math.round(stats.hasIntent / stats.total * 100) : 0,
    event: stats.total > 0 ? Math.round(stats.hasEvent / stats.total * 100) : 0,
    planning: stats.total > 0 ? Math.round(stats.hasPlanning / stats.total * 100) : 0,
    execution: stats.total > 0 ? Math.round(stats.hasExecution / stats.total * 100) : 0,
    verification: stats.total > 0 ? Math.round(stats.hasVerification / stats.total * 100) : 0,
    fullChain: stats.total > 0 ? Math.round(stats.fullChain / stats.total * 100) : 0,
  };

  const criticalIssues = issues.filter(i => i.severity === 'high');
  const verdict = criticalIssues.length === 0 ? (issues.length < 10 ? 'pass' : 'partial') : 'fail';
  const score = verdict === 'pass' ? 10 : verdict === 'partial' ? Math.max(3, Math.round(coverage.fullChain / 10)) : Math.min(3, Math.round(coverage.fullChain / 10));

  const layerNames = ['intent', 'event', 'planning', 'execution', 'verification'];
  const passedLayers = layerNames.filter(l => coverage[l] >= 80);

  const result = {
    mode: 'isc-audit',
    verdict,
    score,
    passed: passedLayers.map(l => `layer_${l}_coverage_ok`),
    issues: issues.slice(0, 50), // 最多50条
    stats,
    coverage,
    issueCount: issues.length,
    topIncompleteRules: ruleDetails.filter(r => !r.fullChain).slice(0, 20),
    timestamp: new Date().toISOString(),
  };

  const reportPath = writeReport('isc-audit', result);
  result.reportPath = reportPath;

  logger.info?.(`[isc-audit] 完成: ${stats.total}条规则, 五层全通${stats.fullChain}条(${coverage.fullChain}%), ${issues.length}个问题`);
  return result;
}

// ═══════════════════════════════════════════════════════════
// 模式3: Completion Review — 已完成任务回顾性审计
// ═══════════════════════════════════════════════════════════

async function completionReview(input, logger) {
  const hours = input.hours || 6; // 默认审计最近6小时
  const since = input.since || `${hours} hours ago`;

  logger.info?.(`[completion-review] 回顾性审计 (最近${hours}小时)`);

  const checks = [];

  // ── Check 1: 最近的commit列表 ──
  const commitLog = sh(`git log --oneline --since="${since}" 2>/dev/null`);
  const commits = commitLog ? commitLog.split('\n').filter(Boolean) : [];
  checks.push({
    name: 'recent_commits',
    ok: commits.length > 0,
    message: `最近${hours}小时有 ${commits.length} 个commit`,
    details: commits.slice(0, 20),
  });

  // ── Check 2: 未commit的变更 ──
  const uncommitted = sh(`git status --porcelain 2>/dev/null`);
  const uncommittedFiles = uncommitted ? uncommitted.split('\n').filter(Boolean) : [];
  const uncommittedCount = uncommittedFiles.length;
  checks.push({
    name: 'no_uncommitted_changes',
    ok: uncommittedCount < 5, // 少量未commit可接受
    severity: uncommittedCount > 20 ? 'high' : 'medium',
    message: uncommittedCount === 0
      ? '工作区干净，无未commit变更'
      : `${uncommittedCount} 个文件未commit`,
    details: uncommittedFiles.slice(0, 20),
  });

  // ── Check 3: 未push的commit ──
  const unpushed = sh(`git log --oneline @{u}..HEAD 2>/dev/null`);
  const unpushedList = unpushed ? unpushed.split('\n').filter(Boolean) : [];
  checks.push({
    name: 'all_pushed',
    ok: unpushedList.length === 0,
    severity: unpushedList.length > 5 ? 'high' : 'medium',
    message: unpushedList.length === 0
      ? '所有commit已push到远程'
      : `${unpushedList.length} 个commit未push`,
    details: unpushedList.slice(0, 10),
  });

  // ── Check 4: commit消息质量 ──
  const badCommitMsgs = [];
  for (const c of commits.slice(0, 20)) {
    const hash = c.split(' ')[0];
    const msg = c.slice(hash.length + 1);
    if (msg.length < 5) {
      badCommitMsgs.push({ hash, msg, issue: '消息过短' });
    }
    if (/^(fix|update|change|test|wip)$/i.test(msg.trim())) {
      badCommitMsgs.push({ hash, msg, issue: '消息无意义' });
    }
    if (/骨架|placeholder|stub|todo/i.test(msg)) {
      badCommitMsgs.push({ hash, msg, issue: '包含占位符关键词' });
    }
  }
  checks.push({
    name: 'commit_message_quality',
    ok: badCommitMsgs.length === 0,
    severity: 'low',
    message: badCommitMsgs.length === 0
      ? 'commit消息质量合格'
      : `${badCommitMsgs.length} 个commit消息质量差`,
    details: badCommitMsgs,
  });

  // ── Check 5: 空转commit检测（commit了但没有实际diff）──
  let emptyCommits = [];
  for (const c of commits.slice(0, 15)) {
    const hash = c.split(' ')[0];
    const stat = sh(`git diff --stat ${hash}~1 ${hash} 2>/dev/null`);
    if (!stat || stat.trim() === '') {
      emptyCommits.push({ hash, msg: c.slice(hash.length + 1) });
    }
  }
  checks.push({
    name: 'no_empty_commits',
    ok: emptyCommits.length === 0,
    severity: 'medium',
    message: emptyCommits.length === 0
      ? '无空转commit'
      : `${emptyCommits.length} 个空转commit（无实际变更）`,
    details: emptyCommits,
  });

  // ── Check 6: 关键文件完整性 ──
  const criticalFiles = [
    'openclaw.json',
    'skills/isc-core/rules',
    'skills/quality-audit/index.js',
    'CAPABILITY-ANCHOR.md',
  ];
  const missingCritical = [];
  for (const f of criticalFiles) {
    const fullPath = path.join(WORKSPACE, f);
    if (!fs.existsSync(fullPath)) {
      missingCritical.push(f);
    }
  }
  checks.push({
    name: 'critical_files_intact',
    ok: missingCritical.length === 0,
    severity: 'critical',
    message: missingCritical.length === 0
      ? '关键文件完整'
      : `${missingCritical.length} 个关键文件缺失`,
    details: missingCritical,
  });

  // ── Check 7: 报告目录健康度 ──
  const reportsDir = path.join(WORKSPACE, 'reports');
  let recentReports = 0;
  try {
    const reportFiles = sh(`find "${reportsDir}" -name "*.json" -mmin -${hours * 60} 2>/dev/null`);
    recentReports = reportFiles ? reportFiles.split('\n').filter(Boolean).length : 0;
  } catch {}
  checks.push({
    name: 'reports_generated',
    ok: true, // informational
    severity: 'info',
    message: `最近${hours}小时生成了 ${recentReports} 份报告`,
  });

  // ── 汇总 ──
  const passed = checks.filter(c => c.ok).length;
  const failed = checks.filter(c => !c.ok);
  const hasCritical = failed.some(c => c.severity === 'critical');

  let verdict;
  if (hasCritical) verdict = 'fail';
  else if (failed.length > 2) verdict = 'partial';
  else if (failed.length > 0) verdict = 'partial';
  else verdict = 'pass';

  const score = verdict === 'pass' ? 10 : verdict === 'partial' ? Math.max(3, Math.round(passed / checks.length * 10)) : Math.round(passed / checks.length * 10);

  const result = {
    mode: 'completion-review',
    verdict,
    score,
    period: `最近${hours}小时`,
    passed: checks.filter(c => c.ok).map(c => c.name),
    issues: checks.filter(c => !c.ok).map(c => ({ name: c.name, severity: c.severity, message: c.message, details: c.details })),
    passedCount: passed,
    failed: checks.length - passed,
    total: checks.length,
    checks,
    summary: {
      commits: commits.length,
      uncommitted: uncommittedCount,
      unpushed: unpushedList.length,
      emptyCommits: emptyCommits.length,
    },
    timestamp: new Date().toISOString(),
  };

  const reportPath = writeReport('completion-review', result);
  result.reportPath = reportPath;

  logger.info?.(`[completion-review] 结果: ${verdict} (${passed}/${checks.length} 通过, ${commits.length}个commit)`);
  return result;
}

// ═══════════════════════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════════════════════

async function run(input, context) {
  const logger = context?.logger || console;
  const mode = input?.mode || 'auto-qa';

  logger.info?.(`[quality-audit] 模式=${mode}`);

  switch (mode) {
    case 'auto-qa':
      return autoQA(input, logger);
    case 'isc-audit':
      return iscAudit(input, logger);
    case 'completion-review':
      return completionReview(input, logger);
    default:
      return {
        ok: false,
        error: `未知模式: ${mode}，支持: auto-qa | isc-audit | completion-review`,
      };
  }
}

module.exports = run;
module.exports.run = run;
