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
    else if (status === 'doing') summary.doing += 1;
    else if (status === 'blocked') summary.blocked += 1;
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

function generateHumanReport(summary) {
  const { date } = nowParts();
  const lines = [];

  // 标题
  lines.push(`## 今日PDCA执行摘要（${date}）`);
  lines.push('');

  // 本轮做了什么
  lines.push('### 本轮做了什么');
  lines.push(`- 扫描任务库，发现 **${summary.total}** 个任务条目（${summary.root}个根任务 + ${summary.sub}个子任务）`);

  const statusParts = [];
  if (summary.open > 0) statusParts.push(`${summary.open}个待执行`);
  if (summary.doing > 0) statusParts.push(`${summary.doing}个进行中`);
  if (summary.blocked > 0) statusParts.push(`${summary.blocked}个阻塞中`);
  if (summary.done > 0) statusParts.push(`${summary.done}个已完成`);
  lines.push(`- 当前状态：${statusParts.join('、')}`);

  const completionRate = summary.total > 0
    ? ((summary.done / summary.total) * 100).toFixed(1)
    : '0.0';
  const activeRate = summary.total > 0
    ? (((summary.done + summary.doing) / summary.total) * 100).toFixed(1)
    : '0.0';
  lines.push(`- 完成率 ${completionRate}%，活跃率（完成+进行中）${activeRate}%`);
  lines.push('');

  // 关键发现
  lines.push('### 关键发现');
  let hasFindings = false;

  if (summary.staleTasks.length > 0) {
    lines.push(`- ⚠️ **${summary.staleTasks.length}条任务长期滞留**（超过7天未更新），建议清理或推进：`);
    const topStale = summary.staleTasks
      .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate)
      .slice(0, 5);
    for (const t of topStale) {
      lines.push(`  - 「${t.title}」${t.status}状态，已${t.daysSinceUpdate}天未更新`);
    }
    if (summary.staleTasks.length > 5) {
      lines.push(`  - …还有${summary.staleTasks.length - 5}条，详见治理报告`);
    }
    hasFindings = true;
  }

  if (summary.noAcceptance.length > 0) {
    lines.push(`- 📋 **${summary.noAcceptance.length}条任务缺少验收标准**，完成后无法判定是否真正交付`);
    hasFindings = true;
  }

  if (summary.blocked > 0) {
    lines.push(`- 🚧 **${summary.blocked}条任务处于阻塞状态**，需要介入解除：`);
    for (const t of summary.topBlocked.slice(0, 3)) {
      lines.push(`  - 「${t.title}」优先级${t.priority}，负责人${t.owner}`);
    }
    hasFindings = true;
  }

  if (summary.highPriority.length > 0) {
    const undone = summary.highPriority.filter(t => t.status !== 'done');
    if (undone.length > 0) {
      lines.push(`- 🔴 **${undone.length}条高优先级任务（P0/P1）尚未完成**`);
      hasFindings = true;
    }
  }

  if (!hasFindings) {
    lines.push('- ✅ 未发现明显风险，任务推进正常');
  }
  lines.push('');

  // 建议行动
  lines.push('### 建议行动');

  if (summary.blocked > 0) {
    lines.push(`- 🔧 优先解除 ${Math.min(summary.blocked, 3)} 条阻塞任务`);
  }

  if (summary.highPriority.length > 0) {
    lines.push(`- 🎯 集中精力推进 ${Math.min(summary.highPriority.length, 3)} 条P0/P1任务`);
  }

  if (summary.staleTasks.length > 0) {
    lines.push(`- 🧹 清理或重新激活 ${summary.staleTasks.length} 条长期滞留任务`);
  }

  if (summary.noAcceptance.length > 0) {
    lines.push(`- 📝 为 ${summary.noAcceptance.length} 条任务补充验收标准`);
  }

  if (summary.done === 0 && summary.total > 0) {
    lines.push('- 💡 当前完成数为0，建议挑选最小可交付任务先完成一个，建立推进节奏');
  }

  if (summary.open > summary.total * 0.8) {
    lines.push('- ⚡ 超过80%任务处于待执行状态，建议控制在途数量，聚焦推进');
  }

  return lines.join('\n');
}

async function run(input = {}, context = {}) {
  const logger = context?.logger || console;
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

  const humanReport = generateHumanReport(summary);

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
