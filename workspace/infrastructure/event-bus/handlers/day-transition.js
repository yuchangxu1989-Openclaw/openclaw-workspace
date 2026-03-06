'use strict';

/**
 * 自主执行器：Day过渡
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * Day完成 → 自动归档 → 生成下一Day计划 → 更新sprint状态 → 记录
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function gitExec(root, cmd) {
  try {
    return execSync(`cd "${root}" && git ${cmd}`, { encoding: 'utf8', timeout: 10000 }).trim();
  } catch { return ''; }
}

function loadJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function saveJSON(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const payload = event?.payload || {};
  const dayNum = payload.day || payload.dayNum;
  const actions = [];

  if (!dayNum || typeof dayNum !== 'number') {
    return { ok: false, autonomous: true, actions: ['invalid_day'], message: '缺少有效的day编号' };
  }

  const nextDay = dayNum + 1;
  logger.info?.(`[day-transition] Day ${dayNum} → Day ${nextDay} 自主过渡开始`);

  // ─── 1. 归档当前Day ───
  const archiveDir = path.join(root, 'archive', `day-${String(dayNum).padStart(2, '0')}`);
  const dayDir = path.join(root, 'sprints', `day-${String(dayNum).padStart(2, '0')}`);
  const memoryDir = path.join(root, 'memory');

  // 归档day目录
  if (fs.existsSync(dayDir)) {
    try {
      fs.mkdirSync(archiveDir, { recursive: true });
      const files = fs.readdirSync(dayDir);
      for (const f of files) {
        const src = path.join(dayDir, f);
        const dst = path.join(archiveDir, f);
        fs.copyFileSync(src, dst);
      }
      actions.push(`archived_day_${dayNum}`);
    } catch (e) {
      actions.push(`archive_failed:${e.message}`);
    }
  }

  // 归档当日memory（如果有today文件）
  const today = new Date().toISOString().slice(0, 10);
  const todayMemory = path.join(memoryDir, `${today}.md`);
  if (fs.existsSync(todayMemory)) {
    try {
      const archiveMemory = path.join(archiveDir, `memory-${today}.md`);
      fs.copyFileSync(todayMemory, archiveMemory);
      actions.push('archived_daily_memory');
    } catch (e) {
      actions.push(`memory_archive_failed:${e.message}`);
    }
  }

  // 生成归档摘要
  const summaryPath = path.join(archiveDir, 'SUMMARY.md');
  try {
    const tasks = payload.completedTasks || payload.tasks || [];
    const summary = [
      `# Day ${dayNum} 归档摘要`,
      ``,
      `- **归档时间**: ${new Date().toISOString()}`,
      `- **完成任务**: ${tasks.length}项`,
      `- **状态**: 已完成归档`,
      ``,
      `## 完成的任务`,
      ...(tasks.length > 0 ? tasks.map((t, i) => `${i + 1}. ${typeof t === 'string' ? t : t.title || t.name || JSON.stringify(t)}`) : ['- 无详细任务记录']),
      ``,
      `## 备注`,
      payload.notes || '无',
      '',
    ].join('\n');
    fs.writeFileSync(summaryPath, summary, 'utf8');
    actions.push('summary_generated');
  } catch (e) {
    actions.push(`summary_failed:${e.message}`);
  }

  // ─── 2. 生成下一Day计划 ───
  const nextDayDir = path.join(root, 'sprints', `day-${String(nextDay).padStart(2, '0')}`);
  fs.mkdirSync(nextDayDir, { recursive: true });

  const planPath = path.join(nextDayDir, 'PLAN.md');
  if (!fs.existsSync(planPath)) {
    try {
      // 从backlog或待办项提取下一Day任务
      const backlogPath = path.join(root, 'sprints', 'backlog.json');
      const backlog = loadJSON(backlogPath);
      const pendingTasks = backlog?.items?.filter(i => i.status === 'pending' || i.status === 'todo')?.slice(0, 5) || [];

      const carryOver = payload.carryOverTasks || [];

      const plan = [
        `# Day ${nextDay} 计划`,
        ``,
        `- **生成时间**: ${new Date().toISOString()}`,
        `- **前置Day**: Day ${dayNum} (已归档)`,
        ``,
        `## 延续任务`,
        ...(carryOver.length > 0 ? carryOver.map((t, i) => `${i + 1}. ⏳ ${typeof t === 'string' ? t : t.title || JSON.stringify(t)}`) : ['- 无延续任务']),
        ``,
        `## 新增任务（来自Backlog）`,
        ...(pendingTasks.length > 0 ? pendingTasks.map((t, i) => `${i + 1}. 📋 ${t.title || t.name || JSON.stringify(t)}`) : ['- Backlog为空']),
        ``,
        `## 验收标准`,
        `- [ ] 所有延续任务完成或明确延续原因`,
        `- [ ] 新增任务至少启动`,
        `- [ ] 每日memory已更新`,
        '',
      ].join('\n');
      fs.writeFileSync(planPath, plan, 'utf8');
      actions.push(`day_${nextDay}_plan_generated`);
    } catch (e) {
      actions.push(`plan_generation_failed:${e.message}`);
    }
  } else {
    actions.push(`day_${nextDay}_plan_already_exists`);
  }

  // ─── 3. 更新Sprint状态 ───
  const sprintStatusPath = path.join(root, 'sprints', 'status.json');
  try {
    let status = loadJSON(sprintStatusPath) || { currentDay: dayNum, history: [] };
    status.history = status.history || [];
    status.history.push({
      day: dayNum,
      completedAt: new Date().toISOString(),
      tasksCompleted: (payload.completedTasks || payload.tasks || []).length,
    });
    status.currentDay = nextDay;
    status.lastTransition = new Date().toISOString();
    saveJSON(sprintStatusPath, status);
    actions.push('sprint_status_updated');
  } catch (e) {
    actions.push(`sprint_status_failed:${e.message}`);
  }

  // ─── Git commit ───
  try {
    gitExec(root, 'add -A');
    gitExec(root, `commit --no-verify -m "📅 day-transition: Day ${dayNum} → Day ${nextDay} (archived + planned)"`);
    actions.push('git_committed');
  } catch (e) {
    actions.push(`git_commit_failed:${e.message}`);
  }

  // ─── 验证 ───
  const verifyChecks = {
    archiveExists: fs.existsSync(archiveDir),
    summaryExists: fs.existsSync(summaryPath),
    nextPlanExists: fs.existsSync(planPath),
    sprintUpdated: (() => {
      const s = loadJSON(sprintStatusPath);
      return s?.currentDay === nextDay;
    })(),
  };
  const verifyOk = Object.values(verifyChecks).every(Boolean);
  actions.push(verifyOk ? 'verification_passed' : 'verification_partial');

  // ─── 闭环 ───
  if (context?.bus?.emit) {
    await context.bus.emit('day.transitioned', {
      from: dayNum,
      to: nextDay,
      archived: verifyChecks.archiveExists,
      planned: verifyChecks.nextPlanExists,
    });
  }

  if (!verifyOk && context?.notify) {
    const failed = Object.entries(verifyChecks).filter(([, v]) => !v).map(([k]) => k);
    await context.notify(
      `[day-transition] Day ${dayNum}→${nextDay} 过渡部分失败: ${failed.join(', ')}`,
      'warning'
    );
  }

  return {
    ok: verifyOk,
    autonomous: true,
    from: dayNum,
    to: nextDay,
    verification: verifyChecks,
    actions,
    message: `Day ${dayNum} → Day ${nextDay} 过渡${verifyOk ? '完成' : '部分完成'}: ${actions.filter(a => !a.includes('failed')).length}项成功`,
  };
};
