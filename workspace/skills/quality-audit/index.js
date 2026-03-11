'use strict';

/**
 * quality-audit v2.0.0 — 统一质量审计技能
 *
 * 四大模式：
 *   auto-qa          子Agent完成时自动审计
 *   isc-audit        ISC规则五层覆盖率 + handler存在性 + V4字段覆盖率
 *   completion-review 已完成任务回顾性审计
 *   full             全量审计（isc-audit + completion-review）
 *
 * 可被cron调用：node index.js [mode] [--json]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── 常量 ───

const WORKSPACE = process.env.OPENCLAW_WORKSPACE
  || path.join(process.env.OPENCLAW_HOME || '/root/.openclaw', 'workspace');
const ISC_RULES_DIR = path.join(WORKSPACE, 'skills/isc-core/rules');
const HANDLERS_DIR = path.join(WORKSPACE, 'skills/isc-core/handlers');
const REPORTS_DIR = path.join(WORKSPACE, 'reports/quality-audit');

// V4规则必须字段定义
const V4_REQUIRED_FIELDS = [
  'id', 'description', 'trigger', 'action', 'handler', 'enforcement',
];
const V4_RECOMMENDED_FIELDS = [
  'name', 'version', 'fullchain_status', 'enforcement_tier', 'priority',
];
const V4_EXPANSION_FIELDS = [
  'plan', 'verification',
];
const V4_ALL_FIELDS = [...V4_REQUIRED_FIELDS, ...V4_RECOMMENDED_FIELDS, ...V4_EXPANSION_FIELDS];

// 禁止修改的文件
const FORBIDDEN_FILES = ['openclaw.json', '.env', 'package-lock.json'];

// ─── 工具函数 ───

function sh(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      timeout: opts.timeout || 15000,
      cwd: opts.cwd || WORKSPACE,
    }).trim();
  } catch {
    return opts.fallback !== undefined ? opts.fallback : '';
  }
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function writeReport(name, data) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(REPORTS_DIR, `${name}-${ts}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return filePath;
}

function pct(n, total) {
  return total > 0 ? Math.round(n / total * 100) : 0;
}

function verdict(criticalCount, highCount, totalIssues) {
  if (criticalCount > 0) return 'fail';
  if (highCount > 0 || totalIssues > 10) return 'partial';
  if (totalIssues > 0) return 'partial';
  return 'pass';
}

function score(v, passRate) {
  if (v === 'pass') return 10;
  if (v === 'partial') return Math.max(3, Math.round(passRate * 10));
  return Math.min(3, Math.round(passRate * 10));
}

// ─── 加载ISC规则和Handler ───

function loadRules() {
  const rules = [];
  try {
    const entries = fs.readdirSync(ISC_RULES_DIR);
    for (const e of entries) {
      if (!e.endsWith('.json') || e.startsWith('.')) continue;
      const filePath = path.join(ISC_RULES_DIR, e);
      const data = readJson(filePath);
      if (data) rules.push({ fileName: e, filePath, data });
      else rules.push({ fileName: e, filePath, data: null, parseError: true });
    }
  } catch (err) {
    return { rules: [], error: err.message };
  }
  return { rules };
}

function loadHandlerNames() {
  try {
    return fs.readdirSync(HANDLERS_DIR).filter(f => f.endsWith('.js'));
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════
// 模式1: ISC规则审计 — 五层覆盖率 + Handler存在性 + V4字段覆盖率
// ═══════════════════════════════════════════════════════════

function iscAudit(input, logger) {
  logger.info?.('[isc-audit] 开始ISC规则合规审计');

  const { rules, error } = loadRules();
  if (error) return { mode: 'isc-audit', ok: false, error: `无法读取规则目录: ${error}` };

  const handlerFiles = loadHandlerNames();
  const issues = [];

  // ── 统计容器 ──
  const layerStats = { intent: 0, event: 0, planning: 0, execution: 0, verification: 0 };
  const v4Stats = { required: {}, recommended: {}, expansion: {} };
  V4_REQUIRED_FIELDS.forEach(f => v4Stats.required[f] = 0);
  V4_RECOMMENDED_FIELDS.forEach(f => v4Stats.recommended[f] = 0);
  V4_EXPANSION_FIELDS.forEach(f => v4Stats.expansion[f] = 0);

  let fullChainCount = 0;
  let parseErrors = 0;
  let activeCount = 0;
  let deprecatedCount = 0;
  let missingHandlerCount = 0;
  const ruleDetails = [];

  for (const { fileName, data } of rules) {
    // JSON解析失败
    if (!data) {
      parseErrors++;
      issues.push({ file: fileName, issue: 'JSON解析失败', severity: 'high' });
      continue;
    }

    const ruleId = data.id || data.rule_id || fileName;
    const detail = {
      id: ruleId,
      name: data.name || data.rule_name || '(无名称)',
      status: data.status || 'unknown',
      layers: { intent: false, event: false, planning: false, execution: false, verification: false },
      v4Missing: [],
    };

    if (data.status === 'active') activeCount++;
    if (data.status === 'deprecated') deprecatedCount++;

    // ════ 五层覆盖率检查 ════

    // 层1: 意图 — id + (name|rule_name) + description
    const hasName = !!(data.name || data.rule_name);
    if (data.id && hasName && data.description) {
      detail.layers.intent = true;
      layerStats.intent++;
    } else {
      const m = [];
      if (!data.id) m.push('id');
      if (!hasName) m.push('name');
      if (!data.description) m.push('description');
      issues.push({ file: fileName, issue: `意图层缺失: ${m.join(',')}`, severity: 'medium' });
    }

    // 层2: 事件触发 — trigger.event 或 trigger.events[]
    const trig = data.trigger;
    const hasEvent = trig && (trig.event || (Array.isArray(trig.events) && trig.events.length > 0));
    if (hasEvent) {
      detail.layers.event = true;
      layerStats.event++;
    } else {
      issues.push({ file: fileName, issue: '事件层缺失: 无trigger.event/events', severity: 'medium' });
    }

    // 层3: 规划 — action定义 或 plan字段
    const act = data.action;
    const hasAction = act && (act.type || act.method || act.handler || act.script);
    const hasPlan = !!(data.plan && data.plan.steps);
    if (hasAction || hasPlan) {
      detail.layers.planning = true;
      layerStats.planning++;
    } else {
      issues.push({ file: fileName, issue: '规划层缺失: 无action/plan定义', severity: 'medium' });
    }

    // 层4: 执行 — handler文件实际存在于磁盘
    const handlerRef = data.handler || act?.handler || act?.script || '';
    let executionOk = false;
    if (handlerRef) {
      const handlerBasename = path.basename(handlerRef);
      const inDir = handlerFiles.some(h => h === handlerBasename || handlerRef.includes(h.replace('.js', '')));
      const fullPath = path.join(WORKSPACE, handlerRef);
      if (inDir || fs.existsSync(fullPath)) {
        executionOk = true;
      } else {
        missingHandlerCount++;
        issues.push({ file: fileName, issue: `执行层: handler不存在 (${handlerRef})`, severity: 'high' });
      }
    } else if (act?.method) {
      executionOk = true; // 内联方法
    } else {
      issues.push({ file: fileName, issue: '执行层缺失: 无handler/script引用', severity: 'medium' });
    }
    if (executionOk) {
      detail.layers.execution = true;
      layerStats.execution++;
    }

    // 层5: 验真 — verification字段 / related_rules / gate / fullchain_status=expanded|complete
    const hasVerification = !!(
      data.verification
      || (data.related_rules && data.related_rules.length > 0)
      || data.gate || data.quality_gate
      || data.fullchain_status === 'expanded'
      || data.fullchain_status === 'complete'
    );
    if (hasVerification) {
      detail.layers.verification = true;
      layerStats.verification++;
    } else {
      issues.push({ file: fileName, issue: '验真层缺失: 无验证/闭环机制', severity: 'low' });
    }

    // 五层全通
    const allLayers = Object.values(detail.layers).every(Boolean);
    if (allLayers) fullChainCount++;
    detail.fullChain = allLayers;

    // ════ V4字段覆盖率检查 ════
    for (const f of V4_REQUIRED_FIELDS) {
      if (data[f] != null) v4Stats.required[f]++;
      else detail.v4Missing.push(f);
    }
    for (const f of V4_RECOMMENDED_FIELDS) {
      if (data[f] != null) v4Stats.recommended[f]++;
    }
    for (const f of V4_EXPANSION_FIELDS) {
      if (data[f] != null) v4Stats.expansion[f]++;
    }

    ruleDetails.push(detail);
  }

  // ── 覆盖率计算 ──
  const total = rules.length;
  const validRules = total - parseErrors;

  const layerCoverage = {
    intent:       pct(layerStats.intent, validRules),
    event:        pct(layerStats.event, validRules),
    planning:     pct(layerStats.planning, validRules),
    execution:    pct(layerStats.execution, validRules),
    verification: pct(layerStats.verification, validRules),
    fullChain:    pct(fullChainCount, validRules),
  };

  const v4Coverage = {
    required: {},
    recommended: {},
    expansion: {},
    requiredAvg: 0,
    recommendedAvg: 0,
    expansionAvg: 0,
    overallAvg: 0,
  };
  let reqSum = 0, recSum = 0, expSum = 0;
  for (const f of V4_REQUIRED_FIELDS) {
    v4Coverage.required[f] = pct(v4Stats.required[f], validRules);
    reqSum += v4Coverage.required[f];
  }
  for (const f of V4_RECOMMENDED_FIELDS) {
    v4Coverage.recommended[f] = pct(v4Stats.recommended[f], validRules);
    recSum += v4Coverage.recommended[f];
  }
  for (const f of V4_EXPANSION_FIELDS) {
    v4Coverage.expansion[f] = pct(v4Stats.expansion[f], validRules);
    expSum += v4Coverage.expansion[f];
  }
  v4Coverage.requiredAvg = Math.round(reqSum / V4_REQUIRED_FIELDS.length);
  v4Coverage.recommendedAvg = Math.round(recSum / V4_RECOMMENDED_FIELDS.length);
  v4Coverage.expansionAvg = Math.round(expSum / V4_EXPANSION_FIELDS.length);
  v4Coverage.overallAvg = Math.round(
    (reqSum + recSum + expSum) / V4_ALL_FIELDS.length
  );

  // ── Handler孤儿检测（handler文件存在但无规则引用）──
  const referencedHandlers = new Set();
  for (const { data } of rules) {
    if (!data) continue;
    const ref = data.handler || data.action?.handler || data.action?.script || '';
    if (ref) referencedHandlers.add(path.basename(ref));
  }
  const orphanHandlers = handlerFiles.filter(h => !referencedHandlers.has(h));

  // ── 汇总 ──
  const criticalIssues = issues.filter(i => i.severity === 'critical').length;
  const highIssues = issues.filter(i => i.severity === 'high').length;
  const v = verdict(criticalIssues, highIssues, issues.length);
  const s = score(v, layerCoverage.fullChain / 100);

  const result = {
    mode: 'isc-audit',
    verdict: v,
    score: s,
    stats: {
      totalRules: total,
      validRules,
      parseErrors,
      activeCount,
      deprecatedCount,
      fullChainCount,
      missingHandlerCount,
      totalHandlers: handlerFiles.length,
      orphanHandlers: orphanHandlers.length,
    },
    layerCoverage,
    v4Coverage,
    orphanHandlers: orphanHandlers.slice(0, 30),
    issues: issues.slice(0, 80),
    issueCount: issues.length,
    issueSeverity: {
      critical: criticalIssues,
      high: highIssues,
      medium: issues.filter(i => i.severity === 'medium').length,
      low: issues.filter(i => i.severity === 'low').length,
    },
    topIncompleteRules: ruleDetails.filter(r => !r.fullChain).slice(0, 25),
    timestamp: new Date().toISOString(),
  };

  const reportPath = writeReport('isc-audit', result);
  result.reportPath = reportPath;

  logger.info?.(`[isc-audit] 完成: ${total}条规则, 五层全通${fullChainCount}条(${layerCoverage.fullChain}%), V4必填覆盖${v4Coverage.requiredAvg}%, ${issues.length}个问题`);
  return result;
}

// ═══════════════════════════════════════════════════════════
// 模式2: Auto-QA — 子Agent完成时自动审计
// ═══════════════════════════════════════════════════════════

function autoQA(input, logger) {
  const agentId = input.agentId || 'unknown';
  const taskLabel = input.taskLabel || input.label || 'unknown';
  logger.info?.(`[auto-qa] 审计 agent=${agentId} task=${taskLabel}`);

  const checks = [];

  // Check 1: 文件变更
  const diffStat = sh('git diff --stat HEAD~1 HEAD 2>/dev/null || git diff --stat HEAD 2>/dev/null');
  const diffFiles = diffStat ? diffStat.split('\n').filter(l => l.includes('|')).map(l => l.split('|')[0].trim()) : [];
  checks.push({
    name: 'has_file_changes', ok: diffFiles.length > 0, severity: 'high',
    message: diffFiles.length > 0 ? `${diffFiles.length} 个文件变更` : '⚠️ 无文件变更',
    details: diffFiles.slice(0, 20),
  });

  // Check 2: 最近commit
  const lastCommit = sh('git log -1 --format="%H|%s|%ai" 2>/dev/null');
  let commitAge = Infinity;
  if (lastCommit.length > 10) {
    const parts = lastCommit.split('|');
    commitAge = (Date.now() - new Date(parts[2]).getTime()) / 60000;
  }
  checks.push({
    name: 'recent_commit', ok: commitAge < 30, severity: 'medium',
    message: commitAge < 30 ? `最近commit ${Math.round(commitAge)}分钟前` : `最近commit ${Math.round(commitAge)}分钟前（可能非本次任务）`,
  });

  // Check 3: 语法检查
  const syntaxIssues = [];
  for (const f of diffFiles.slice(0, 10)) {
    const fp = path.join(WORKSPACE, f);
    if (!fs.existsSync(fp)) continue;
    if (f.endsWith('.js') || f.endsWith('.mjs')) {
      const r = sh(`node -c "${fp}" 2>&1`, { fallback: 'error' });
      if (r.includes('SyntaxError') || r === 'error') syntaxIssues.push({ file: f, issue: 'JS语法错误' });
    }
    if (f.endsWith('.json') && !readJson(fp)) syntaxIssues.push({ file: f, issue: 'JSON解析失败' });
    if (f.endsWith('.sh')) {
      const r = sh(`bash -n "${fp}" 2>&1`, { fallback: '' });
      if (r) syntaxIssues.push({ file: f, issue: `Shell语法: ${r.slice(0, 80)}` });
    }
  }
  checks.push({
    name: 'no_syntax_errors', ok: syntaxIssues.length === 0, severity: 'high',
    message: syntaxIssues.length === 0 ? '无语法错误' : `${syntaxIssues.length} 个语法问题`,
    details: syntaxIssues,
  });

  // Check 4: 占位符残留
  const placeholders = [];
  for (const f of diffFiles.slice(0, 10)) {
    const fp = path.join(WORKSPACE, f);
    if (!fs.existsSync(fp)) continue;
    try {
      fs.readFileSync(fp, 'utf8').split('\n').forEach((line, i) => {
        if (/TODO.*实现|FIXME|PLACEHOLDER|骨架|stub/i.test(line))
          placeholders.push({ file: f, line: i + 1, text: line.trim().slice(0, 80) });
      });
    } catch {}
  }
  checks.push({
    name: 'no_placeholders', ok: placeholders.length === 0, severity: 'medium',
    message: placeholders.length === 0 ? '无占位符残留' : `${placeholders.length} 处占位符`,
    details: placeholders.slice(0, 10),
  });

  // Check 5: 禁止文件
  const forbidden = diffFiles.filter(f => FORBIDDEN_FILES.some(fb => f.endsWith(fb)));
  checks.push({
    name: 'no_forbidden_changes', ok: forbidden.length === 0, severity: 'critical',
    message: forbidden.length === 0 ? '未修改禁止文件' : `⛔ 修改了: ${forbidden.join(', ')}`,
    details: forbidden,
  });

  // Check 6: push状态
  const unpushed = sh('git log --oneline @{u}..HEAD 2>/dev/null', { fallback: '' });
  const unpushedCount = unpushed ? unpushed.split('\n').filter(Boolean).length : 0;
  checks.push({
    name: 'changes_pushed', ok: unpushedCount === 0, severity: 'low',
    message: unpushedCount === 0 ? '已push' : `${unpushedCount} 个commit未push`,
  });

  // 汇总
  const passed = checks.filter(c => c.ok).length;
  const crit = checks.filter(c => !c.ok && c.severity === 'critical').length;
  const high = checks.filter(c => !c.ok && c.severity === 'high').length;
  const v = verdict(crit, high, checks.length - passed);
  const s = score(v, passed / checks.length);

  const result = {
    mode: 'auto-qa', agentId, taskLabel, verdict: v, score: s,
    passedCount: passed, failedCount: checks.length - passed, total: checks.length,
    checks, timestamp: new Date().toISOString(),
  };
  result.reportPath = writeReport(`auto-qa-${agentId}`, result);
  logger.info?.(`[auto-qa] ${v} (${passed}/${checks.length})`);
  return result;
}

// ═══════════════════════════════════════════════════════════
// 模式3: Completion Review — 回顾性审计
// ═══════════════════════════════════════════════════════════

function completionReview(input, logger) {
  const hours = input.hours || 6;
  const since = input.since || `${hours} hours ago`;
  logger.info?.(`[completion-review] 回顾最近${hours}小时`);

  const checks = [];

  // Check 1: 最近commit
  const commitLog = sh(`git log --oneline --since="${since}" 2>/dev/null`);
  const commits = commitLog ? commitLog.split('\n').filter(Boolean) : [];
  checks.push({
    name: 'recent_commits', ok: commits.length > 0, severity: 'medium',
    message: `最近${hours}小时 ${commits.length} 个commit`,
    details: commits.slice(0, 20),
  });

  // Check 2: 未commit变更
  const uncommitted = sh('git status --porcelain 2>/dev/null');
  const uncommittedFiles = uncommitted ? uncommitted.split('\n').filter(Boolean) : [];
  checks.push({
    name: 'no_uncommitted', ok: uncommittedFiles.length < 5,
    severity: uncommittedFiles.length > 20 ? 'high' : 'medium',
    message: uncommittedFiles.length === 0 ? '工作区干净' : `${uncommittedFiles.length} 个文件未commit`,
    details: uncommittedFiles.slice(0, 20),
  });

  // Check 3: 未push
  const unpushed = sh('git log --oneline @{u}..HEAD 2>/dev/null');
  const unpushedList = unpushed ? unpushed.split('\n').filter(Boolean) : [];
  checks.push({
    name: 'all_pushed', ok: unpushedList.length === 0,
    severity: unpushedList.length > 5 ? 'high' : 'medium',
    message: unpushedList.length === 0 ? '已全部push' : `${unpushedList.length} 个commit未push`,
    details: unpushedList.slice(0, 10),
  });

  // Check 4: commit消息质量
  const badMsgs = [];
  for (const c of commits.slice(0, 20)) {
    const hash = c.split(' ')[0];
    const msg = c.slice(hash.length + 1);
    if (msg.length < 5) badMsgs.push({ hash, msg, issue: '过短' });
    else if (/^(fix|update|change|test|wip)$/i.test(msg.trim())) badMsgs.push({ hash, msg, issue: '无意义' });
    else if (/骨架|placeholder|stub|todo/i.test(msg)) badMsgs.push({ hash, msg, issue: '含占位符' });
  }
  checks.push({
    name: 'commit_msg_quality', ok: badMsgs.length === 0, severity: 'low',
    message: badMsgs.length === 0 ? 'commit消息合格' : `${badMsgs.length} 个消息质量差`,
    details: badMsgs,
  });

  // Check 5: 空转commit
  const emptyCommits = [];
  for (const c of commits.slice(0, 15)) {
    const hash = c.split(' ')[0];
    const stat = sh(`git diff --stat ${hash}~1 ${hash} 2>/dev/null`);
    if (!stat) emptyCommits.push({ hash, msg: c.slice(hash.length + 1) });
  }
  checks.push({
    name: 'no_empty_commits', ok: emptyCommits.length === 0, severity: 'medium',
    message: emptyCommits.length === 0 ? '无空转commit' : `${emptyCommits.length} 个空转commit`,
    details: emptyCommits,
  });

  // Check 6: 关键文件完整性
  const criticalFiles = ['openclaw.json', 'skills/isc-core/rules', 'skills/quality-audit/index.js', 'CAPABILITY-ANCHOR.md'];
  const missing = criticalFiles.filter(f => !fs.existsSync(path.join(WORKSPACE, f)));
  checks.push({
    name: 'critical_files_intact', ok: missing.length === 0, severity: 'critical',
    message: missing.length === 0 ? '关键文件完整' : `${missing.length} 个关键文件缺失`,
    details: missing,
  });

  // Check 7: 报告生成数
  let recentReports = 0;
  try {
    const r = sh(`find "${path.join(WORKSPACE, 'reports')}" -name "*.json" -mmin -${hours * 60} 2>/dev/null`);
    recentReports = r ? r.split('\n').filter(Boolean).length : 0;
  } catch {}
  checks.push({
    name: 'reports_generated', ok: true, severity: 'info',
    message: `最近${hours}小时生成 ${recentReports} 份报告`,
  });

  // 汇总
  const passed = checks.filter(c => c.ok).length;
  const crit = checks.filter(c => !c.ok && c.severity === 'critical').length;
  const high = checks.filter(c => !c.ok && c.severity === 'high').length;
  const v = verdict(crit, high, checks.length - passed);
  const s = score(v, passed / checks.length);

  const result = {
    mode: 'completion-review', verdict: v, score: s,
    period: `最近${hours}小时`,
    passedCount: passed, failedCount: checks.length - passed, total: checks.length,
    summary: { commits: commits.length, uncommitted: uncommittedFiles.length, unpushed: unpushedList.length, emptyCommits: emptyCommits.length },
    checks, timestamp: new Date().toISOString(),
  };
  result.reportPath = writeReport('completion-review', result);
  logger.info?.(`[completion-review] ${v} (${passed}/${checks.length}, ${commits.length}个commit)`);
  return result;
}

// ═══════════════════════════════════════════════════════════
// 模式4: Full — 全量审计（isc-audit + completion-review）
// ═══════════════════════════════════════════════════════════

function fullAudit(input, logger) {
  logger.info?.('[full-audit] 全量审计开始');
  const isc = iscAudit(input, logger);
  const cr = completionReview(input, logger);

  const combinedScore = Math.round((isc.score + cr.score) / 2);
  const combinedVerdict = combinedScore >= 8 ? 'pass' : combinedScore >= 4 ? 'partial' : 'fail';

  const result = {
    mode: 'full',
    verdict: combinedVerdict,
    score: combinedScore,
    iscAudit: isc,
    completionReview: cr,
    timestamp: new Date().toISOString(),
  };
  result.reportPath = writeReport('full-audit', result);
  logger.info?.(`[full-audit] ${combinedVerdict} (score=${combinedScore})`);
  return result;
}

// ═══════════════════════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════════════════════

async function run(input, context) {
  const logger = context?.logger || console;
  const mode = input?.mode || 'isc-audit';

  logger.info?.(`[quality-audit] 模式=${mode}`);

  switch (mode) {
    case 'auto-qa':       return autoQA(input, logger);
    case 'isc-audit':     return iscAudit(input, logger);
    case 'completion-review': return completionReview(input, logger);
    case 'full':          return fullAudit(input, logger);
    default:
      return { ok: false, error: `未知模式: ${mode}，支持: auto-qa | isc-audit | completion-review | full` };
  }
}

module.exports = run;
module.exports.run = run;

// ═══════════════════════════════════════════════════════════
// CLI入口 — 支持 cron 调用: node index.js [mode] [--json]
// ═══════════════════════════════════════════════════════════

if (require.main === module) {
  const args = process.argv.slice(2);
  const mode = args.find(a => !a.startsWith('-')) || 'isc-audit';
  const jsonOutput = args.includes('--json');

  // --json模式下logger输出到stderr，保持stdout纯JSON
  const cliLogger = jsonOutput
    ? { info: (...a) => process.stderr.write(a.join(' ') + '\n') }
    : console;

  run({ mode }, { logger: cliLogger })
    .then(result => {
      if (jsonOutput) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        console.log(`\n══ quality-audit [${mode}] ══`);
        console.log(`判定: ${result.verdict}  评分: ${result.score}/10`);
        if (result.layerCoverage) {
          const lc = result.layerCoverage;
          console.log(`五层覆盖: 意图${lc.intent}% 事件${lc.event}% 规划${lc.planning}% 执行${lc.execution}% 验真${lc.verification}% | 全通${lc.fullChain}%`);
        }
        if (result.v4Coverage) {
          console.log(`V4覆盖: 必填${result.v4Coverage.requiredAvg}% 推荐${result.v4Coverage.recommendedAvg}% 扩展${result.v4Coverage.expansionAvg}% | 总体${result.v4Coverage.overallAvg}%`);
        }
        if (result.issueCount != null) console.log(`问题数: ${result.issueCount}`);
        if (result.stats) console.log(`规则: ${result.stats.totalRules}条, 全通${result.stats.fullChainCount}条, handler缺失${result.stats.missingHandlerCount}条, 孤儿handler${result.stats.orphanHandlers}个`);
        if (result.reportPath) console.log(`报告: ${result.reportPath}`);
      }
    })
    .catch(err => {
      console.error('[quality-audit] 执行失败:', err.message);
      process.exit(1);
    });
}
