#!/usr/bin/env node
'use strict';

/**
 * PDCA引擎 — 主入口
 *
 * 功能：
 * 1. advancePhase(taskId, targetPhase) — 推进PDCA阶段（状态机 + 门禁）
 * 2. getTaskState(taskId) — 查询任务PDCA状态
 * 3. 报告模式（保持兼容）— 生成human_report + 治理报告
 *
 * CLI：
 *   node index.js                          — 报告模式（兼容）
 *   node index.js --advance <taskId> <phase> — 推进任务阶段
 *   node index.js --state <taskId>         — 查看任务状态
 */

const fs = require('fs');
const path = require('path');
const {
  WORKSPACE,
  MEMORY_DIR,
  REPORTS_DIR,
  ensureDir,
  readJson,
  writeJson
} = require('../shared/paths');

const gates = require('./gates');
const { transition, getTaskState: smGetTaskState } = require('./state-machine');
const { emit, PDCA_EVENTS } = require('./event-emitter');

const TASKS_DIR = path.join(MEMORY_DIR, 'tasks');
const TASK_QUEUE_DIR = path.join(REPORTS_DIR, 'task-queue');
const LESSONS_DIR = path.join(WORKSPACE, 'skills', 'project-mgmt', 'lessons');
const METRICS_DIR = path.join(WORKSPACE, 'skills', 'project-mgmt', 'metrics');
const GOVERNANCE_REPORT = path.join(REPORTS_DIR, 'project-artifact-governance.md');
const GOVERNANCE_STATE = path.join(MEMORY_DIR, 'project-artifact-governance-state.json');

// ─── 任务读写 ───

function readTasks() {
  if (!fs.existsSync(TASKS_DIR)) return [];
  return fs.readdirSync(TASKS_DIR)
    .filter(name => name.endsWith('.json'))
    .map(name => {
      const file = path.join(TASKS_DIR, name);
      return { file, data: readJson(file, {}) };
    })
    .filter(item => item.data && item.data.id);
}

function readTask(taskId) {
  const file = path.join(TASKS_DIR, `${taskId}.json`);
  return readJson(file, null);
}

function writeTask(taskId, task) {
  ensureDir(TASKS_DIR);
  writeJson(path.join(TASKS_DIR, `${taskId}.json`), task);
}

// ─── 核心：阶段推进 ───

function advancePhase(taskId, targetPhase) {
  const task = readTask(taskId);
  if (!task) return { ok: false, error: `Task ${taskId} not found` };

  const currentPhase = task.pdca_phase || 'init';
  const result = transition(taskId, currentPhase, targetPhase, task);

  if (result.allowed) {
    // 更新任务中的pdca_phase
    task.pdca_phase = targetPhase;
    task.gates = task.gates || {};
    // 记录通过的门禁
    for (const gr of result.gateResults) {
      if (gr.passed) {
        task.gates[gr.gate] = { passed: true, timestamp: new Date().toISOString() };
      }
    }
    task.phase_history = task.phase_history || [];
    task.phase_history.push({
      from: currentPhase,
      to: targetPhase,
      timestamp: new Date().toISOString(),
      gates: result.gateResults.map(g => ({ gate: g.gate, passed: g.passed })),
    });
    writeTask(taskId, task);
  }

  // 🚨 Badcase自动记录（ISC-EVAL-ROLE-SEPARATION-001 等铁律违反）
  if (result.badcase) {
    const badcaseEntry = {
      id: `badcase-pdca-${Date.now()}`,
      rule: result.violation || 'unknown',
      task_id: taskId,
      executor: task.executor_agent,
      evaluator: task.evaluator_agent,
      timestamp: new Date().toISOString(),
      severity: 'critical',
      description: result.reason,
    };
    const badcasePath = path.join(MEMORY_DIR, 'badcases', `${badcaseEntry.id}.json`);
    ensureDir(path.dirname(badcasePath));
    writeJson(badcasePath, badcaseEntry);
  }

  return {
    ok: result.allowed,
    task_id: taskId,
    from: currentPhase,
    to: targetPhase,
    reason: result.reason || null,
    badcase: result.badcase || false,
    violation: result.violation || null,
    gate_results: result.gateResults,
  };
}

function getTaskState(taskId) {
  const task = readTask(taskId);
  const smState = smGetTaskState(taskId);
  return {
    task_id: taskId,
    pdca_phase: smState?.phase || task?.pdca_phase || 'init',
    history: smState?.history || task?.phase_history || [],
    gates: task?.gates || {},
  };
}

// ═══════════════════════════════════════════════
// 以下保留现有human_report功能（兼容 fde09338 和 1f21ea90）
// ═══════════════════════════════════════════════

function nowParts() {
  const now = new Date();
  const iso = now.toISOString();
  return { iso, date: iso.slice(0, 10), ym: iso.slice(0, 7) };
}

function classifyTask(task) {
  const title = `${task.title || ''} ${task.kind || ''} ${task.parent_task || ''}`;
  if (/项目管理产物沉淀机制|project|tracker|汇报|验收|集成改造/i.test(title)) return 'artifact-governance';
  if (/day2/i.test(title)) return 'day2';
  return 'generic';
}

function computeSummary(tasks) {
  const summary = {
    total: tasks.length, root: 0, sub: 0, done: 0, open: 0, doing: 0, blocked: 0,
    byKind: {}, byTrack: {},
    staleTasks: [], noAcceptance: [], topBlocked: [], highPriority: [],
  };
  const now = Date.now();
  const STALE_DAYS = 7;

  for (const { data: task } of tasks) {
    const status = task.status || 'open';
    const kind = task.kind || 'root';
    const track = classifyTask(task);

    if (task.parent_task) summary.sub += 1; else summary.root += 1;
    if (status === 'done') summary.done += 1;
    else if (status === 'doing' || status === 'active') summary.doing += 1;
    else if (status === 'blocked') summary.blocked += 1;
    else if (status !== 'archived') summary.open += 1;

    summary.byKind[kind] = (summary.byKind[kind] || 0) + 1;
    summary.byTrack[track] = (summary.byTrack[track] || 0) + 1;

    if (status !== 'done') {
      const updatedAt = task.updated_at || task.created_at;
      if (updatedAt) {
        const days = (now - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
        if (days > STALE_DAYS) {
          summary.staleTasks.push({ title: task.title || task.id, status, daysSinceUpdate: Math.floor(days), priority: task.priority || 'NA' });
        }
      }
    }
    if (status !== 'done' && (!task.acceptance || (Array.isArray(task.acceptance) && task.acceptance.length === 0))) {
      summary.noAcceptance.push({ title: task.title || task.id, status });
    }
    if (status === 'blocked') {
      summary.topBlocked.push({ title: task.title || task.id, priority: task.priority || 'NA', owner: task.owner || '未指派' });
    }
    if (status !== 'done' && /^P[01]$/i.test(task.priority || '')) {
      summary.highPriority.push({ title: task.title || task.id, status, priority: task.priority });
    }
  }
  return summary;
}

function ensureGovernanceArtifacts(tasks, summary) {
  const { date, ym, iso } = nowParts();
  ensureDir(LESSONS_DIR);
  ensureDir(METRICS_DIR);

  const lessonFile = path.join(LESSONS_DIR, `${date}-artifact-governance-closure.md`);
  const metricsFile = path.join(METRICS_DIR, `${ym}.json`);

  if (!fs.existsSync(lessonFile)) {
    const lesson = [
      '# Sprint: artifact-governance-closure',
      '## 目标 vs 实际',
      '- 计划: 建立项目管理产物沉淀、汇总、复盘、指标的闭环。',
      `- 实际交付: 已接入任务扫描、治理报告、lessons/metrics 自动落盘（时间 ${iso}）。`,
      '- 偏差原因: 当前先以文件级治理闭环为主，后续可再补事件总线触发。',
      '', '## 什么做对了', '- 将任务、报告、lessons、metrics 串成单条闭环。',
      '- 让项目管理产物不再只停留在 PROJECT-TRACKER。',
      '', '## 什么做错了', '- 早期只有扩列，没有沉淀节奏和治理报表。',
      '', '## 流程改进点', '- 具体改进: 每次治理运行自动刷新治理报告，并补 lessons/metrics。',
      '- 是否需要更新SKILL.md: yes',
    ].join('\n');
    fs.writeFileSync(lessonFile, lesson, 'utf8');
  }

  const metrics = readJson(metricsFile, {
    sprint: 'artifact-governance-closure', planned_days: 1, actual_days: 1,
    tasks_total: 0, tasks_completed: 0, tasks_blocked: 0, review_rejections: 0,
    parallel_ratio: 0, lessons_captured: 0, artifact_governance_runs: 0, artifact_coverage_ratio: 0,
  });
  metrics.tasks_total = summary.total;
  metrics.tasks_completed = summary.done;
  metrics.tasks_blocked = summary.blocked;
  metrics.lessons_captured = Math.max(metrics.lessons_captured || 0, 1);
  metrics.artifact_governance_runs = (metrics.artifact_governance_runs || 0) + 1;
  metrics.artifact_coverage_ratio = summary.total ? Number(((summary.done + summary.doing) / summary.total).toFixed(4)) : 0;
  writeJson(metricsFile, metrics);

  return { lessonFile, metricsFile };
}

function renderGovernanceReport(tasks, summary, artifacts) {
  const timestamp = new Date().toISOString();
  const focusTasks = tasks.map(i => i.data)
    .filter(t => /项目管理产物沉淀机制|Day2遗留项逐桩打透/i.test(`${t.title || ''} ${t.parent_task || ''}`))
    .slice(0, 12);

  const lines = [];
  lines.push('# 项目管理产物沉淀机制治理闭环报告', '',
    `- 生成时间: ${timestamp}`,
    '- 治理范围: task memory / PROJECT-TRACKER / task-queue report / lessons / metrics',
    '- 结论: 已形成"任务登记 → 汇总报告 → lessons复盘 → metrics计量"的最小闭环',
    '', '## 当前盘点', '',
    `- 任务总数: ${summary.total}`, `- 根任务: ${summary.root}`, `- 子任务: ${summary.sub}`,
    `- 完成: ${summary.done}`, `- 进行中: ${summary.doing}`, `- 未开始/开放: ${summary.open}`,
    `- 阻塞: ${summary.blocked}`,
    '', '## 治理动作', '',
    '- 已对任务目录进行扫描并生成聚合视图。',
    '- 已将项目管理经验沉淀到 lessons 目录。',
    '- 已将任务推进指标写入 metrics。',
    '- 已输出治理报告。',
    '', '## 关键任务追踪', '');

  if (!focusTasks.length) { lines.push('- 暂无聚焦任务命中。'); }
  else { for (const t of focusTasks) { lines.push(`- [${t.status || 'open'}] ${t.title} | kind=${t.kind || 'root'} | priority=${t.priority || 'NA'}`); } }

  lines.push('', '## 产物落点', '',
    `- task queue report: ${path.relative(WORKSPACE, path.join(TASK_QUEUE_DIR, 'latest-report.md'))}`,
    `- governance report: ${path.relative(WORKSPACE, GOVERNANCE_REPORT)}`,
    `- lessons: ${path.relative(WORKSPACE, artifacts.lessonFile)}`,
    `- metrics: ${path.relative(WORKSPACE, artifacts.metricsFile)}`);

  ensureDir(path.dirname(GOVERNANCE_REPORT));
  fs.writeFileSync(GOVERNANCE_REPORT, lines.join('\n'), 'utf8');
}

function validateCheckRoleSeparation(tasks) {
  const violations = [];
  for (const { data: task } of tasks) {
    const doer = task.owner || task.do_agent || '';
    const checker = task.checker || task.check_agent || '';
    if (doer && checker && doer === checker) {
      violations.push({ id: task.id, title: task.title || task.id, agent: doer,
        message: `任务「${task.title || task.id}」的执行者和评测者都是 ${doer}，违反Check环节角色分离原则` });
    }
  }
  return violations;
}

function priorityWeight(p) {
  if (/^P0$/i.test(p)) return 0;
  if (/^P1$/i.test(p)) return 1;
  if (/^P2$/i.test(p)) return 2;
  return 9;
}

function friendlyOwner(owner) {
  if (!owner) return '';
  if (/^main\/(unknown|auto)$/i.test(owner)) return '';
  if (/^subagent\//i.test(owner)) return '';
  if (/^ops\//i.test(owner)) return '';
  return owner;
}

function groupByParent(taskList) {
  const roots = [];
  const childrenOf = {};
  for (const t of taskList) {
    if (t.parent_task) { if (!childrenOf[t.parent_task]) childrenOf[t.parent_task] = []; childrenOf[t.parent_task].push(t); }
    else { roots.push(t); }
  }
  return { roots, childrenOf };
}

function generateHumanReport(tasks, summary, roleViolations) {
  const { date } = nowParts();
  const allTasks = tasks.map(item => item.data);
  const lines = [];
  lines.push(`# PDCA日报（${date}）`, '');

  const completionRate = summary.total > 0 ? ((summary.done / summary.total) * 100).toFixed(0) : '0';
  if (summary.done === 0 && summary.doing > 0) {
    lines.push(`**结论：${summary.doing}项工作正在推进，尚无交付完成项。需要聚焦收口。**`);
  } else if (summary.done > 0) {
    lines.push(`**结论：今日完成${summary.done}项交付，完成率${completionRate}%。${summary.blocked > 0 ? `有${summary.blocked}项阻塞需关注。` : '推进正常。'}**`);
  } else {
    lines.push(`**结论：全部${summary.total}项任务待启动，需要尽快破局。**`);
  }
  lines.push('');

  lines.push('## ✅ 今日完成');
  const doneTasks = allTasks.filter(t => t.status === 'done');
  if (!doneTasks.length) lines.push('暂无已完成任务。');
  else for (const t of doneTasks) { lines.push(`- ${t.title || t.id}${t.priority ? ` [${t.priority}]` : ''}`); }
  lines.push('');

  lines.push('## 🔄 正在进行');
  const doingTasks = allTasks.filter(t => t.status === 'doing' || t.status === 'active');
  if (!doingTasks.length) lines.push('暂无进行中任务。');
  else {
    doingTasks.sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority));
    for (const t of doingTasks) {
      const owner = friendlyOwner(t.owner);
      lines.push(`- ${t.title || t.id}${t.priority ? ` [${t.priority}]` : ''}${owner ? ` — ${owner}` : ''}`);
    }
  }
  lines.push('');

  lines.push('## 📋 待办事项');
  const openTasks = allTasks.filter(t => t.status === 'open');
  if (!openTasks.length) lines.push('暂无待办。');
  else {
    openTasks.sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority));
    const { roots, childrenOf } = groupByParent(openTasks);
    const shownIds = new Set();
    for (const root of roots) {
      const children = childrenOf[root.id] || [];
      lines.push(`- ${root.title || root.id}${root.priority ? ` [${root.priority}]` : ''}${children.length > 0 ? `（含${children.length}个子项）` : ''}`);
      shownIds.add(root.id);
    }
    const orphanParents = {};
    for (const t of openTasks) {
      if (!shownIds.has(t.id) && t.parent_task && !roots.find(r => r.id === t.parent_task)) {
        if (!orphanParents[t.parent_task]) orphanParents[t.parent_task] = [];
        orphanParents[t.parent_task].push(t);
      }
    }
    for (const [parentId, children] of Object.entries(orphanParents)) {
      const first = children[0];
      const parentName = (first.title || '').split('/')[0].trim() || parentId;
      lines.push(`- ${parentName}${first.priority ? ` [${first.priority}]` : ''}（${children.length}个子项待执行）`);
    }
  }
  lines.push('');

  lines.push('## ⚠️ 风险与阻塞');
  let hasRisks = false;
  if (summary.topBlocked.length > 0) { for (const t of summary.topBlocked) { lines.push(`- 🚧 「${t.title}」被阻塞，负责人：${t.owner}`); } hasRisks = true; }
  if (summary.staleTasks.length > 0) {
    const topStale = summary.staleTasks.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate).slice(0, 5);
    for (const t of topStale) { lines.push(`- ⏰ 「${t.title}」已${t.daysSinceUpdate}天未更新，可能停滞`); }
    if (summary.staleTasks.length > 5) lines.push(`- …另有${summary.staleTasks.length - 5}项超期未更新`);
    hasRisks = true;
  }
  if (summary.noAcceptance.length > 0) { lines.push(`- 📋 ${summary.noAcceptance.length}项任务缺验收标准`); hasRisks = true; }
  if (roleViolations.length > 0) { for (const v of roleViolations) { lines.push(`- 🔴 角色冲突：${v.message}`); } hasRisks = true; }
  if (!hasRisks) lines.push('当前无明显风险。');
  lines.push('');

  lines.push('## 💡 下一步建议');
  const suggestions = [];
  if (summary.blocked > 0) suggestions.push(`优先解除${summary.blocked}项阻塞`);
  const highP = summary.highPriority.filter(t => t.status !== 'done');
  if (highP.length > 0) {
    const parts = [];
    const p0c = highP.filter(t => /^P0$/i.test(t.priority)).length;
    const p1c = highP.filter(t => /^P1$/i.test(t.priority)).length;
    if (p0c > 0) parts.push(`${p0c}个P0`);
    if (p1c > 0) parts.push(`${p1c}个P1`);
    suggestions.push(`聚焦推进${parts.join('、')}高优任务`);
  }
  if (summary.done === 0 && summary.total > 0) suggestions.push('当前零完成，建议先挑最小可交付任务完成1个');
  if (summary.staleTasks.length > 0) suggestions.push(`清理${summary.staleTasks.length}项长期停滞任务`);
  if (summary.open > summary.total * 0.7) suggestions.push('超70%任务在待办，建议集中火力');
  if (summary.noAcceptance.length > 3) suggestions.push(`为${summary.noAcceptance.length}项任务补验收标准`);
  if (roleViolations.length > 0) suggestions.push('立即修复角色分离违规');
  if (!suggestions.length) suggestions.push('保持当前节奏，按优先级逐项推进');
  for (let i = 0; i < suggestions.length; i++) { lines.push(`${i + 1}. ${suggestions[i]}`); }
  return lines.join('\n');
}

// ─── run() 主入口 ───

async function run(input = {}, context = {}) {
  const stderrLogger = {
    info: (...a) => process.stderr.write(a.join(' ') + '\n'),
    warn: (...a) => process.stderr.write(a.join(' ') + '\n'),
    error: (...a) => process.stderr.write(a.join(' ') + '\n'),
  };
  const logger = context?.logger || stderrLogger;

  // 新功能：阶段推进
  if (input.action === 'advance') {
    return advancePhase(input.taskId, input.targetPhase);
  }
  if (input.action === 'state') {
    return { ok: true, ...getTaskState(input.taskId) };
  }

  // 兼容模式：报告生成
  logger.info?.('[pdca-engine] 启动项目管理产物治理闭环');

  const tasks = readTasks();
  const summary = computeSummary(tasks);
  const artifacts = ensureGovernanceArtifacts(tasks, summary);
  writeJson(GOVERNANCE_STATE, { last_run_at: new Date().toISOString(), summary, artifacts });
  renderGovernanceReport(tasks, summary, artifacts);

  const roleViolations = validateCheckRoleSeparation(tasks);
  if (roleViolations.length > 0) {
    logger.warn?.(`[pdca-engine] ⚠️ Check角色分离违规: ${roleViolations.length}项`);
  }

  const humanReport = generateHumanReport(tasks, summary, roleViolations);

  const leanSummary = {
    total: summary.total, root: summary.root, sub: summary.sub,
    done: summary.done, open: summary.open, doing: summary.doing, blocked: summary.blocked,
    stale_count: summary.staleTasks.length, no_acceptance_count: summary.noAcceptance.length,
    high_priority_count: summary.highPriority.length, byKind: summary.byKind, byTrack: summary.byTrack,
  };

  return {
    ok: true, skill: 'pdca-engine', mode: 'artifact-governance-closure',
    summary: leanSummary, human_report: humanReport,
    check_role_violations: roleViolations,
    governance_report: path.relative(WORKSPACE, GOVERNANCE_REPORT),
    lesson_file: path.relative(WORKSPACE, artifacts.lessonFile),
    metrics_file: path.relative(WORKSPACE, artifacts.metricsFile),
  };
}

module.exports = run;
module.exports.run = run;
module.exports.advancePhase = advancePhase;
module.exports.getTaskState = getTaskState;

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args[0] === '--advance' && args[1] && args[2]) {
    advancePhase(args[1], args[2]).then
      ? Promise.resolve(advancePhase(args[1], args[2])).then(r => console.log(JSON.stringify(r, null, 2)))
      : console.log(JSON.stringify(advancePhase(args[1], args[2]), null, 2));
  } else if (args[0] === '--state' && args[1]) {
    console.log(JSON.stringify(getTaskState(args[1]), null, 2));
  } else {
    run().then(result => {
      console.log(JSON.stringify(result, null, 2));
    }).catch(err => { console.error(err); process.exit(1); });
  }
}
