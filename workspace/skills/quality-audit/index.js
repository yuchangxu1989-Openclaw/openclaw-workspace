'use strict';

/**
 * quality-audit v3.0.0 — 五大维度质量审计技能
 *
 * 维度：
 *   1. 需求满足度 — task描述 vs 实际交付
 *   2. 代码质量 — 空壳/TODO/语法/hardcode检测
 *   3. 研发标准符合性 — ISC五层展开 + 命名规范 + skill-creator流水线
 *   4. 评测标准对齐 — 必要字段 + 评测集质量（版本从isc-core/config动态读取）
 *   5. 交付完整性 — TODO残留 + commit/push状态 + 禁止文件
 *
 * 模式：
 *   full           五大维度全量审计（默认）
 *   auto-qa        子Agent完成后快速审计（需agentId/taskLabel）
 *   isc-audit      仅ISC规则合规审计
 *   scan           扫描指定目录的代码质量
 *   quick          只审计最近commit变更文件（completion-handler自动触发）
 *
 * CLI: node index.js [mode] [--json] [--agent=X] [--task=X] [--path=X]
 * 事件总线: 完成后发布 quality.audit.completed
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
const EVENT_BUS_DIR = path.join(WORKSPACE, 'event-bus');

// 评测标准规则字段定义（版本无关）
const EVAL_STD_REQUIRED = ['id', 'description', 'trigger', 'action', 'handler', 'enforcement'];
const EVAL_STD_RECOMMENDED = ['name', 'version', 'fullchain_status', 'enforcement_tier', 'priority'];
const EVAL_STD_EXPANSION = ['plan', 'verification'];

// 禁止修改的文件
const FORBIDDEN_FILES = ['openclaw.json', '.env', 'package-lock.json'];

// hardcode检测正则
const HARDCODE_PATTERNS = [
  { re: /sk-[a-zA-Z0-9]{20,}/, name: 'API密钥泄露' },
  { re: /password\s*[:=]\s*['"][^'"]{3,}['"]/, name: '明文密码' },
  { re: /\/root\/[^\s'"]{20,}/, name: '绝对路径hardcode（可疑）' },
];

// ─── 工具函数 ───

function sh(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf8', timeout: opts.timeout || 15000,
      cwd: opts.cwd || WORKSPACE,
    }).trim();
  } catch { return opts.fallback !== undefined ? opts.fallback : ''; }
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function writeReport(name, data) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const fp = path.join(REPORTS_DIR, `${name}-${ts}.json`);
  fs.writeFileSync(fp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return fp;
}

function pct(n, total) { return total > 0 ? Math.round(n / total * 100) : 0; }

function dimVerdict(score) {
  if (score >= 8) return 'pass';
  if (score >= 5) return 'partial';
  return 'fail';
}

/** 发布事件到事件总线 */
function publishEvent(eventType, payload) {
  try {
    const evtDir = path.join(EVENT_BUS_DIR, 'incoming');
    fs.mkdirSync(evtDir, { recursive: true });
    const ts = Date.now();
    const evt = { type: eventType, timestamp: new Date().toISOString(), payload };
    fs.writeFileSync(path.join(evtDir, `${eventType}-${ts}.json`), JSON.stringify(evt, null, 2));
  } catch { /* 事件总线不可用时静默失败 */ }
}

// ═══════════════════════════════════════════════════════════
// 维度1: 需求满足度 — task描述 vs 实际交付
// ═══════════════════════════════════════════════════════════

function auditRequirement(input, logger) {
  const issues = [];
  const taskLabel = input.taskLabel || input.label || '';

  // 获取最近变更的文件
  const diffStat = sh('git diff --stat HEAD~1 HEAD 2>/dev/null || git diff --stat HEAD 2>/dev/null');
  const changedFiles = diffStat ? diffStat.split('\n').filter(l => l.includes('|')).map(l => l.split('|')[0].trim()) : [];

  // 检查1: 是否有文件变更
  if (changedFiles.length === 0) {
    issues.push({ check: '文件变更', severity: 'high', message: '无任何文件变更，任务可能未执行' });
  }

  // 检查2: 变更文件与task关联性（基于路径名匹配）
  if (taskLabel) {
    // 从taskLabel提取关键词
    const keywords = taskLabel.toLowerCase().split(/[\s\-_/]+/).filter(w => w.length > 2);
    const relatedFiles = changedFiles.filter(f =>
      keywords.some(kw => f.toLowerCase().includes(kw))
    );
    const unrelatedFiles = changedFiles.filter(f =>
      !keywords.some(kw => f.toLowerCase().includes(kw))
    );

    if (relatedFiles.length === 0 && changedFiles.length > 0) {
      issues.push({
        check: '关联性', severity: 'medium',
        message: `变更文件与任务"${taskLabel}"无明显关联`,
        details: changedFiles.slice(0, 10),
      });
    }

    // 多余变更检测
    if (unrelatedFiles.length > changedFiles.length * 0.7 && unrelatedFiles.length > 3) {
      issues.push({
        check: '多余变更', severity: 'low',
        message: `${unrelatedFiles.length}/${changedFiles.length} 个文件可能与任务无关`,
        details: unrelatedFiles.slice(0, 5),
      });
    }
  }

  // 检查3: 空commit检测
  const lastCommitMsg = sh('git log -1 --format="%s" 2>/dev/null');
  if (lastCommitMsg && /^(wip|fix|update|test)$/i.test(lastCommitMsg.trim())) {
    issues.push({ check: 'commit消息', severity: 'low', message: `commit消息无意义: "${lastCommitMsg}"` });
  }

  // 评分: 有变更=基础6分, 无关联问题+2, 无多余+1, 消息好+1
  let score = changedFiles.length > 0 ? 6 : 2;
  if (!issues.some(i => i.check === '关联性')) score += 2;
  if (!issues.some(i => i.check === '多余变更')) score += 1;
  if (!issues.some(i => i.check === 'commit消息')) score += 1;
  score = Math.min(10, Math.max(0, score));

  return { dimension: 'requirement', score, verdict: dimVerdict(score), issues, changedFiles: changedFiles.length };
}

// ═══════════════════════════════════════════════════════════
// 维度2: 代码质量 — 空壳/TODO/语法/hardcode
// ═══════════════════════════════════════════════════════════

function auditCodeQuality(input, logger) {
  const issues = [];
  const targetPath = input.scanPath || WORKSPACE;

  // 获取变更文件（或扫描目录）
  let filesToCheck = [];
  if (input.scanPath) {
    // scan模式: 递归扫描指定目录
    const found = sh(`find "${targetPath}" -type f \\( -name "*.js" -o -name "*.json" -o -name "*.sh" -o -name "*.py" \\) -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null`);
    filesToCheck = found ? found.split('\n').filter(Boolean) : [];
  } else {
    // 默认: 只查变更文件
    const diff = sh('git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only HEAD 2>/dev/null');
    filesToCheck = diff ? diff.split('\n').filter(Boolean).map(f => path.join(WORKSPACE, f)) : [];
  }

  let syntaxErrors = 0;
  let todoCount = 0;
  let hardcodeCount = 0;
  let emptyFiles = 0;

  for (const fp of filesToCheck.slice(0, 50)) {
    if (!fs.existsSync(fp)) continue;
    const basename = path.basename(fp);
    let content;
    try { content = fs.readFileSync(fp, 'utf8'); } catch { continue; }

    // 空文件检测
    if (content.trim().length === 0) {
      emptyFiles++;
      issues.push({ check: '空文件', severity: 'medium', file: basename, message: '文件为空' });
      continue;
    }

    // 语法检查
    if (fp.endsWith('.js') || fp.endsWith('.mjs')) {
      const r = sh(`node -c "${fp}" 2>&1`, { fallback: 'error' });
      if (r.includes('SyntaxError') || r === 'error') {
        syntaxErrors++;
        issues.push({ check: '语法错误', severity: 'high', file: basename, message: 'JS语法错误' });
      }
    }
    if (fp.endsWith('.json')) {
      if (!readJson(fp)) {
        syntaxErrors++;
        issues.push({ check: '语法错误', severity: 'high', file: basename, message: 'JSON解析失败' });
      }
    }
    if (fp.endsWith('.sh')) {
      const r = sh(`bash -n "${fp}" 2>&1`, { fallback: '' });
      if (r) {
        syntaxErrors++;
        issues.push({ check: '语法错误', severity: 'high', file: basename, message: `Shell语法: ${r.slice(0, 60)}` });
      }
    }

    // TODO/空壳检测
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/TODO.*实现|FIXME|PLACEHOLDER|console\.log\(['"]stub/i.test(lines[i])) {
        todoCount++;
        if (todoCount <= 5) {
          issues.push({
            check: '占位符残留', severity: 'medium', file: basename,
            line: i + 1, message: lines[i].trim().slice(0, 80),
          });
        }
      }
    }

    // hardcode检测
    for (const { re, name } of HARDCODE_PATTERNS) {
      if (re.test(content)) {
        hardcodeCount++;
        issues.push({ check: 'hardcode', severity: re === HARDCODE_PATTERNS[0].re ? 'critical' : 'high', file: basename, message: name });
        break; // 每文件只报一次
      }
    }
  }

  // 评分
  let score = 10;
  if (syntaxErrors > 0) score -= Math.min(4, syntaxErrors * 2);
  if (todoCount > 0) score -= Math.min(3, todoCount);
  if (hardcodeCount > 0) score -= Math.min(3, hardcodeCount * 2);
  if (emptyFiles > 0) score -= 1;
  score = Math.max(0, score);

  return {
    dimension: 'codeQuality', score, verdict: dimVerdict(score), issues,
    stats: { filesChecked: filesToCheck.length, syntaxErrors, todoCount, hardcodeCount, emptyFiles },
  };
}

// ═══════════════════════════════════════════════════════════
// 维度3: 研发标准符合性 — ISC五层展开 + 命名 + skill-creator流水线
// ═══════════════════════════════════════════════════════════

function auditDevStandards(input, logger) {
  const issues = [];

  // ── ISC规则五层展开检查 ──
  let rules = [];
  try {
    const entries = fs.readdirSync(ISC_RULES_DIR);
    for (const e of entries) {
      if (!e.endsWith('.json') || e.startsWith('.')) continue;
      const data = readJson(path.join(ISC_RULES_DIR, e));
      if (data) rules.push({ fileName: e, data });
      else issues.push({ check: 'ISC解析', severity: 'high', file: e, message: 'JSON解析失败' });
    }
  } catch (err) {
    issues.push({ check: 'ISC目录', severity: 'high', message: `无法读取规则目录: ${err.message}` });
  }

  const handlerFiles = (() => { try { return fs.readdirSync(HANDLERS_DIR).filter(f => f.endsWith('.js')); } catch { return []; } })();

  // 五层统计
  const layers = { intent: 0, event: 0, planning: 0, execution: 0, verification: 0 };
  let fullChain = 0;
  const validRules = rules.length;

  for (const { fileName, data } of rules) {
    const hasIntent = !!(data.id && (data.name || data.rule_name) && data.description);
    const trig = data.trigger;
    const hasEvent = !!(trig && (trig.event || (Array.isArray(trig.events) && trig.events.length > 0)));
    const act = data.action;
    const hasPlanning = !!(act && (act.type || act.method || act.handler || act.script)) || !!(data.plan && data.plan.steps);
    const handlerRef = data.handler || act?.handler || act?.script || '';
    const hasExecution = handlerRef ? (
      handlerFiles.some(h => handlerRef.includes(h.replace('.js', ''))) || fs.existsSync(path.join(WORKSPACE, handlerRef))
    ) : !!act?.method;
    const hasVerification = !!(data.verification || data.gate || data.quality_gate || data.fullchain_status === 'expanded' || data.fullchain_status === 'complete');

    if (hasIntent) layers.intent++;
    if (hasEvent) layers.event++;
    if (hasPlanning) layers.planning++;
    if (hasExecution) layers.execution++;
    if (hasVerification) layers.verification++;
    if (hasIntent && hasEvent && hasExecution && hasVerification) fullChain++;
  }

  const layerCoverage = {
    intent: pct(layers.intent, validRules),
    event: pct(layers.event, validRules),
    planning: pct(layers.planning, validRules),
    execution: pct(layers.execution, validRules),
    verification: pct(layers.verification, validRules),
    fullChain: pct(fullChain, validRules),
  };

  // ── 评测标准字段覆盖率 ──
  const v4Stats = { required: 0, recommended: 0, expansion: 0 };
  for (const { data } of rules) {
    for (const f of EVAL_STD_REQUIRED) if (data[f] != null) v4Stats.required++;
    for (const f of EVAL_STD_RECOMMENDED) if (data[f] != null) v4Stats.recommended++;
    for (const f of EVAL_STD_EXPANSION) if (data[f] != null) v4Stats.expansion++;
  }
  const v4Coverage = {
    required: pct(v4Stats.required, validRules * EVAL_STD_REQUIRED.length),
    recommended: pct(v4Stats.recommended, validRules * EVAL_STD_RECOMMENDED.length),
    expansion: pct(v4Stats.expansion, validRules * EVAL_STD_EXPANSION.length),
  };

  // ── 技能目录命名规范检查 ──
  const skillDirs = (() => { try { return fs.readdirSync(path.join(WORKSPACE, 'skills')); } catch { return []; } })();
  const badNames = skillDirs.filter(d => d !== d.toLowerCase() || /[A-Z_\s]/.test(d));
  if (badNames.length > 0) {
    issues.push({ check: '命名规范', severity: 'low', message: `${badNames.length}个技能目录不符合kebab-case`, details: badNames.slice(0, 5) });
  }

  // ── 技能是否走了skill-creator流水线 ──
  let noFrontmatter = 0;
  for (const d of skillDirs) {
    const skillMd = path.join(WORKSPACE, 'skills', d, 'SKILL.md');
    if (!fs.existsSync(skillMd)) continue;
    try {
      const content = fs.readFileSync(skillMd, 'utf8');
      if (!content.startsWith('---')) {
        noFrontmatter++;
        if (noFrontmatter <= 3) {
          issues.push({ check: 'skill-creator流水线', severity: 'medium', file: d, message: 'SKILL.md缺少frontmatter' });
        }
      }
    } catch {}
  }

  // ── Handler孤儿检测 ──
  const referencedHandlers = new Set();
  for (const { data } of rules) {
    const ref = data.handler || data.action?.handler || data.action?.script || '';
    if (ref) referencedHandlers.add(path.basename(ref));
  }
  const orphans = handlerFiles.filter(h => !referencedHandlers.has(h));
  if (orphans.length > 0) {
    issues.push({ check: '孤儿Handler', severity: 'low', message: `${orphans.length}个handler无规则引用`, details: orphans.slice(0, 10) });
  }

  // 评分: 全链覆盖率50% + 标准必填覆盖率30% + 命名/流水线合规20%
  const chainScore = layerCoverage.fullChain / 10; // 0-10
  const v4Score = v4Coverage.required / 10;
  const complianceScore = 10 - badNames.length * 0.5 - noFrontmatter * 0.5;
  let score = Math.round(chainScore * 0.5 + v4Score * 0.3 + Math.max(0, complianceScore) * 0.2);
  score = Math.min(10, Math.max(0, score));

  return {
    dimension: 'devStandards', score, verdict: dimVerdict(score), issues,
    layerCoverage, v4Coverage, orphanHandlers: orphans.length,
    stats: { totalRules: rules.length, fullChainCount: fullChain, totalHandlers: handlerFiles.length },
  };
}

// ═══════════════════════════════════════════════════════════
// 维度4: 评测标准对齐 — 评测集质量
// ═══════════════════════════════════════════════════════════

function auditEvalStandardAlignment(input, logger) {
  const issues = [];
  const skillsDir = path.join(WORKSPACE, 'skills');

  let skillDirs;
  try { skillDirs = fs.readdirSync(skillsDir); } catch { skillDirs = []; }

  let totalSkills = 0;
  let withEvals = 0;
  let withScoringRubric = 0;
  let withNorthStar = 0;
  let withGate = 0;
  const missingEvals = [];

  for (const d of skillDirs) {
    const skillMd = path.join(skillsDir, d, 'SKILL.md');
    if (!fs.existsSync(skillMd)) continue;
    totalSkills++;

    // 评测集检查
    const evalsJson = path.join(skillsDir, d, 'evals', 'evals.json');
    if (fs.existsSync(evalsJson)) {
      const raw = readJson(evalsJson);
      // 兼容两种格式: 顶层数组 [] 或 { evaluations: [] }
      const evals = Array.isArray(raw) ? raw
        : (raw && Array.isArray(raw.evaluations)) ? raw.evaluations
        : null;
      if (evals && evals.length > 0) {
        withEvals++;
        // 检查正例/反例均衡 — 兼容 expected/should_trigger 布尔 和 type 字符串
        const positive = evals.filter(e => e.expected === true || e.should_trigger === true || e.type === 'positive');
        const negative = evals.filter(e => e.expected === false || e.should_trigger === false || e.type === 'negative');
        if (positive.length === 0 || negative.length === 0) {
          issues.push({ check: '评测集均衡', severity: 'medium', file: d, message: `正例${positive.length}/反例${negative.length}，缺乏均衡` });
        }
      } else {
        issues.push({ check: '评测集', severity: 'medium', file: d, message: 'evals.json为空或格式错误' });
      }
    } else {
      if (missingEvals.length < 10) missingEvals.push(d);
    }

    // SKILL.md中的评测相关字段
    try {
      const content = fs.readFileSync(skillMd, 'utf8');
      if (/scoring.?rubric/i.test(content)) withScoringRubric++;
      if (/north.?star/i.test(content)) withNorthStar++;
      if (/\bgate\b/i.test(content)) withGate++;
    } catch {}
  }

  if (missingEvals.length > 0) {
    issues.push({ check: '缺少评测集', severity: 'medium', message: `${missingEvals.length}+个技能无evals.json`, details: missingEvals });
  }

  // 评分
  const evalRate = pct(withEvals, totalSkills);
  let score = Math.round(evalRate / 10); // 0-10 基于评测覆盖率
  // 额外加分
  if (pct(withScoringRubric, totalSkills) > 30) score = Math.min(10, score + 1);
  if (pct(withGate, totalSkills) > 30) score = Math.min(10, score + 1);
  score = Math.max(0, score);

  return {
    dimension: 'v4Alignment', score, verdict: dimVerdict(score), issues,
    stats: { totalSkills, withEvals, withScoringRubric, withNorthStar, withGate, evalCoverage: evalRate },
  };
}

// ═══════════════════════════════════════════════════════════
// 维度5: 交付完整性 — TODO/commit/push/禁止文件
// ═══════════════════════════════════════════════════════════

function auditDelivery(input, logger) {
  const issues = [];

  // 变更文件
  const diff = sh('git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only HEAD 2>/dev/null');
  const changedFiles = diff ? diff.split('\n').filter(Boolean) : [];

  // 检查1: TODO/FIXME残留
  let todoCount = 0;
  for (const f of changedFiles.slice(0, 20)) {
    const fp = path.join(WORKSPACE, f);
    if (!fs.existsSync(fp)) continue;
    try {
      const lines = fs.readFileSync(fp, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b/i.test(line) && !/\/\/ TODO.*OK|#.*TODO.*expected/i.test(line)) {
          todoCount++;
          if (todoCount <= 3) {
            issues.push({ check: 'TODO残留', severity: 'medium', file: f, line: i + 1, message: line.trim().slice(0, 80) });
          }
        }
      });
    } catch {}
  }

  // 检查2: 未commit变更
  const uncommitted = sh('git status --porcelain 2>/dev/null');
  const uncommittedFiles = uncommitted ? uncommitted.split('\n').filter(Boolean) : [];
  if (uncommittedFiles.length > 0) {
    issues.push({
      check: '未commit', severity: uncommittedFiles.length > 10 ? 'high' : 'medium',
      message: `${uncommittedFiles.length} 个文件未commit`,
      details: uncommittedFiles.slice(0, 10),
    });
  }

  // 检查3: 未push
  const unpushed = sh('git log --oneline @{u}..HEAD 2>/dev/null', { fallback: '' });
  const unpushedCount = unpushed ? unpushed.split('\n').filter(Boolean).length : 0;
  if (unpushedCount > 0) {
    issues.push({ check: '未push', severity: 'medium', message: `${unpushedCount} 个commit未push` });
  }

  // 检查4: 禁止文件修改
  const forbidden = changedFiles.filter(f => FORBIDDEN_FILES.some(fb => f.endsWith(fb)));
  if (forbidden.length > 0) {
    issues.push({ check: '禁止文件', severity: 'critical', message: `修改了禁止文件: ${forbidden.join(', ')}` });
  }

  // 检查5: commit消息质量
  const recentCommits = sh('git log -5 --format="%s" 2>/dev/null');
  const msgs = recentCommits ? recentCommits.split('\n').filter(Boolean) : [];
  const badMsgs = msgs.filter(m => m.length < 5 || /^(fix|update|change|wip|test)$/i.test(m.trim()));
  if (badMsgs.length > 0) {
    issues.push({ check: 'commit消息', severity: 'low', message: `${badMsgs.length}/${msgs.length} 个commit消息质量差`, details: badMsgs });
  }

  // 检查6: 文档同步（变更了代码但没更新对应SKILL.md）
  const codeChanges = changedFiles.filter(f => /\.(js|py|sh)$/.test(f) && f.includes('skills/'));
  const mdChanges = changedFiles.filter(f => f.endsWith('SKILL.md'));
  const skillsWithCodeChange = new Set(codeChanges.map(f => f.split('/').slice(0, 2).join('/')));
  const skillsWithMdChange = new Set(mdChanges.map(f => f.split('/').slice(0, 2).join('/')));
  const noDocUpdate = [...skillsWithCodeChange].filter(s => !skillsWithMdChange.has(s));
  if (noDocUpdate.length > 0) {
    issues.push({ check: '文档同步', severity: 'low', message: `${noDocUpdate.length} 个技能改了代码但没更新SKILL.md`, details: noDocUpdate });
  }

  // 评分
  let score = 10;
  if (forbidden.length > 0) score -= 4;
  if (uncommittedFiles.length > 10) score -= 3;
  else if (uncommittedFiles.length > 0) score -= 1;
  if (unpushedCount > 5) score -= 2;
  else if (unpushedCount > 0) score -= 1;
  if (todoCount > 5) score -= 2;
  else if (todoCount > 0) score -= 1;
  if (badMsgs.length > 2) score -= 1;
  score = Math.max(0, score);

  return {
    dimension: 'delivery', score, verdict: dimVerdict(score), issues,
    stats: { changedFiles: changedFiles.length, uncommitted: uncommittedFiles.length, unpushed: unpushedCount, todoCount },
  };
}

// ═══════════════════════════════════════════════════════════
// 模式组合
// ═══════════════════════════════════════════════════════════

/** 全量审计：五大维度 */
function fullAudit(input, logger) {
  logger.info?.('[quality-audit] 全量审计开始（五大维度）');

  const dimensions = {
    requirement: auditRequirement(input, logger),
    codeQuality: auditCodeQuality(input, logger),
    devStandards: auditDevStandards(input, logger),
    evalStandardAlignment: auditEvalStandardAlignment(input, logger),
    delivery: auditDelivery(input, logger),
  };

  // 综合评分（加权平均）
  const weights = { requirement: 0.2, codeQuality: 0.25, devStandards: 0.2, evalStandardAlignment: 0.15, delivery: 0.2 };
  let totalScore = 0;
  for (const [k, w] of Object.entries(weights)) {
    const dim = dimensions[k];
    if (!dim) { console.warn(`[quality-audit] 维度 ${k} 返回undefined，跳过`); continue; }
    totalScore += dim.score * w;
  }
  const score = Math.round(totalScore);
  const verdict = dimVerdict(score);

  // 汇总所有问题并按severity排序
  const allIssues = [];
  for (const dim of Object.values(dimensions)) {
    for (const iss of dim.issues) {
      allIssues.push({ ...iss, dimension: dim.dimension });
    }
  }
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  allIssues.sort((a, b) => (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9));

  // 生成修复建议
  const fixSuggestions = [];
  if (dimensions.codeQuality.stats?.syntaxErrors > 0) fixSuggestions.push('修复语法错误（最高优先）');
  if (dimensions.delivery.stats?.uncommitted > 5) fixSuggestions.push('commit未提交的变更');
  if (dimensions.delivery.stats?.unpushed > 0) fixSuggestions.push('push未推送的commit');
  if (dimensions.evalStandardAlignment?.stats?.evalCoverage < 30) fixSuggestions.push('为更多技能添加evals/evals.json评测集');
  if (dimensions.devStandards.layerCoverage?.fullChain < 60) fixSuggestions.push('补全ISC规则五层展开（尤其验真层）');

  const result = {
    mode: 'full', verdict, score, dimensions, fixSuggestions,
    issueCount: allIssues.length,
    topIssues: allIssues.slice(0, 20),
    timestamp: new Date().toISOString(),
  };
  result.reportPath = writeReport('full', result);

  // 发布事件
  publishEvent('quality.audit.completed', { mode: 'full', verdict, score, reportPath: result.reportPath });

  logger.info?.(`[quality-audit] 全量审计完成: ${verdict} ${score}/10`);
  return result;
}

/** auto-qa: 子Agent完成时快速审计 */
function autoQA(input, logger) {
  const agentId = input.agentId || 'unknown';
  const taskLabel = input.taskLabel || input.label || 'unknown';
  logger.info?.(`[auto-qa] 审计 agent=${agentId} task=${taskLabel}`);

  // 快速跑三个维度: 需求满足度 + 代码质量 + 交付完整性
  const dimensions = {
    requirement: auditRequirement(input, logger),
    codeQuality: auditCodeQuality(input, logger),
    delivery: auditDelivery(input, logger),
  };

  const score = Math.round(
    dimensions.requirement.score * 0.3 +
    dimensions.codeQuality.score * 0.4 +
    dimensions.delivery.score * 0.3
  );
  const verdict = dimVerdict(score);

  const result = {
    mode: 'auto-qa', agentId, taskLabel, verdict, score, dimensions,
    timestamp: new Date().toISOString(),
  };
  result.reportPath = writeReport(`auto-qa-${agentId}`, result);

  publishEvent('quality.audit.completed', { mode: 'auto-qa', agentId, verdict, score, reportPath: result.reportPath });

  logger.info?.(`[auto-qa] ${verdict} ${score}/10`);
  return result;
}

/** quick: 只审计最近一次commit涉及的文件（completion-handler自动调用） */
function quickAudit(input, logger) {
  logger.info?.('[quick-audit] 快速审计（最近commit变更文件）');

  // 获取最近一次commit涉及的文件
  const diff = sh('git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only HEAD 2>/dev/null');
  const changedFiles = diff ? diff.split('\n').filter(Boolean) : [];

  if (changedFiles.length === 0) {
    logger.info?.('[quick-audit] 无变更文件，跳过');
    const result = {
      mode: 'quick', verdict: 'pass', score: 10, changedFiles: [],
      message: '无变更文件', timestamp: new Date().toISOString(),
    };
    result.reportPath = writeReport('quick', result);
    return result;
  }

  // 只跑两个维度: 代码质量 + 交付完整性
  const dimensions = {
    codeQuality: auditCodeQuality({ ...input, scanPath: null }, logger),
    delivery: auditDelivery(input, logger),
  };

  const score = Math.round(
    dimensions.codeQuality.score * 0.6 +
    dimensions.delivery.score * 0.4
  );
  const verdict = dimVerdict(score);

  const result = {
    mode: 'quick', verdict, score, dimensions, changedFiles,
    fileCount: changedFiles.length,
    timestamp: new Date().toISOString(),
  };
  result.reportPath = writeReport('quick', result);

  publishEvent('quality.audit.completed', { mode: 'quick', verdict, score, fileCount: changedFiles.length, reportPath: result.reportPath });

  logger.info?.(`[quick-audit] ${verdict} ${score}/10 (${changedFiles.length}个文件)`);
  return result;
}

/** isc-audit: 仅ISC规则合规 */
function iscAudit(input, logger) {
  logger.info?.('[isc-audit] ISC规则合规审计');
  const devStd = auditDevStandards(input, logger);
  const result = {
    mode: 'isc-audit', verdict: devStd.verdict, score: devStd.score,
    layerCoverage: devStd.layerCoverage, v4Coverage: devStd.v4Coverage,
    orphanHandlers: devStd.orphanHandlers, stats: devStd.stats,
    issues: devStd.issues, issueCount: devStd.issues.length,
    timestamp: new Date().toISOString(),
  };
  result.reportPath = writeReport('isc-audit', result);

  publishEvent('quality.audit.completed', { mode: 'isc-audit', verdict: result.verdict, score: result.score });

  logger.info?.(`[isc-audit] ${result.verdict} ${result.score}/10`);
  return result;
}

// ═══════════════════════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════════════════════

async function run(input, context) {
  const logger = context?.logger || console;
  const mode = input?.mode || 'full';
  logger.info?.(`[quality-audit] 模式=${mode}`);

  switch (mode) {
    case 'full':              return fullAudit(input, logger);
    case 'auto-qa':           return autoQA(input, logger);
    case 'isc-audit':         return iscAudit(input, logger);
    case 'scan':              return auditCodeQuality(input, logger);
    case 'quick':             return quickAudit(input, logger);
    default:
      return { ok: false, error: `未知模式: ${mode}，支持: full | auto-qa | isc-audit | scan | quick` };
  }
}

module.exports = run;
module.exports.run = run;

// ═══════════════════════════════════════════════════════════
// CLI入口
// ═══════════════════════════════════════════════════════════

if (require.main === module) {
  const args = process.argv.slice(2);
  const mode = args.find(a => !a.startsWith('-')) || 'full';
  const jsonOutput = args.includes('--json');

  // 解析 --agent=X --task=X --path=X
  const cliInput = { mode };
  for (const a of args) {
    if (a.startsWith('--agent=')) cliInput.agentId = a.split('=')[1];
    if (a.startsWith('--task=')) cliInput.taskLabel = a.split('=')[1];
    if (a.startsWith('--path=')) cliInput.scanPath = a.split('=')[1];
  }

  const cliLogger = jsonOutput
    ? { info: (...a) => process.stderr.write(a.join(' ') + '\n') }
    : console;

  run(cliInput, { logger: cliLogger })
    .then(result => {
      if (jsonOutput) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        console.log(`\n══ quality-audit [${mode}] ══`);
        console.log(`判定: ${result.verdict}  评分: ${result.score}/10`);
        if (result.dimensions) {
          for (const [k, v] of Object.entries(result.dimensions)) {
            console.log(`  ${v.dimension || k}: ${v.verdict} ${v.score}/10 (${v.issues.length}个问题)`);
          }
        }
        if (result.layerCoverage) {
          const lc = result.layerCoverage;
          console.log(`五层覆盖: 意图${lc.intent}% 事件${lc.event}% 规划${lc.planning}% 执行${lc.execution}% 验真${lc.verification}% | 全通${lc.fullChain}%`);
        }
        if (result.fixSuggestions?.length) {
          console.log('修复建议:');
          result.fixSuggestions.forEach(s => console.log(`  → ${s}`));
        }
        if (result.reportPath) console.log(`报告: ${result.reportPath}`);
      }
    })
    .catch(err => {
      console.error('[quality-audit] 执行失败:', err.message);
      process.exit(1);
    });
}
