#!/usr/bin/env node
'use strict';

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

const TASKS_DIR = path.join(MEMORY_DIR, 'tasks');
const TASK_QUEUE_DIR = path.join(REPORTS_DIR, 'task-queue');
const LESSONS_DIR = path.join(WORKSPACE, 'skills', 'project-mgmt', 'lessons');
const METRICS_DIR = path.join(WORKSPACE, 'skills', 'project-mgmt', 'metrics');
const GOVERNANCE_REPORT = path.join(REPORTS_DIR, 'project-artifact-governance.md');
const GOVERNANCE_STATE = path.join(MEMORY_DIR, 'project-artifact-governance-state.json');

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

function nowParts() {
  const now = new Date();
  const iso = now.toISOString();
  return {
    iso,
    date: iso.slice(0, 10),
    ym: iso.slice(0, 7)
  };
}

function classifyTask(task) {
  const title = `${task.title || ''} ${task.kind || ''} ${task.parent_task || ''}`;
  if (/项目管理产物沉淀机制|project|tracker|汇报|验收|集成改造/i.test(title)) return 'artifact-governance';
  if (/day2/i.test(title)) return 'day2';
  return 'generic';
}

function computeSummary(tasks) {
  const summary = {
    total: tasks.length,
    root: 0,
    sub: 0,
    done: 0,
    open: 0,
    doing: 0,
    blocked: 0,
    byKind: {},
    byTrack: {},
    staleTasks: [],       // open/doing 超过7天未更新
    noAcceptance: [],     // 缺少验收标准
    topBlocked: [],       // 阻塞任务
    highPriority: []      // P0/P1 且未完成
  };

  const now = Date.now();
  const STALE_DAYS = 7;

  for (const { data: task } of tasks) {
    const status = task.status || 'open';
    const kind = task.kind || 'root';
    const track = classifyTask(task);

    if (task.parent_task) summary.sub += 1;
    else summary.root += 1;

    if (status === 'done') summary.done += 1;
    else if (status === 'doing' || status === 'active') summary.doing += 1;
    else if (status === 'blocked') summary.blocked += 1;
    else if (status === 'archived') { /* skip archived from counts */ }
    else summary.open += 1;

    summary.byKind[kind] = (summary.byKind[kind] || 0) + 1;
    summary.byTrack[track] = (summary.byTrack[track] || 0) + 1;

    // 识别长期滞留任务（open/doing 超过7天未更新）
    if (status !== 'done') {
      const updatedAt = task.updated_at || task.created_at;
      if (updatedAt) {
        const daysSinceUpdate = (now - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceUpdate > STALE_DAYS) {
          summary.staleTasks.push({
            title: task.title || task.id,
            status,
            daysSinceUpdate: Math.floor(daysSinceUpdate),
            priority: task.priority || 'NA'
          });
        }
      }
    }

    // 识别缺少验收标准的任务
    if (status !== 'done' && (!task.acceptance || (Array.isArray(task.acceptance) && task.acceptance.length === 0))) {
      summary.noAcceptance.push({ title: task.title || task.id, status });
    }

    // 收集阻塞任务
    if (status === 'blocked') {
      summary.topBlocked.push({
        title: task.title || task.id,
        priority: task.priority || 'NA',
        owner: task.owner || '未指派'
      });
    }

    // 收集高优先级未完成任务
    if (status !== 'done' && /^P[01]$/i.test(task.priority || '')) {
      summary.highPriority.push({
        title: task.title || task.id,
        status,
        priority: task.priority
      });
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
      '',
      '## 什么做对了',
      '- 将任务、报告、lessons、metrics 串成单条闭环。',
      '- 让项目管理产物不再只停留在 PROJECT-TRACKER。',
      '',
      '## 什么做错了',
      '- 早期只有扩列，没有沉淀节奏和治理报表。',
      '',
      '## 流程改进点',
      '- 具体改进: 每次治理运行自动刷新治理报告，并补 lessons/metrics。',
      '- 是否需要更新SKILL.md: yes'
    ].join('\n');
    fs.writeFileSync(lessonFile, lesson, 'utf8');
  }

  const metrics = readJson(metricsFile, {
    sprint: 'artifact-governance-closure',
    planned_days: 1,
    actual_days: 1,
    tasks_total: 0,
    tasks_completed: 0,
    tasks_blocked: 0,
    review_rejections: 0,
    parallel_ratio: 0,
    lessons_captured: 0,
    artifact_governance_runs: 0,
    artifact_coverage_ratio: 0
  });

  metrics.sprint = 'artifact-governance-closure';
  metrics.planned_days = Math.max(metrics.planned_days || 1, 1);
  metrics.actual_days = Math.max(metrics.actual_days || 1, 1);
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
  const focusTasks = tasks
    .map(item => item.data)
    .filter(task => /项目管理产物沉淀机制|Day2遗留项逐桩打透/i.test(`${task.title || ''} ${task.parent_task || ''}`))
    .slice(0, 12);

  const lines = [];
  lines.push('# 项目管理产物沉淀机制治理闭环报告');
  lines.push('');
  lines.push(`- 生成时间: ${timestamp}`);
  lines.push(`- 治理范围: task memory / PROJECT-TRACKER / task-queue report / lessons / metrics`);
  lines.push(`- 结论: 已形成“任务登记 → 汇总报告 → lessons复盘 → metrics计量”的最小闭环`);
  lines.push('');
  lines.push('## 当前盘点');
  lines.push('');
  lines.push(`- 任务总数: ${summary.total}`);
  lines.push(`- 根任务: ${summary.root}`);
  lines.push(`- 子任务: ${summary.sub}`);
  lines.push(`- 完成: ${summary.done}`);
  lines.push(`- 进行中: ${summary.doing}`);
  lines.push(`- 未开始/开放: ${summary.open}`);
  lines.push(`- 阻塞: ${summary.blocked}`);
  lines.push('');
  lines.push('## 治理动作');
  lines.push('');
  lines.push('- 已对任务目录进行扫描并生成聚合视图。');
  lines.push('- 已将项目管理经验沉淀到 lessons 目录，避免只在对话里存在。');
  lines.push('- 已将任务推进指标写入 metrics，便于后续按月回看。');
  lines.push('- 已输出治理报告，作为 Day2 Gap5 集成改造硬产物。');
  lines.push('');
  lines.push('## 关键任务追踪');
  lines.push('');

  if (!focusTasks.length) {
    lines.push('- 暂无聚焦任务命中。');
  } else {
    for (const task of focusTasks) {
      lines.push(`- [${task.status || 'open'}] ${task.title} | kind=${task.kind || 'root'} | priority=${task.priority || 'NA'}`);
    }
  }

  lines.push('');
  lines.push('## 产物落点');
  lines.push('');
  lines.push(`- task queue report: ${path.relative(WORKSPACE, path.join(TASK_QUEUE_DIR, 'latest-report.md'))}`);
  lines.push(`- governance report: ${path.relative(WORKSPACE, GOVERNANCE_REPORT)}`);
  lines.push(`- lessons: ${path.relative(WORKSPACE, artifacts.lessonFile)}`);
  lines.push(`- metrics: ${path.relative(WORKSPACE, artifacts.metricsFile)}`);
  lines.push('');
  lines.push('## 下一步');
  lines.push('');
  lines.push('- 把治理运行接入 cron / event 触发，而不是只靠人工执行。');
  lines.push('- 为关键任务补完成态回写规则，减少 open 长期滞留。');
  lines.push('- 把治理报告纳入 Day 级验收清单。');

  ensureDir(path.dirname(GOVERNANCE_REPORT));
  fs.writeFileSync(GOVERNANCE_REPORT, lines.join('\n'), 'utf8');
}

// ─── Check环节角色分离校验 ───
// 用户铁令：Do阶段执行者 ≠ Check阶段评测者，否则报错
function validateCheckRoleSeparation(tasks) {
  const violations = [];
  for (const { data: task } of tasks) {
    const doer = task.owner || task.do_agent || '';
    const checker = task.checker || task.check_agent || '';
    if (doer && checker && doer === checker) {
      violations.push({
        id: task.id,
        title: task.title || task.id,
        agent: doer,
        message: `任务「${task.title || task.id}」的执行者和评测者都是 ${doer}，违反Check环节角色分离原则`
      });
    }
  }
  return violations;
}

// ─── 优先级排序权重 ───
function priorityWeight(p) {
  if (/^P0$/i.test(p)) return 0;
  if (/^P1$/i.test(p)) return 1;
  if (/^P2$/i.test(p)) return 2;
  return 9;
}

// ─── 友好化owner名称 ───
function friendlyOwner(owner) {
  if (!owner) return '';
  // "subagent/gpt-5.4" → "子任务代理"
  // "main/unknown" → ""
  // "ops/governance" → "运维治理"
  if (/^main\/(unknown|auto)$/i.test(owner)) return '';
  if (/^subagent\//i.test(owner)) return '';
  if (/^ops\//i.test(owner)) return '';
  return owner;
}

// ─── 按父任务分组，只展示根任务+子任务数 ───
function groupByParent(taskList) {
  const roots = [];
  const childrenOf = {};
  for (const t of taskList) {
    if (t.parent_task) {
      if (!childrenOf[t.parent_task]) childrenOf[t.parent_task] = [];
      childrenOf[t.parent_task].push(t);
    } else {
      roots.push(t);
    }
  }
  return { roots, childrenOf };
}

// ─── 生成人类可读报告 ───
function generateHumanReport(tasks, summary, roleViolations) {
  const { date } = nowParts();
  const allTasks = tasks.map(item => item.data);
  const lines = [];

  // ── 标题 + 一句话结论 ──
  lines.push(`# PDCA日报（${date}）`);
  lines.push('');

  // 一句话总结：先结论
  const completionRate = summary.total > 0
    ? ((summary.done / summary.total) * 100).toFixed(0)
    : '0';
  if (summary.done === 0 && summary.doing > 0) {
    lines.push(`**结论：${summary.doing}项工作正在推进，尚无交付完成项。需要聚焦收口。**`);
  } else if (summary.done > 0) {
    lines.push(`**结论：今日完成${summary.done}项交付，完成率${completionRate}%。${summary.blocked > 0 ? `有${summary.blocked}项阻塞需关注。` : '推进正常。'}**`);
  } else {
    lines.push(`**结论：全部${summary.total}项任务待启动，需要尽快破局。**`);
  }
  lines.push('');

  // ── 1. 今日完成 ──
  lines.push('## ✅ 今日完成');
  const doneTasks = allTasks.filter(t => t.status === 'done');
  if (doneTasks.length === 0) {
    lines.push('暂无已完成任务。');
  } else {
    for (const t of doneTasks) {
      const pTag = t.priority ? ` [${t.priority}]` : '';
      lines.push(`- ${t.title || t.id}${pTag}`);
    }
  }
  lines.push('');

  // ── 2. 正在进行 ──
  lines.push('## 🔄 正在进行');
  const doingTasks = allTasks.filter(t => t.status === 'doing' || t.status === 'active');
  if (doingTasks.length === 0) {
    lines.push('暂无进行中任务。');
  } else {
    // 按优先级排序
    doingTasks.sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority));
    for (const t of doingTasks) {
      const pTag = t.priority ? ` [${t.priority}]` : '';
      const owner = friendlyOwner(t.owner);
      const ownerTag = owner ? ` — ${owner}` : '';
      lines.push(`- ${t.title || t.id}${pTag}${ownerTag}`);
    }
  }
  lines.push('');

  // ── 3. 待办 ──
  lines.push('## 📋 待办事项');
  const openTasks = allTasks.filter(t => t.status === 'open');
  if (openTasks.length === 0) {
    lines.push('暂无待办。');
  } else {
    // 按优先级排序，只展示根任务+子任务概要
    openTasks.sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority));
    const { roots, childrenOf } = groupByParent(openTasks);

    // 先展示有子任务的根任务（聚合显示）
    const shownIds = new Set();
    for (const root of roots) {
      const children = childrenOf[root.id] || [];
      const pTag = root.priority ? ` [${root.priority}]` : '';
      if (children.length > 0) {
        lines.push(`- ${root.title || root.id}${pTag}（含${children.length}个子项）`);
      } else {
        lines.push(`- ${root.title || root.id}${pTag}`);
      }
      shownIds.add(root.id);
    }

    // 展示没有匹配根任务的子任务（按parent分组）
    const orphanParents = {};
    for (const t of openTasks) {
      if (!shownIds.has(t.id) && t.parent_task && !roots.find(r => r.id === t.parent_task)) {
        if (!orphanParents[t.parent_task]) orphanParents[t.parent_task] = [];
        orphanParents[t.parent_task].push(t);
      }
    }
    for (const [parentId, children] of Object.entries(orphanParents)) {
      const firstChild = children[0];
      // 从子任务title提取父名（"父 / 子"格式）
      const parentName = (firstChild.title || '').split('/')[0].trim() || parentId;
      const pTag = firstChild.priority ? ` [${firstChild.priority}]` : '';
      lines.push(`- ${parentName}${pTag}（${children.length}个子项待执行）`);
    }
  }
  lines.push('');

  // ── 4. 风险 ──
  lines.push('## ⚠️ 风险与阻塞');
  let hasRisks = false;

  if (summary.topBlocked.length > 0) {
    for (const t of summary.topBlocked) {
      lines.push(`- 🚧 「${t.title}」被阻塞，负责人：${t.owner}`);
    }
    hasRisks = true;
  }

  if (summary.staleTasks.length > 0) {
    const topStale = summary.staleTasks
      .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate)
      .slice(0, 5);
    for (const t of topStale) {
      lines.push(`- ⏰ 「${t.title}」已${t.daysSinceUpdate}天未更新，可能停滞`);
    }
    if (summary.staleTasks.length > 5) {
      lines.push(`- …另有${summary.staleTasks.length - 5}项超期未更新`);
    }
    hasRisks = true;
  }

  if (summary.noAcceptance.length > 0) {
    lines.push(`- 📋 ${summary.noAcceptance.length}项任务缺验收标准，交付后无法判定完成`);
    hasRisks = true;
  }

  if (roleViolations.length > 0) {
    for (const v of roleViolations) {
      lines.push(`- 🔴 角色冲突：${v.message}`);
    }
    hasRisks = true;
  }

  if (!hasRisks) {
    lines.push('当前无明显风险。');
  }
  lines.push('');

  // ── 5. 下一步建议 ──
  lines.push('## 💡 下一步建议');
  const suggestions = [];

  if (summary.blocked > 0) {
    suggestions.push(`优先解除${summary.blocked}项阻塞，扫清推进障碍`);
  }

  const highP = summary.highPriority.filter(t => t.status !== 'done');
  if (highP.length > 0) {
    const p0Count = highP.filter(t => /^P0$/i.test(t.priority)).length;
    const p1Count = highP.filter(t => /^P1$/i.test(t.priority)).length;
    const parts = [];
    if (p0Count > 0) parts.push(`${p0Count}个P0`);
    if (p1Count > 0) parts.push(`${p1Count}个P1`);
    suggestions.push(`聚焦推进${parts.join('、')}高优任务`);
  }

  if (summary.done === 0 && summary.total > 0) {
    suggestions.push('当前零完成，建议先挑最小可交付任务完成1个，建立推进节奏');
  }

  if (summary.staleTasks.length > 0) {
    suggestions.push(`清理${summary.staleTasks.length}项长期停滞任务——要么推进，要么关闭`);
  }

  if (summary.open > summary.total * 0.7) {
    suggestions.push('超70%任务还在待办，建议控制并行数，集中火力');
  }

  if (summary.noAcceptance.length > 3) {
    suggestions.push(`为${summary.noAcceptance.length}项任务补验收标准，否则做完也算不清`);
  }

  if (roleViolations.length > 0) {
    suggestions.push('立即修复角色分离违规：Do执行者不能同时做Check评测');
  }

  if (suggestions.length === 0) {
    suggestions.push('保持当前节奏，按优先级逐项推进');
  }

  for (let i = 0; i < suggestions.length; i++) {
    lines.push(`${i + 1}. ${suggestions[i]}`);
  }

  return lines.join('\n');
}

async function run(input = {}, context = {}) {
  const stderrLogger = {
    info: (...args) => process.stderr.write(args.join(' ') + '\n'),
    warn: (...args) => process.stderr.write(args.join(' ') + '\n'),
    error: (...args) => process.stderr.write(args.join(' ') + '\n')
  };
  const logger = context?.logger || stderrLogger;
  logger.info?.('[pdca-engine] 启动项目管理产物治理闭环');

  const tasks = readTasks();
  const summary = computeSummary(tasks);
  const artifacts = ensureGovernanceArtifacts(tasks, summary);
  const governanceState = {
    last_run_at: new Date().toISOString(),
    summary,
    artifacts
  };
  writeJson(GOVERNANCE_STATE, governanceState);
  renderGovernanceReport(tasks, summary, artifacts);

  // Check环节角色分离校验（用户铁令：Do执行者 ≠ Check评测者）
  const roleViolations = validateCheckRoleSeparation(tasks);
  if (roleViolations.length > 0) {
    logger.warn?.(`[pdca-engine] ⚠️ Check角色分离违规: ${roleViolations.length}项`);
    for (const v of roleViolations) {
      logger.warn?.(`[pdca-engine]   - ${v.message}`);
    }
  }

  const humanReport = generateHumanReport(tasks, summary, roleViolations);

  // 机器输出只保留计数，不输出冗长的分析数组
  const leanSummary = {
    total: summary.total,
    root: summary.root,
    sub: summary.sub,
    done: summary.done,
    open: summary.open,
    doing: summary.doing,
    blocked: summary.blocked,
    stale_count: summary.staleTasks.length,
    no_acceptance_count: summary.noAcceptance.length,
    high_priority_count: summary.highPriority.length,
    byKind: summary.byKind,
    byTrack: summary.byTrack
  };

  const result = {
    ok: true,
    skill: 'pdca-engine',
    mode: 'artifact-governance-closure',
    summary: leanSummary,
    human_report: humanReport,
    check_role_violations: roleViolations,
    governance_report: path.relative(WORKSPACE, GOVERNANCE_REPORT),
    lesson_file: path.relative(WORKSPACE, artifacts.lessonFile),
    metrics_file: path.relative(WORKSPACE, artifacts.metricsFile)
  };

  logger.info?.('[pdca-engine] 项目管理产物治理闭环完成');
  return result;
}

module.exports = run;
module.exports.run = run;

if (require.main === module) {
  run().then(result => {
    console.log(JSON.stringify(result, null, 2));
  }).catch(error => {
    console.error(error);
    process.exit(1);
  });
}
