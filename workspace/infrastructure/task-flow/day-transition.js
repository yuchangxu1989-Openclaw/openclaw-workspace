'use strict';

/**
 * Day Transition Engine — Day级任务自动流转
 * 
 * 三层架构:
 *   感知层: 检测当前Day的完成标记 (reports/dayN-closure-conditions.md)
 *   认知层: 分析遗留问题 + 生成Day N+1 scope
 *   执行层: 写入scope/信号文件 + emit事件 + 记录日志
 * 
 * 触发方式:
 *   1. 事件触发: day.completed → 自动执行
 *   2. CLI: node day-transition.js [--day N] [--dry-run] [--force]
 *   3. API: require('./day-transition').transition(dayNum, opts)
 * 
 * @module infrastructure/task-flow/day-transition
 */

const fs = require('fs');
const path = require('path');

// ─── 路径常量 ───
const WORKSPACE = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(WORKSPACE, 'reports');
const SIGNALS_DIR = path.join(WORKSPACE, '.dto-signals');
const LOGS_DIR = path.join(__dirname, 'logs');
const TEMPLATES_DIR = path.join(__dirname, 'templates');

// ─── 确保目录存在 ───
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ════════════════════════════════════════════
//  感知层: Day完成状态检测
// ════════════════════════════════════════════

/**
 * 检测指定Day是否已完成
 * 
 * 判定逻辑(任一满足即视为完成):
 *   1. reports/dayN-closure-conditions.md 存在且包含"全部.*满足"或"全部.*通过"
 *   2. reports/dayN-closure-summary.md 存在
 *   3. .dto-signals/day-N-completed.signal 存在(手动标记)
 * 
 * @param {number} dayNum - Day编号
 * @returns {{ completed: boolean, source: string, conditions: string|null, summary: string|null }}
 */
function detectDayCompletion(dayNum) {
  const result = { completed: false, source: 'none', conditions: null, summary: null };
  
  // 检查1: closure-conditions
  const conditionsFile = path.join(REPORTS_DIR, `day${dayNum}-closure-conditions.md`);
  if (fs.existsSync(conditionsFile)) {
    const content = fs.readFileSync(conditionsFile, 'utf-8');
    result.conditions = content;
    // 检查是否明确标记全部通过
    if (/全部.*?[条个项].*?(?:已满足|已通过|通过)/i.test(content) ||
        /状态.*?[：:]\s*✅\s*全部/i.test(content) ||
        /ALL\s+PASS/i.test(content)) {
      result.completed = true;
      result.source = 'closure-conditions';
    }
  }
  
  // 检查2: closure-summary
  const summaryFile = path.join(REPORTS_DIR, `day${dayNum}-closure-summary.md`);
  if (fs.existsSync(summaryFile)) {
    result.summary = fs.readFileSync(summaryFile, 'utf-8');
    if (!result.completed) {
      result.completed = true;
      result.source = 'closure-summary';
    }
  }
  
  // 检查3: 手动信号文件
  const signalFile = path.join(SIGNALS_DIR, `day-${dayNum}-completed.signal`);
  if (fs.existsSync(signalFile)) {
    if (!result.completed) {
      result.completed = true;
      result.source = 'manual-signal';
    }
  }
  
  return result;
}

/**
 * 自动检测当前最高已完成的Day编号
 * @returns {number} 最高已完成Day号，未找到则返回0
 */
function detectCurrentDay() {
  let maxCompleted = 0;
  for (let d = 1; d <= 100; d++) {
    const detection = detectDayCompletion(d);
    if (detection.completed) {
      maxCompleted = d;
    } else {
      break; // Day是连续的，遇到未完成就停
    }
  }
  return maxCompleted;
}

// ════════════════════════════════════════════
//  认知层: 遗留问题分析 + Scope生成
// ════════════════════════════════════════════

/**
 * 从closure-summary中提取遗留问题(Gap)
 * @param {string} summaryContent - closure-summary的内容
 * @returns {Array<{id: string, severity: string, title: string, description: string}>}
 */
function extractCarryoverIssues(summaryContent) {
  if (!summaryContent) return [];
  
  const issues = [];
  const lines = summaryContent.split('\n');
  let inGapSection = false;
  let currentSeverity = 'medium';
  let issueCounter = 0;
  
  for (const line of lines) {
    // 检测Gap/已知问题/Day 2 计划/阻塞 等section
    if (/(?:已知\s*Gap|Day\s*\d+\s*计划|阻塞项|遗留|待修复|Carry\s*Over)/i.test(line)) {
      inGapSection = true;
      continue;
    }
    
    // section结束检测
    if (inGapSection && /^#{1,3}\s+\d+\./.test(line) && !/Gap|阻塞|遗留/.test(line)) {
      inGapSection = false;
      continue;
    }
    
    if (!inGapSection) continue;
    
    // 提取severity标记
    if (/🔴|阻塞|critical|P0/i.test(line)) currentSeverity = 'critical';
    else if (/🟡|需.*介入|P1/i.test(line)) currentSeverity = 'high';
    else if (/🟢|已有框架|P2/i.test(line)) currentSeverity = 'medium';
    
    // 提取编号列表项
    const listMatch = line.match(/^\s*(?:\d+\.\s*|\-\s*)\*\*(.+?)\*\*\s*(?:—|[-–])\s*(.+)/);
    if (listMatch) {
      issueCounter++;
      issues.push({
        id: `CO-${String(issueCounter).padStart(3, '0')}`,
        severity: currentSeverity,
        title: listMatch[1].trim(),
        description: listMatch[2].trim()
      });
      continue;
    }
    
    // 提取普通列表项(包含关键词)
    const simpleMatch = line.match(/^\s*(?:\d+\.\s*|\-\s*)(.+)/);
    if (simpleMatch && simpleMatch[1].length > 10) {
      const text = simpleMatch[1].trim();
      // 过滤纯状态行
      if (/修复|修复|优化|接入|补充|需要|必须|待|阻塞|gap/i.test(text)) {
        issueCounter++;
        issues.push({
          id: `CO-${String(issueCounter).padStart(3, '0')}`,
          severity: currentSeverity,
          title: text.replace(/\*\*/g, '').slice(0, 60),
          description: text.replace(/\*\*/g, '')
        });
      }
    }
  }
  
  return issues;
}

/**
 * 收集当前Day的已有报告清单
 * @param {number} dayNum
 * @returns {string[]} 报告文件名列表
 */
function collectDayReports(dayNum) {
  try {
    const files = fs.readdirSync(REPORTS_DIR);
    return files.filter(f => 
      f.startsWith(`day${dayNum}-`) || f.startsWith(`d${dayNum}-`)
    ).sort();
  } catch { return []; }
}

/**
 * 估算任务时间(基于severity和description长度的简单启发式)
 * @param {{ severity: string, description: string }} issue
 * @returns {string} 时间估算
 */
function estimateTime(issue) {
  const complexWords = /架构|重构|pipeline|端到端|E2E|集成|benchmark/i;
  const isComplex = complexWords.test(issue.description);
  
  switch (issue.severity) {
    case 'critical': return isComplex ? '2-4h' : '1-2h';
    case 'high': return isComplex ? '1-3h' : '0.5-1.5h';
    case 'medium': return isComplex ? '1-2h' : '0.5-1h';
    default: return '0.5-1h';
  }
}

/**
 * 按severity排序：critical > high > medium > low
 * @param {Array} issues
 * @returns {Array} 排序后的issues
 */
function prioritizeIssues(issues) {
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...issues].sort((a, b) => 
    (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
  );
}

/**
 * 生成Day N+1的scope文档内容
 * @param {number} nextDay
 * @param {object} context - { completedDay, issues, reports, detection }
 * @returns {string} Markdown内容
 */
function generateDayScope(nextDay, context) {
  const { completedDay, issues, reports, detection } = context;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const prioritized = prioritizeIssues(issues);
  
  const criticalCount = prioritized.filter(i => i.severity === 'critical').length;
  const highCount = prioritized.filter(i => i.severity === 'high').length;
  const mediumCount = prioritized.filter(i => i.severity === 'medium').length;
  
  let totalEstimate = 0;
  prioritized.forEach(i => {
    const est = estimateTime(i);
    const match = est.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)/);
    if (match) totalEstimate += (parseFloat(match[1]) + parseFloat(match[2])) / 2;
  });
  
  let md = `# Day ${nextDay} Scope — 自动生成\n\n`;
  md += `**生成时间**: ${now}\n`;
  md += `**触发来源**: Day ${completedDay} 完成 (via ${detection.source})\n`;
  md += `**生成方式**: day-transition.js 自动流转\n\n`;
  md += `---\n\n`;
  
  // TL;DR
  md += `## TL;DR\n\n`;
  md += `Day ${completedDay} 全部关闭条件已满足。`;
  md += `自动流转至 Day ${nextDay}，`;
  md += `携带 ${issues.length} 个遗留事项（🔴 ${criticalCount} critical / 🟡 ${highCount} high / 🟢 ${mediumCount} medium）。`;
  md += `预估总工时: ${totalEstimate.toFixed(1)}h。\n\n`;
  
  // 遗留问题清单
  md += `## 遗留问题（Carry-Over from Day ${completedDay}）\n\n`;
  if (prioritized.length === 0) {
    md += `✅ 无遗留问题，Day ${completedDay} 清洁关闭。\n\n`;
  } else {
    md += `| # | ID | Severity | 标题 | 时间估算 |\n`;
    md += `|---|-----|----------|------|----------|\n`;
    prioritized.forEach((issue, idx) => {
      const sevEmoji = { critical: '🔴', high: '🟡', medium: '🟢', low: '⚪' }[issue.severity] || '⚪';
      md += `| ${idx + 1} | ${issue.id} | ${sevEmoji} ${issue.severity} | ${issue.title} | ${estimateTime(issue)} |\n`;
    });
    md += `\n`;
    
    // 详细描述
    md += `### 详细描述\n\n`;
    prioritized.forEach(issue => {
      const sevEmoji = { critical: '🔴', high: '🟡', medium: '🟢', low: '⚪' }[issue.severity] || '⚪';
      md += `#### ${sevEmoji} ${issue.id}: ${issue.title}\n\n`;
      md += `- **Severity**: ${issue.severity}\n`;
      md += `- **来源**: Day ${completedDay} closure-summary\n`;
      md += `- **描述**: ${issue.description}\n`;
      md += `- **预估**: ${estimateTime(issue)}\n\n`;
    });
  }
  
  // 新增需求占位
  md += `## 新增需求（Day ${nextDay} 专项）\n\n`;
  md += `> 以下为自动生成的占位区域，由用户或DTO填充具体需求。\n\n`;
  md += `- [ ] _待填充: 基于Day ${completedDay}成果的下一步目标_\n`;
  md += `- [ ] _待填充: 新发现的技术债务或改进点_\n`;
  md += `- [ ] _待填充: 外部依赖或环境变更_\n\n`;
  
  // 优先级排序
  md += `## 执行优先级\n\n`;
  md += `**原则**: Critical阻塞项优先，High项次之，Medium项在空闲时处理。\n\n`;
  
  const phases = [
    { name: 'Phase 1 — 阻塞修复', filter: i => i.severity === 'critical', desc: '必须在Day开始2h内完成' },
    { name: 'Phase 2 — 核心推进', filter: i => i.severity === 'high', desc: '主力工作，占Day 60%时间' },
    { name: 'Phase 3 — 持续优化', filter: i => i.severity === 'medium', desc: '有空闲即推进，不阻塞主线' }
  ];
  
  phases.forEach(phase => {
    const items = prioritized.filter(phase.filter);
    md += `### ${phase.name}\n`;
    md += `_${phase.desc}_\n\n`;
    if (items.length === 0) {
      md += `无。\n\n`;
    } else {
      items.forEach(i => {
        md += `- [ ] **${i.id}** ${i.title} (${estimateTime(i)})\n`;
      });
      md += `\n`;
    }
  });
  
  // 时间估算
  md += `## 时间估算\n\n`;
  md += `| 阶段 | 事项数 | 预估工时 |\n`;
  md += `|------|--------|----------|\n`;
  phases.forEach(phase => {
    const items = prioritized.filter(phase.filter);
    let phaseEst = 0;
    items.forEach(i => {
      const est = estimateTime(i);
      const m = est.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)/);
      if (m) phaseEst += (parseFloat(m[1]) + parseFloat(m[2])) / 2;
    });
    md += `| ${phase.name.split('—')[0].trim()} | ${items.length} | ${phaseEst.toFixed(1)}h |\n`;
  });
  md += `| **合计** | **${prioritized.length}** | **${totalEstimate.toFixed(1)}h** |\n\n`;
  
  // Day来源报告
  md += `## Day ${completedDay} 报告索引\n\n`;
  if (reports.length === 0) {
    md += `无关联报告。\n`;
  } else {
    reports.forEach(r => {
      md += `- \`reports/${r}\`\n`;
    });
  }
  md += `\n`;
  
  // 验收标准
  md += `## Day ${nextDay} 关闭条件\n\n`;
  md += `> 自动生成的初始关闭条件，可由用户调整。\n\n`;
  
  let condIdx = 0;
  prioritized.filter(i => i.severity === 'critical').forEach(i => {
    condIdx++;
    md += `${condIdx}. **${i.id} 修复验证** — ${i.title}修复后通过回归测试\n`;
  });
  if (prioritized.filter(i => i.severity === 'high').length > 0) {
    condIdx++;
    md += `${condIdx}. **High项完成率 ≥ 80%** — ${highCount}个High项中至少${Math.ceil(highCount * 0.8)}个完成\n`;
  }
  condIdx++;
  md += `${condIdx}. **无新增Critical** — Day ${nextDay}执行期间不产生新的Critical阻塞\n`;
  condIdx++;
  md += `${condIdx}. **报告快照锁定** — 所有Day ${nextDay}报告生成快照并锁定\n`;
  
  md += `\n---\n\n`;
  md += `*本文档由 day-transition.js 自动生成，基于 Day ${completedDay} closure数据分析。*\n`;
  
  return md;
}

// ════════════════════════════════════════════
//  执行层: 文件写入 + 信号发射 + 日志记录
// ════════════════════════════════════════════

/**
 * 写入DTO信号文件，供DTO调度系统消费
 * @param {number} nextDay
 * @param {Array} issues
 */
function emitDTOSignals(nextDay, issues) {
  ensureDir(SIGNALS_DIR);
  
  // 1. Day开始信号
  const startSignal = {
    type: 'day.started',
    day: nextDay,
    timestamp: new Date().toISOString(),
    source: 'day-transition',
    payload: {
      carryOverCount: issues.length,
      criticalCount: issues.filter(i => i.severity === 'critical').length,
      scopeFile: `reports/day${nextDay}-scope.md`
    }
  };
  
  fs.writeFileSync(
    path.join(SIGNALS_DIR, `day-${nextDay}-started.signal`),
    JSON.stringify(startSignal, null, 2),
    'utf-8'
  );
  
  // 2. 每个Critical项生成独立任务信号
  issues.filter(i => i.severity === 'critical').forEach(issue => {
    const taskSignal = {
      type: 'task.created',
      day: nextDay,
      timestamp: new Date().toISOString(),
      source: 'day-transition',
      payload: {
        taskId: `day${nextDay}-${issue.id}`,
        title: issue.title,
        severity: issue.severity,
        estimate: estimateTime(issue),
        origin: 'carry-over'
      }
    };
    
    fs.writeFileSync(
      path.join(SIGNALS_DIR, `day${nextDay}-task-${issue.id.toLowerCase()}.signal`),
      JSON.stringify(taskSignal, null, 2),
      'utf-8'
    );
  });
}

/**
 * 写入EventBus事件(如果可用)
 * @param {number} nextDay
 * @param {number} completedDay
 */
function emitBusEvent(nextDay, completedDay) {
  try {
    const busAdapter = require('../event-bus/bus-adapter');
    busAdapter.emit('day.started', {
      day: nextDay,
      previousDay: completedDay,
      scopeFile: `reports/day${nextDay}-scope.md`
    }, 'day-transition');
  } catch (e) {
    // EventBus不可用时静默降级，信号文件仍然有效
    log('warn', `EventBus emit failed (non-fatal): ${e.message}`);
  }
}

/**
 * 写入transition日志
 * @param {string} level - info|warn|error
 * @param {string} message
 * @param {object} [data]
 */
function log(level, message, data) {
  ensureDir(LOGS_DIR);
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(data ? { data } : {})
  };
  const logFile = path.join(LOGS_DIR, 'day-transition.log');
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf-8');
}

// ════════════════════════════════════════════
//  主流程编排
// ════════════════════════════════════════════

/**
 * 执行Day流转
 * 
 * @param {number} [dayNum] - 要检测完成状态的Day号，省略则自动检测
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun=false] - 干跑模式，只分析不写入
 * @param {boolean} [opts.force=false] - 强制流转，跳过完成检测
 * @returns {{ success: boolean, nextDay: number, scopeFile: string, issues: Array, error?: string }}
 */
function transition(dayNum, opts = {}) {
  const { dryRun = false, force = false } = opts;
  const startTime = Date.now();
  
  // ── 感知层 ──
  if (!dayNum) {
    dayNum = detectCurrentDay();
    if (dayNum === 0) {
      log('info', 'No completed Day detected, nothing to transition');
      return { success: false, nextDay: 0, scopeFile: null, issues: [], error: 'No completed Day found' };
    }
  }
  
  const detection = detectDayCompletion(dayNum);
  
  if (!detection.completed && !force) {
    log('info', `Day ${dayNum} not completed yet`, { source: detection.source });
    return { 
      success: false, nextDay: dayNum + 1, scopeFile: null, issues: [], 
      error: `Day ${dayNum} not yet completed. Use --force to override.`
    };
  }
  
  log('info', `Day ${dayNum} completion detected`, { source: detection.source });
  
  const nextDay = dayNum + 1;
  
  // 检查是否已经流转过
  const existingScope = path.join(REPORTS_DIR, `day${nextDay}-scope.md`);
  if (fs.existsSync(existingScope) && !force) {
    log('info', `Day ${nextDay} scope already exists, skipping`, { file: existingScope });
    return {
      success: true, nextDay, scopeFile: existingScope, issues: [],
      error: `Day ${nextDay} scope already exists. Use --force to regenerate.`
    };
  }
  
  // ── 认知层 ──
  // 获取closure-summary(优先)或closure-conditions
  const summaryContent = detection.summary || detection.conditions || '';
  const issues = extractCarryoverIssues(summaryContent);
  const reports = collectDayReports(dayNum);
  
  log('info', `Extracted ${issues.length} carry-over issues from Day ${dayNum}`, {
    critical: issues.filter(i => i.severity === 'critical').length,
    high: issues.filter(i => i.severity === 'high').length,
    medium: issues.filter(i => i.severity === 'medium').length
  });
  
  // 生成scope
  const scopeContent = generateDayScope(nextDay, {
    completedDay: dayNum,
    issues,
    reports,
    detection
  });
  
  if (dryRun) {
    log('info', `[DRY RUN] Would write Day ${nextDay} scope`, { issueCount: issues.length });
    return { success: true, nextDay, scopeFile: null, issues, dryRun: true, scopeContent };
  }
  
  // ── 执行层 ──
  // 写入scope文件
  ensureDir(REPORTS_DIR);
  const scopeFile = path.join(REPORTS_DIR, `day${nextDay}-scope.md`);
  fs.writeFileSync(scopeFile, scopeContent, 'utf-8');
  log('info', `Wrote Day ${nextDay} scope`, { file: scopeFile });
  
  // 发射DTO信号
  emitDTOSignals(nextDay, issues);
  log('info', `Emitted 本地任务编排 signals for Day ${nextDay}`);
  
  // 发射EventBus事件
  emitBusEvent(nextDay, dayNum);
  
  const elapsed = Date.now() - startTime;
  log('info', `Day transition ${dayNum} → ${nextDay} completed in ${elapsed}ms`, {
    issueCount: issues.length,
    scopeFile,
    elapsed
  });
  
  return { success: true, nextDay, scopeFile, issues };
}

// ════════════════════════════════════════════
//  事件处理器注册(供EventBus handler加载)
// ════════════════════════════════════════════

/**
 * EventBus handler 接口
 * 注册为: day.completed → transition()
 */
const handler = {
  name: 'day-transition',
  events: ['day.completed'],
  handle(event) {
    const dayNum = event.payload?.day || event.payload?.dayNum;
    if (!dayNum) {
      log('warn', 'day.completed event missing day number', { event });
      return { success: false, error: 'Missing day number in event payload' };
    }
    return transition(dayNum);
  }
};

// ════════════════════════════════════════════
//  CLI入口
// ════════════════════════════════════════════

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const dayIdx = args.indexOf('--day');
  const dayNum = dayIdx !== -1 ? parseInt(args[dayIdx + 1], 10) : undefined;
  
  console.log('═══ Day Transition Engine ═══');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'} | Force: ${force}`);
  
  if (dayNum) {
    console.log(`Target: Day ${dayNum} → Day ${dayNum + 1}`);
  } else {
    console.log('Target: Auto-detect');
  }
  console.log('');
  
  const result = transition(dayNum, { dryRun, force });
  
  if (result.success) {
    console.log(`✅ Transition successful: Day ${result.nextDay - 1} → Day ${result.nextDay}`);
    console.log(`   Carry-over issues: ${result.issues.length}`);
    if (result.scopeFile) {
      console.log(`   Scope file: ${result.scopeFile}`);
    }
    if (result.dryRun) {
      console.log('\n--- DRY RUN PREVIEW ---\n');
      console.log(result.scopeContent);
    }
  } else {
    console.log(`❌ Transition failed: ${result.error}`);
    process.exit(1);
  }
}

// ════════════════════════════════════════════
//  导出
// ════════════════════════════════════════════

module.exports = {
  transition,
  detectDayCompletion,
  detectCurrentDay,
  extractCarryoverIssues,
  generateDayScope,
  handler
};
