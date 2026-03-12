#!/usr/bin/env node
/**
 * PDCA Check Loop Engine v2.0
 * 
 * 完整的PDCA Check→差距分析→告警推送→趋势记录 循环引擎
 * 每次运行：度量采集 → 基准对比 → 差距分析 → 告警推送 → 历史追加
 * 
 * Usage: node check-loop.js [--dry-run] [--no-alert]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = '/root/.openclaw/workspace';
const REPORTS_DIR = path.join(WORKSPACE, 'reports');
const REPORT_PATH = path.join(REPORTS_DIR, 'pdca-check-latest.json');
const HISTORY_PATH = path.join(REPORTS_DIR, 'pdca-check-history.jsonl');
const STANDARDS_PATH = path.join(__dirname, 'check-standards.json');
const LOG_DIR = path.join(WORKSPACE, 'infrastructure/logs');
const LOG_PATH = path.join(LOG_DIR, 'pdca-check.log');
const CONCURRENCY_LIMIT = 19;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const NO_ALERT = args.includes('--no-alert');

// --- Load dynamic standards ---
function loadStandards() {
  try {
    return JSON.parse(fs.readFileSync(STANDARDS_PATH, 'utf8')).metrics;
  } catch (e) {
    log(`⚠️  Failed to load standards from ${STANDARDS_PATH}, using defaults: ${e.message}`);
    return {
      concurrencyUtil:   { target: 0.60, direction: 'gte', warnThreshold: 0.40 },
      timeoutRate:       { target: 0.10, direction: 'lte', warnThreshold: 0.20 },
      taskGranularity:   { target: 10,   direction: 'lte', warnThreshold: 15 },
      ruleExpansionRate: { target: 0.50, direction: 'gte', warnThreshold: 0.25 },
      badcaseAutoRate:   { target: null, direction: 'gte', warnThreshold: null },
    };
  }
}

// --- Logging ---
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.error(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_PATH, line + '\n');
  } catch {}
}

// --- Helpers ---
function readJsonSafe(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function findJsonFiles(dir, pattern) {
  try { return fs.readdirSync(dir).filter(f => f.match(pattern)).map(f => path.join(dir, f)); } catch { return []; }
}

function status(actual, cfg) {
  if (cfg.target === null) return 'info';
  const ok = cfg.direction === 'gte' ? actual >= cfg.target : actual <= cfg.target;
  if (ok) return 'ok';
  const warn = cfg.direction === 'gte'
    ? (cfg.warnThreshold !== null && actual >= cfg.warnThreshold)
    : (cfg.warnThreshold !== null && actual <= cfg.warnThreshold);
  return warn ? 'warn' : 'critical';
}

function gapValue(actual, target, direction) {
  if (target === null) return null;
  return direction === 'gte' ? +(actual - target).toFixed(4) : +(target - actual).toFixed(4);
}

// --- Metric collectors (same as v1) ---
function measureConcurrency() {
  // Correct definition: peak number of simultaneously running tasks in last 1h / CONCURRENCY_LIMIT
  // Method: build timeline from spawnTime/completeTime, find max overlap
  const oneHourAgo = Date.now() - 3600_000;
  const now = Date.now();
  let peakRunning = 0;

  // Gather tasks from all known board files
  const boardPaths = [
    path.join(WORKSPACE, 'logs/subagent-task-board.json'),
    path.join(WORKSPACE, 'task-board.json'),
    path.join(WORKSPACE, 'skills/pdca-engine/task-board.json'),
  ];

  const events = []; // {time, delta: +1 or -1}
  for (const bp of boardPaths) {
    const board = readJsonSafe(bp);
    if (!board) continue;
    const tasks = Array.isArray(board) ? board : (board.tasks || []);
    for (const t of tasks) {
      const spawnRaw = t.spawnTime || t.startedAt || t.created || t.timestamp;
      if (!spawnRaw) continue;
      const start = new Date(spawnRaw).getTime();
      const endRaw = t.completeTime || t.completedAt || t.endTime || t.finishedAt;
      const end = endRaw ? new Date(endRaw).getTime() : now; // still running if no end time

      // Only consider tasks that overlap with the last 1h window
      if (end < oneHourAgo) continue;
      const effectiveStart = Math.max(start, oneHourAgo);
      const effectiveEnd = Math.min(end, now);
      if (effectiveStart >= effectiveEnd) continue;

      events.push({ time: effectiveStart, delta: 1 });
      events.push({ time: effectiveEnd, delta: -1 });
    }
  }

  if (events.length > 0) {
    // Sort by time; on tie, ends (-1) before starts (+1) to avoid overcounting instant overlaps
    events.sort((a, b) => a.time - b.time || a.delta - b.delta);
    let running = 0;
    for (const e of events) {
      running += e.delta;
      if (running > peakRunning) peakRunning = running;
    }
  }

  // Fallback: LEP reports
  if (peakRunning === 0) {
    const lepFiles = findJsonFiles(REPORTS_DIR, /^lep-daily-report.*\.json$/);
    if (lepFiles.length > 0) {
      const latest = readJsonSafe(lepFiles[lepFiles.length - 1]);
      if (latest) peakRunning = latest.peakConcurrency || latest.peak_running || latest.activeTasks || 0;
    }
  }

  return { actual: +(peakRunning / CONCURRENCY_LIMIT).toFixed(4), peakRunning, limit: CONCURRENCY_LIMIT };
}

function measureTimeoutRate() {
  let timeouts = 0, total = 0;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  for (const dateStr of [today, yesterday]) {
    const lep = readJsonSafe(path.join(REPORTS_DIR, `lep-daily-report-${dateStr}.json`));
    if (lep) { timeouts += lep.timeouts || lep.timeout_count || 0; total += lep.totalTasks || lep.total || 0; }
  }
  const harvestFiles = findJsonFiles(REPORTS_DIR, /^correction-harvest.*\.md$/);
  const reworkFiles = findJsonFiles(REPORTS_DIR, /^rework-analysis.*\.md$/);
  const twentyFourHoursAgo = Date.now() - 86400_000;
  for (const f of [...harvestFiles, ...reworkFiles]) {
    try {
      const content = fs.readFileSync(f, 'utf8');
      const dateMatch = f.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch && new Date(dateMatch[1]).getTime() < twentyFourHoursAgo) continue;
      const timeoutMatches = content.match(/timeout/gi);
      if (timeoutMatches && total === 0) {
        timeouts += timeoutMatches.length;
        const taskMatches = content.match(/task|任务/gi);
        total += taskMatches ? taskMatches.length : timeoutMatches.length * 5;
      }
    } catch {}
  }
  if (total === 0) total = 1;
  return { actual: +(timeouts / total).toFixed(4), timeouts, total };
}

function measureTaskGranularity() {
  // Definition: average number of files touched per task (单任务粒度)
  // Target: <10 files per agent task
  // Method: check recently completed tasks' result_summary for file counts,
  //         fallback to counting file path references in task descriptions
  const boardPaths = [
    path.join(WORKSPACE, 'logs/subagent-task-board.json'),
    path.join(WORKSPACE, 'task-board.json'),
    path.join(WORKSPACE, 'skills/pdca-engine/task-board.json'),
  ];

  let fileCounts = [];

  for (const bp of boardPaths) {
    const board = readJsonSafe(bp);
    if (!board) continue;
    const tasks = Array.isArray(board) ? board : (board.tasks || []);

    // Get recently completed tasks (sorted by completion time, take last 10)
    const completed = tasks
      .filter(t => t.status === 'done' || t.status === 'completed' || t.state === 'done' || t.state === 'completed')
      .sort((a, b) => {
        const ta = new Date(a.completeTime || a.completedAt || a.endTime || 0).getTime();
        const tb = new Date(b.completeTime || b.completedAt || b.endTime || 0).getTime();
        return tb - ta;
      })
      .slice(0, 10);

    for (const t of completed) {
      // Try to get file count from result_summary
      const summary = t.result_summary || t.resultSummary || t.result || {};
      const fileCount = summary.filesChanged || summary.files_changed || summary.fileCount || summary.file_count;
      if (typeof fileCount === 'number' && fileCount > 0) {
        fileCounts.push(fileCount);
        continue;
      }
      // If result_summary has a text, count file paths in it
      const summaryText = typeof summary === 'string' ? summary : (summary.text || summary.message || '');
      if (summaryText) {
        const pathRefs = countFilePathRefs(summaryText);
        if (pathRefs > 0) { fileCounts.push(pathRefs); continue; }
      }
      // Fallback: count file path references in the task description
      const desc = t.task || t.description || t.label || '';
      const pathRefs2 = countFilePathRefs(desc);
      if (pathRefs2 > 0) fileCounts.push(pathRefs2);
    }
    if (fileCounts.length > 0) break;
  }

  const avgFiles = fileCounts.length > 0
    ? +(fileCounts.reduce((a, b) => a + b, 0) / fileCounts.length).toFixed(1)
    : 0;

  return { actual: avgFiles, sampledTasks: fileCounts.length, fileCounts };
}

function countFilePathRefs(text) {
  if (!text) return 0;
  // Match common file path patterns: /foo/bar.js, src/x.ts, ./a/b, etc.
  const pathPattern = /(?:^|[\s,;('"`])([.\/~]?(?:[a-zA-Z0-9_-]+\/)+[a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+)/g;
  const matches = new Set();
  let m;
  while ((m = pathPattern.exec(text)) !== null) {
    matches.add(m[1].trim());
  }
  return matches.size;
}

function measureRuleExpansion() {
  // 5-layer expansion check (v2): intent / event / plan / handler / verification
  // A rule is "expanded" ONLY when ALL 5 layers are present and non-empty.
  const rulesDir = path.join(WORKSPACE, 'skills/isc-core/rules');
  let totalRules = 0;
  let expandedRules = 0;
  const layerStats = { intent: 0, event: 0, plan: 0, handler: 0, verification: 0 };
  const incomplete = []; // rules missing ≥1 layer

  try {
    const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const rule = JSON.parse(fs.readFileSync(path.join(rulesDir, f), 'utf8'));
        totalRules++;

        const trigger = (typeof rule.trigger === 'object' && rule.trigger !== null) ? rule.trigger : {};
        const action  = (typeof rule.action  === 'object' && rule.action  !== null) ? rule.action  : {};
        const gov     = (typeof rule.governance === 'object' && rule.governance !== null) ? rule.governance : {};

        // Layer 1: 意图 (intent) — trigger/intent definition exists
        const hasIntent = !!(Object.keys(trigger).length > 0 || rule.intent);

        // Layer 2: 事件 (event) — event type binding
        const evts = trigger.events || trigger.event || rule.events || rule.event_type;
        const hasEvent = !!(Array.isArray(evts) ? evts.length > 0 : evts);

        // Layer 3: 规划 (plan) — execution plan/strategy
        const hasPlan = !!(rule.plan || rule.strategy || action.plan || rule.execution);

        // Layer 4: 执行 (handler) — executable handler code/script
        const hasHandler = !!(rule.handler || action.handler || action.script);

        // Layer 5: 验真 (verification) — verification/test mechanism
        const hasVerification = !!(rule.verification || rule.test || rule.verify || gov.verification);

        if (hasIntent)       layerStats.intent++;
        if (hasEvent)        layerStats.event++;
        if (hasPlan)         layerStats.plan++;
        if (hasHandler)      layerStats.handler++;
        if (hasVerification) layerStats.verification++;

        const missing = [];
        if (!hasIntent)       missing.push('intent');
        if (!hasEvent)        missing.push('event');
        if (!hasPlan)         missing.push('plan');
        if (!hasHandler)      missing.push('handler');
        if (!hasVerification) missing.push('verification');

        if (missing.length === 0) {
          expandedRules++;
        } else {
          incomplete.push({ rule: rule.id || rule.rule_id || f, missing });
        }
      } catch {}
    }
  } catch {}

  if (totalRules === 0) totalRules = 1;

  return {
    actual: +(expandedRules / totalRules).toFixed(4),
    expandedRules,
    totalRules,
    layerStats,
    incomplete: incomplete.slice(0, 30), // cap output size
    incompleteCount: incomplete.length,
  };
}

function measureSkillHealth() {
  // 技能健康度扫描：逐个技能评估用途、状态、引用、ISC关联、价值
  const skillsDir = path.join(WORKSPACE, 'skills');
  const rulesDir = path.join(WORKSPACE, 'skills/isc-core/rules');
  const skills = [];
  let healthyCount = 0;

  // 预加载ISC规则中引用的技能名
  const iscSkillRefs = {};
  try {
    for (const f of fs.readdirSync(rulesDir).filter(f => f.endsWith('.json'))) {
      try {
        const content = fs.readFileSync(path.join(rulesDir, f), 'utf8');
        // 扫描规则内容中引用的技能目录名
        const skillDirs = fs.readdirSync(skillsDir).filter(d => {
          try { return fs.statSync(path.join(skillsDir, d)).isDirectory(); } catch { return false; }
        });
        for (const sd of skillDirs) {
          if (content.includes(sd)) {
            iscSkillRefs[sd] = (iscSkillRefs[sd] || 0) + 1;
          }
        }
      } catch {}
    }
  } catch {}

  // 扫描所有技能目录
  let skillDirs;
  try {
    skillDirs = fs.readdirSync(skillsDir).filter(d => {
      try { return fs.statSync(path.join(skillsDir, d)).isDirectory(); } catch { return false; }
    });
  } catch { skillDirs = []; }

  for (const dir of skillDirs) {
    const skillPath = path.join(skillsDir, dir);
    const skillMdPath = path.join(skillPath, 'SKILL.md');

    // 1. 读SKILL.md提取设计意图
    let designIntent = '无SKILL.md';
    try {
      const md = fs.readFileSync(skillMdPath, 'utf8');
      // 取description字段或第一个非空非标题行
      const descMatch = md.match(/description:\s*(.+)/);
      if (descMatch) {
        designIntent = descMatch[1].trim();
      } else {
        const lines = md.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('name:') && !l.startsWith('version:'));
        designIntent = (lines[0] || '无描述').trim().slice(0, 120);
      }
    } catch {}

    // 2. 检查是否空壳
    let currentStatus = '正常运行';
    const jsFiles = [];
    try {
      const allFiles = fs.readdirSync(skillPath);
      for (const f of allFiles) {
        if (f.endsWith('.js') || f.endsWith('.cjs') || f.endsWith('.mjs')) jsFiles.push(f);
      }
    } catch {}

    if (jsFiles.length === 0) {
      currentStatus = '仅SKILL.md无代码';
    } else {
      // 检查主入口是否空壳
      const mainFile = jsFiles.find(f => f === 'index.js' || f === 'index.cjs') || jsFiles[0];
      try {
        const code = fs.readFileSync(path.join(skillPath, mainFile), 'utf8');
        const hasTodo = /TODO|FIXME|NOT IMPLEMENTED|placeholder/i.test(code);
        const hasFunctions = /function\s+\w+|=>\s*{|module\.exports|exports\.\w+/i.test(code);
        const lineCount = code.split('\n').filter(l => l.trim() && !l.startsWith('//')).length;
        if (hasTodo && lineCount < 20) {
          currentStatus = '空壳TODO';
        } else if (hasTodo && hasFunctions) {
          currentStatus = '部分实现';
        }
      } catch {}
    }

    // 3. grep引用次数（在整个workspace中搜索该技能名）
    let refCount = 0;
    try {
      const result = execSync(
        `grep -rl --include="*.js" --include="*.json" --include="*.md" --include="*.sh" -w "${dir}" ${WORKSPACE} 2>/dev/null | grep -v "node_modules" | grep -v "skills/${dir}/" | wc -l`,
        { timeout: 5000, encoding: 'utf8' }
      ).trim();
      refCount = parseInt(result) || 0;
    } catch {}

    // 4. ISC关联
    const iscCount = iscSkillRefs[dir] || 0;

    // 5. 价值评估
    let value, valueReason;
    if (refCount >= 50) {
      value = '高'; valueReason = `被${refCount}个文件引用，是核心依赖`;
    } else if (refCount >= 10 || iscCount > 0) {
      value = '中'; valueReason = iscCount > 0 ? `有${iscCount}条ISC规则关联` : `被${refCount}个文件引用`;
    } else if (refCount > 0 && currentStatus !== '空壳TODO' && currentStatus !== '仅SKILL.md无代码') {
      value = '低'; valueReason = `仅被${refCount}个文件引用`;
    } else {
      value = '无'; valueReason = currentStatus === '仅SKILL.md无代码' ? '无代码实现' : (refCount === 0 ? '零引用' : '空壳且低引用');
    }

    // 6. 建议
    let suggestion;
    if (value === '高') {
      suggestion = '保留，核心技能';
    } else if (value === '中') {
      suggestion = currentStatus === '部分实现' ? '实现：补齐TODO部分' : '保留';
    } else if (currentStatus === '仅SKILL.md无代码') {
      suggestion = '实现：当前仅有设计文档，需要编码落地';
    } else if (currentStatus === '空壳TODO') {
      suggestion = refCount === 0 ? '删除：空壳且零引用' : '实现：有引用但代码未落地';
    } else {
      suggestion = '评估是否可合并到相近技能';
    }

    const isHealthy = value === '高' || value === '中';
    if (isHealthy) healthyCount++;

    skills.push({
      name: dir,
      designIntent,
      currentStatus,
      refCount,
      iscCount,
      value,
      valueReason,
      suggestion,
    });
  }

  // 生成markdown格式的详细报告
  const reportLines = ['# 技能健康度扫描报告\n'];
  reportLines.push(`> 扫描时间：${new Date().toISOString()}`);
  reportLines.push(`> 技能总数：${skillDirs.length}，健康（高/中价值）：${healthyCount}\n`);

  // 按价值分组排序
  const order = { '高': 0, '中': 1, '低': 2, '无': 3 };
  skills.sort((a, b) => (order[a.value] ?? 9) - (order[b.value] ?? 9));

  for (const s of skills) {
    reportLines.push(`### ${s.name}\n`);
    reportLines.push('| 维度 | 结果 |');
    reportLines.push('|------|------|');
    reportLines.push(`| 设计意图 | ${s.designIntent} |`);
    reportLines.push(`| 当前状态 | ${s.currentStatus} |`);
    reportLines.push(`| 被引用情况 | 被${s.refCount}个文件引用 |`);
    reportLines.push(`| ISC关联 | ${s.iscCount > 0 ? `有${s.iscCount}条规则关联` : '无'} |`);
    reportLines.push(`| 价值评估 | ${s.value} — ${s.valueReason} |`);
    reportLines.push(`| 建议 | ${s.suggestion} |`);
    reportLines.push('');
  }

  // 写详细报告到文件
  const reportPath = path.join(REPORTS_DIR, 'pdca-skill-health-report.md');
  try {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
    log(`📝 技能健康报告已写入 ${reportPath}`);
  } catch (e) {
    log(`⚠️ 技能健康报告写入失败: ${e.message}`);
  }

  const totalSkills = skillDirs.length || 1;
  return {
    actual: +(healthyCount / totalSkills).toFixed(4),
    totalSkills: skillDirs.length,
    healthyCount,
    byValue: {
      high: skills.filter(s => s.value === '高').length,
      medium: skills.filter(s => s.value === '中').length,
      low: skills.filter(s => s.value === '低').length,
      none: skills.filter(s => s.value === '无').length,
    },
    reportPath,
    skills, // full detail in JSON report
  };
}

function measureEvalsetIntegrity() {
  // 评测集完整性检查维度：
  // 1. 扫描散落数据，统计未入库数
  // 2. 统计V4字段覆盖率
  // 3. 统计北极星覆盖分布
  // 4. 有未入库数据时标critical
  const unifiedDir = path.join(WORKSPACE, 'evals/unified');
  const goldenDir = path.join(WORKSPACE, 'infrastructure/aeo/golden-testset');
  const versionFile = path.join(WORKSPACE, 'skills/isc-core/config/eval-standard-version.json');

  // 动态读取评测标准版本
  let evalVersion = 'V4';
  try {
    const vf = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
    evalVersion = vf.version || 'V4';
  } catch {}

  // 收集统一目录已有case ID
  const existingIds = new Set();
  const allCases = [];
  for (const dir of [unifiedDir, goldenDir]) {
    try {
      for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
          const cases = Array.isArray(data) ? data : (data.cases || data.dataset || []);
          for (const c of cases) {
            if (c && c.id) existingIds.add(c.id);
            if (c && typeof c === 'object') allCases.push(c);
          }
        } catch {}
      }
    } catch {}
  }

  // 扫描散落数据源，统计未入库数
  const scatterDirs = [
    path.join(WORKSPACE, 'skills/aeo/evalset-cron-output'),
    path.join(WORKSPACE, 'skills/aeo/generated'),
  ];
  // 也扫描 skills/*/evals/
  try {
    for (const d of fs.readdirSync(path.join(WORKSPACE, 'skills'))) {
      const evalsDir = path.join(WORKSPACE, 'skills', d, 'evals');
      try { if (fs.statSync(evalsDir).isDirectory()) scatterDirs.push(evalsDir); } catch {}
    }
  } catch {}

  let unimportedCount = 0;
  for (const dir of scatterDirs) {
    try {
      for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
          const cases = Array.isArray(data) ? data : (data.cases || data.dataset || []);
          for (const c of cases) {
            if (c && c.id && !existingIds.has(c.id)) unimportedCount++;
          }
        } catch {}
      }
    } catch {}
  }

  // V4字段覆盖率
  const v4Fields = ['north_star_indicator', 'scoring_rubric', 'gate', 'execution_chain_steps'];
  const v4Coverage = {};
  const total = allCases.length || 1;
  for (const field of v4Fields) {
    const count = allCases.filter(c => c[field]).length;
    v4Coverage[field] = { count, total: allCases.length, pct: +(count / total * 100).toFixed(1) };
  }

  // 北极星覆盖分布
  const nsDist = {};
  for (const c of allCases) {
    const ns = c.north_star_indicator || '未标注';
    nsDist[ns] = (nsDist[ns] || 0) + 1;
  }

  // 缺口检测
  const expectedNs = ['任务完成率', '意图识别准确率', '代码正确性', '知识准确性', '响应质量'];
  const gaps = expectedNs.filter(ns => !nsDist[ns] || nsDist[ns] < 10);

  // 如有未入库数据，尝试自动归拢（调用badcase-to-evalset.sh）
  if (unimportedCount > 0) {
    try {
      execSync('bash /root/.openclaw/workspace/scripts/badcase-to-evalset.sh', { timeout: 30000, stdio: 'pipe' });
    } catch {}
    // 也运行源数据归拢（复用aeo-daily-evalset-sync.sh的阶段1逻辑）
    try {
      execSync('bash /root/.openclaw/workspace/scripts/aeo-daily-evalset-sync.sh', { timeout: 60000, stdio: 'pipe' });
    } catch {}
  }

  // 综合得分：north_star覆盖率为主指标
  const nsCovPct = v4Coverage.north_star_indicator ? v4Coverage.north_star_indicator.pct / 100 : 0;

  return {
    actual: +nsCovPct.toFixed(4),
    evalVersion,
    totalCases: allCases.length,
    unimportedCount,
    v4Coverage,
    northStarDistribution: nsDist,
    northStarGaps: gaps,
  };
}

function measureBadcaseAutoRate() {
  let autoCaptured = 0, userCorrections = 0;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  for (const dateStr of [today, yesterday]) {
    try {
      const content = fs.readFileSync(path.join(REPORTS_DIR, `correction-harvest-${dateStr}.md`), 'utf8');
      const autoMatches = content.match(/自动|auto|automated/gi);
      const corrMatches = content.match(/纠偏|correction|用户.*修正|user.*fix/gi);
      autoCaptured += autoMatches ? autoMatches.length : 0;
      userCorrections += corrMatches ? corrMatches.length : 0;
    } catch {}
  }
  try {
    const files = fs.readdirSync(REPORTS_DIR).filter(f => f.match(/eval-badcase-index/));
    for (const f of files.slice(-1)) {
      const content = fs.readFileSync(path.join(REPORTS_DIR, f), 'utf8');
      const countMatch = content.match(/(\d+)\s*(badcase|坏案例)/i);
      if (countMatch) autoCaptured = Math.max(autoCaptured, parseInt(countMatch[1]));
    }
  } catch {}
  if (userCorrections === 0) userCorrections = 1;
  return { actual: +(autoCaptured / userCorrections).toFixed(4), autoCaptured, userCorrections };
}

// --- Gap Analysis ---
function analyzeGap(metricKey, label, actual, target, direction, st) {
  if (target === null) return null;
  const gap = gapValue(actual, target, direction);
  if (st === 'ok') return null;
  
  const suggestions = {
    concurrencyUtil: [
      '增加任务拆分粒度，让更多子任务并行',
      '检查是否有阻塞性依赖导致串行执行',
      '优化dispatch策略，提前预取下一批任务',
    ],
    timeoutRate: [
      '分析超时任务的共性，是否为特定类型任务',
      '考虑增加超时阈值或优化慢任务的执行路径',
      '检查是否有外部依赖(API/网络)导致超时',
    ],
    taskGranularity: [
      '单任务涉及文件过多，应进一步拆分',
      '目标：每个Agent任务控制在10个文件以内',
      '使用complexity-gate评估任务复杂度后再分配',
    ],
    ruleExpansionRate: [
      '5层展开标准：intent/event/plan/handler/verification 全部非空才算展开',
      '当前主要缺失层：plan(规划)和verification(验真)，优先补齐',
      '建立规则展开的自动化pipeline，每次Check后识别下一批应展开的规则',
    ],
    evalsetIntegrity: [
      '运行 bash scripts/badcase-to-evalset.sh 翻转积压badcase',
      '运行 bash scripts/aeo-daily-evalset-sync.sh 归拢散落数据',
      '补齐north_star_indicator/scoring_rubric/gate等V4必需字段',
    ],
    skillHealth: [
      '查看 reports/pdca-skill-health-report.md 了解每个技能的详细评估',
      '优先实现"仅SKILL.md无代码"的技能或将其删除',
      '合并功能重叠的低价值技能，减少维护负担',
    ],
  };

  return {
    metric: metricKey,
    label,
    severity: st,
    actual,
    target,
    gap,
    gapDescription: direction === 'gte'
      ? `${label}当前${actual}，距目标${target}还差${Math.abs(gap).toFixed(4)}，需提升${(Math.abs(gap) / target * 100).toFixed(1)}%`
      : `${label}当前${actual}，超出目标${target}达${Math.abs(gap).toFixed(4)}，需降低${(Math.abs(gap) / actual * 100).toFixed(1)}%`,
    suggestions: suggestions[metricKey] || ['需要进一步分析根因'],
  };
}

// --- Alert via openclaw cron (one-shot) ---
function sendAlert(gapAnalyses) {
  if (NO_ALERT || DRY_RUN || gapAnalyses.length === 0) return;
  
  const criticals = gapAnalyses.filter(g => g.severity === 'critical');
  const warns = gapAnalyses.filter(g => g.severity === 'warn');
  
  if (criticals.length === 0 && warns.length === 0) return;

  let alertMsg = '';
  if (criticals.length > 0) {
    alertMsg += `🔴 PDCA Check发现${criticals.length}个critical指标，需要立即行动：\n`;
    for (const g of criticals) {
      alertMsg += `\n• ${g.label}：${g.gapDescription}\n  建议：${g.suggestions[0]}`;
    }
  }
  if (warns.length > 0) {
    alertMsg += `\n🟡 另有${warns.length}个warn指标需关注：\n`;
    for (const g of warns) {
      alertMsg += `\n• ${g.label}：${g.gapDescription}`;
    }
  }
  alertMsg += '\n\n📊 详细报告：reports/pdca-check-latest.json';

  // Use openclaw cron add --at +0s to send a one-shot message to main session
  try {
    const escaped = alertMsg.replace(/'/g, "'\\''");
    execSync(`openclaw cron add --name "pdca-alert-$(date +%s)" --at +0s --delete-after-run --session main --message '${escaped}' --light-context --no-deliver`, {
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    log('✅ Alert sent via openclaw cron one-shot');
  } catch (e) {
    log(`⚠️  Alert send failed: ${e.message}`);
    // Fallback: just log it
    log(`ALERT: ${alertMsg}`);
  }
}

// --- Append to history ---
function appendHistory(report) {
  try {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const entry = JSON.stringify({
      timestamp: report.timestamp,
      summary: report.summary,
      metrics: Object.fromEntries(
        Object.entries(report.metrics).map(([k, v]) => [k, { actual: v.actual, status: v.status, gap: v.gap }])
      ),
    });
    fs.appendFileSync(HISTORY_PATH, entry + '\n');
    log(`📈 History appended to ${HISTORY_PATH}`);
  } catch (e) {
    log(`⚠️  History append failed: ${e.message}`);
  }
}

// --- Main ---
function run() {
  log('🔄 PDCA Check Loop starting...');
  const timestamp = new Date().toISOString();
  const standards = loadStandards();
  
  // Collect metrics
  const collectors = {
    concurrencyUtil: measureConcurrency,
    timeoutRate: measureTimeoutRate,
    taskGranularity: measureTaskGranularity,
    ruleExpansionRate: measureRuleExpansion,
    badcaseAutoRate: measureBadcaseAutoRate,
    evalsetIntegrity: measureEvalsetIntegrity,
    skillHealth: measureSkillHealth,
  };

  const metrics = {};
  const gapAnalyses = [];

  for (const [key, collector] of Object.entries(collectors)) {
    const std = standards[key] || { target: null, direction: 'gte', warnThreshold: null };
    const measurement = collector();
    const st = status(measurement.actual, std);
    const gap = gapValue(measurement.actual, std.target, std.direction);
    
    metrics[key] = {
      label: std.label || key,
      actual: measurement.actual,
      target: std.target,
      gap,
      status: st,
      detail: measurement,
    };

    const gapAnalysis = analyzeGap(key, std.label || key, measurement.actual, std.target, std.direction, st);
    if (gapAnalysis) gapAnalyses.push(gapAnalysis);
  }

  // Build report
  const statuses = Object.values(metrics).map(m => m.status);
  const report = {
    timestamp,
    version: '2.0.0',
    metrics,
    gapAnalysis: gapAnalyses,
    summary: {
      total: statuses.length,
      ok: statuses.filter(s => s === 'ok').length,
      warn: statuses.filter(s => s === 'warn').length,
      critical: statuses.filter(s => s === 'critical').length,
      info: statuses.filter(s => s === 'info').length,
      overallHealth: statuses.includes('critical') ? 'critical' : statuses.includes('warn') ? 'warn' : 'ok',
    },
  };

  // Output
  const json = JSON.stringify(report, null, 2);
  console.log(json);

  // Write latest report
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, json, 'utf8');
  log(`✅ Report written to ${REPORT_PATH}`);

  // Append history
  appendHistory(report);

  // Send alert if needed
  if (report.summary.critical > 0 || report.summary.warn > 0) {
    sendAlert(gapAnalyses);
  }

  log(`🏁 PDCA Check complete: ${report.summary.overallHealth} (${report.summary.critical}C/${report.summary.warn}W/${report.summary.ok}OK/${report.summary.info}I)`);
}

run();
