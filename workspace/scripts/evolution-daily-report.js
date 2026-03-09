#!/usr/bin/env node
/**
 * evolution-daily-report.js
 * 自主进化日报系统：每天自动总结复盘当天进化，关键沉淀自动闭环。
 * cron: 0 22 * * * (flock防重入)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = process.env.WORKSPACE || '/root/.openclaw/workspace';
const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

// ─── Helpers ───

function readFileOr(filePath, fallback = '') {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return fallback; }
}

function readJsonOr(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return fallback; }
}

function execOr(cmd, fallback = '') {
  try { return execSync(cmd, { cwd: WORKSPACE, encoding: 'utf8', timeout: 15000 }).trim(); } catch { return fallback; }
}

function appendIfMissing(filePath, marker, content) {
  const existing = readFileOr(filePath);
  if (!existing.includes(marker)) {
    fs.appendFileSync(filePath, '\n' + content + '\n');
    return true;
  }
  return false;
}

// ─── 1. Data Collection ───

function collectTaskBoard() {
  const board = readJsonOr(path.join(WORKSPACE, 'logs/subagent-task-board.json'), { tasks: [] });
  const tasks = Array.isArray(board) ? board : (board.tasks || board.board || []);
  const todayTasks = tasks.filter(t => {
    const ts = t.completedAt || t.updatedAt || t.createdAt || '';
    return ts.startsWith(TODAY);
  });
  const completed = todayTasks.filter(t => t.status === 'completed' || t.status === 'done');
  const failed = todayTasks.filter(t => t.status === 'failed' || t.status === 'error');
  const timeout = todayTasks.filter(t => t.status === 'timeout');
  return { completed, failed, timeout, total: todayTasks.length };
}

function collectPDCA() {
  const filePath = path.join(WORKSPACE, 'reports/pdca-check-history.jsonl');
  const content = readFileOr(filePath);
  if (!content) return { today: [], yesterday: [] };
  const lines = content.split('\n').filter(Boolean);
  const all = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const today = all.filter(r => (r.timestamp || r.date || '').startsWith(TODAY));
  const yesterday = all.filter(r => (r.timestamp || r.date || '').startsWith(YESTERDAY));
  return { today, yesterday };
}

function collectBadcases() {
  const dir = path.join(WORKSPACE, 'tests/benchmarks/badcases');
  if (!fs.existsSync(dir)) return { newFiles: [], count: 0 };
  const files = fs.readdirSync(dir).filter(f => {
    try {
      const stat = fs.statSync(path.join(dir, f));
      return stat.mtime.toISOString().startsWith(TODAY);
    } catch { return false; }
  });
  return { newFiles: files, count: files.length };
}

function collectMemory() {
  const memFile = path.join(WORKSPACE, `memory/${TODAY}.md`);
  return readFileOr(memFile, '(无今日记忆条目)');
}

function collectGitLog() {
  return execOr(`git log --since="${TODAY}T00:00:00" --oneline 2>/dev/null`, '(无今日提交)');
}

function collectCRAS() {
  const logFile = path.join(WORKSPACE, 'infrastructure/logs/cras-intent-insight.log');
  const content = readFileOr(logFile);
  if (!content) return '(无CRAS洞察)';
  const todayLines = content.split('\n').filter(l => l.includes(TODAY));
  return todayLines.length > 0 ? todayLines.join('\n') : '(今日无CRAS洞察)';
}

// ─── 2. Report Generation ───

function generateReport(data) {
  const { tasks, pdca, badcases, memory, gitLog, cras } = data;

  // PDCA delta
  let pdcaDelta = '';
  if (pdca.today.length > 0) {
    const latest = pdca.today[pdca.today.length - 1];
    const prevLatest = pdca.yesterday.length > 0 ? pdca.yesterday[pdca.yesterday.length - 1] : null;
    pdcaDelta = `今日最新: ${JSON.stringify(latest.scores || latest.metrics || latest, null, 2)}`;
    if (prevLatest) {
      pdcaDelta += `\n昨日最新: ${JSON.stringify(prevLatest.scores || prevLatest.metrics || prevLatest, null, 2)}`;
    }
  } else {
    pdcaDelta = '今日无PDCA检查数据';
  }

  // Badcase types
  const badcaseDetail = badcases.count > 0
    ? badcases.newFiles.map(f => `  - ${f}`).join('\n')
    : '无新增badcase';

  // Unfinished
  const unfinished = [...tasks.failed, ...tasks.timeout];
  const unfinishedList = unfinished.length > 0
    ? unfinished.map(t => `  - [${t.status}] ${t.label || t.task || t.id || 'unknown'}`).join('\n')
    : '无';

  // Git summary
  const commitCount = gitLog === '(无今日提交)' ? 0 : gitLog.split('\n').length;

  // Tomorrow priorities
  const priorities = [];
  if (unfinished.length > 0) priorities.push('处理未完成/失败任务');
  if (badcases.count > 0) priorities.push(`消化${badcases.count}条新增badcase`);
  if (pdca.today.length === 0) priorities.push('运行PDCA检查');
  if (priorities.length === 0) priorities.push('继续推进当前进化路线');

  const report = `# 进化日报 ${TODAY}

## 📊 今日进化摘要

- 任务完成: ${tasks.completed.length} | 失败: ${tasks.failed.length} | 超时: ${tasks.timeout.length} | 总计: ${tasks.total}
- 代码提交: ${commitCount} 次
- 新增Badcase: ${badcases.count} 条
- PDCA检查: ${pdca.today.length} 次

### 今日代码提交
\`\`\`
${gitLog}
\`\`\`

### 今日记忆条目
${memory.slice(0, 2000)}${memory.length > 2000 ? '\n...(已截断)' : ''}

## 📈 关键指标变化
${pdcaDelta}

## 🐛 Badcase统计
新增 ${badcases.count} 条:
${badcaseDetail}

## ⏳ 未完成项
${unfinishedList}

## 🔍 CRAS洞察
${cras.slice(0, 1000)}${cras.length > 1000 ? '\n...(已截断)' : ''}

## 🎯 明日优先级建议
${priorities.map((p, i) => `${i + 1}. ${p}`).join('\n')}

---
*自动生成于 ${new Date().toISOString()}*
`;

  return report;
}

// ─── 3. Auto-Sediment (自动沉淀闭环) ───

function extractLessons(data) {
  const lessons = [];
  const { tasks, badcases } = data;

  // Extract from failed tasks
  for (const t of tasks.failed) {
    if (t.rootCause || t.lesson) {
      lessons.push({
        marker: `[${TODAY}:fail:${t.id || t.label}]`,
        text: `- **[${TODAY} 失败教训]** ${t.label || t.task}: ${t.rootCause || t.lesson}`
      });
    }
  }

  // Extract from badcases with root cause
  if (badcases.count > 0) {
    lessons.push({
      marker: `[${TODAY}:badcase:${badcases.count}]`,
      text: `- **[${TODAY} Badcase]** 新增${badcases.count}条: ${badcases.newFiles.slice(0, 5).join(', ')}`
    });
  }

  return lessons;
}

function autoSediment(lessons) {
  const memoryFile = path.join(WORKSPACE, 'MEMORY.md');
  const todoFile = path.join(WORKSPACE, 'logs/todo-programmatic.md');
  let appended = 0;

  for (const lesson of lessons) {
    const added = appendIfMissing(memoryFile, lesson.marker, `${lesson.text} ${lesson.marker}`);
    if (added) appended++;
  }

  // Check if any lessons are programmable (heuristic: contains keywords)
  const programmable = lessons.filter(l =>
    /重复|每次|总是|always|pattern|规律|固化/.test(l.text)
  );

  if (programmable.length > 0) {
    const todoContent = programmable.map(l => `- [ ] 待程序化: ${l.text}`).join('\n');
    const existing = readFileOr(todoFile);
    if (!existing.includes(TODAY)) {
      fs.appendFileSync(todoFile, `\n## ${TODAY}\n${todoContent}\n`);
    }
  }

  return { appended, programmable: programmable.length };
}

// ─── Main ───

function main() {
  console.log(`[evolution-daily-report] 开始生成 ${TODAY} 日报...`);

  const data = {
    tasks: collectTaskBoard(),
    pdca: collectPDCA(),
    badcases: collectBadcases(),
    memory: collectMemory(),
    gitLog: collectGitLog(),
    cras: collectCRAS(),
  };

  const report = generateReport(data);

  // Write report
  const outDir = path.join(WORKSPACE, 'reports/evolution-daily');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${TODAY}.md`);
  fs.writeFileSync(outFile, report);
  console.log(`[evolution-daily-report] 日报已写入: ${outFile}`);

  // Auto-sediment
  const lessons = extractLessons(data);
  if (lessons.length > 0) {
    const result = autoSediment(lessons);
    console.log(`[evolution-daily-report] 沉淀: ${result.appended}条写入MEMORY.md, ${result.programmable}条标记待程序化`);
  } else {
    console.log('[evolution-daily-report] 无新教训需沉淀');
  }

  // Summary to stdout
  console.log(`[evolution-daily-report] 完成. 任务=${data.tasks.total} 提交=${data.gitLog === '(无今日提交)' ? 0 : data.gitLog.split('\\n').length} badcase=${data.badcases.count}`);
}

main();
