#!/usr/bin/env node
// ============================================================
// daily-ops-report.js
// 每日运维报告生成器 — 基于真实数据源
// ============================================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OPENCLAW_ROOT = '/root/.openclaw';
const WORKSPACE = path.join(OPENCLAW_ROOT, 'workspace');
const RUNS_DIR = path.join(OPENCLAW_ROOT, 'cron/runs');
const REPORTS_DIR = path.join(WORKSPACE, 'reports');
const STATE_FILE = path.join(REPORTS_DIR, '.daily-report-state.json');

// ── Helpers ──────────────────────────────────────────────────

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', timeout: 15000 }).trim(); }
  catch { return ''; }
}

function loadJSON(fp) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch { return null; }
}

function loadLastState() { return loadJSON(STATE_FILE); }

// ── 1. System Health ─────────────────────────────────────────

function collectSystemHealth() {
  const uptimeRaw = run('uptime');
  const memRaw = run('free -m');
  const diskRaw = run('df -h /');

  // Memory
  const memMatch = memRaw.match(/Mem:\s+(\d+)\s+(\d+)/);
  const memTotal = memMatch ? parseInt(memMatch[1]) : 0;
  const memUsed = memMatch ? parseInt(memMatch[2]) : 0;
  const memPct = memTotal ? Math.round(memUsed / memTotal * 100) : 0;

  // Disk
  const diskMatch = diskRaw.match(/(\d+)%/);
  const diskPct = diskMatch ? parseInt(diskMatch[1]) : 0;

  // Uptime in hours
  let uptimeHrs = 0;
  const upDays = uptimeRaw.match(/up\s+(\d+)\s+day/);
  const upHM = uptimeRaw.match(/up\s+(?:\d+\s+days?,\s+)?(\d+):(\d+)/);
  const upMins = uptimeRaw.match(/up\s+(\d+)\s+min/);
  if (upDays) uptimeHrs += parseInt(upDays[1]) * 24;
  if (upHM) uptimeHrs += parseInt(upHM[1]) + parseInt(upHM[2]) / 60;
  else if (upMins) uptimeHrs += parseInt(upMins[1]) / 60;

  // Load
  const loadMatch = uptimeRaw.match(/load average:\s*([\d.]+)/);
  const load1m = loadMatch ? parseFloat(loadMatch[1]) : 0;

  return { uptimeRaw, uptimeHrs, memTotal, memUsed, memPct, diskPct, load1m };
}

// ── 2. Git Activity ──────────────────────────────────────────

function collectGitChanges() {
  const log = run(`cd ${OPENCLAW_ROOT} && git log --since="24 hours ago" --oneline 2>/dev/null`);
  const lines = log ? log.split('\n').filter(Boolean) : [];
  const categorized = {};

  for (const line of lines) {
    const tagMatch = line.match(/\[(\w+)\]/);
    const tag = tagMatch ? tagMatch[1] : 'OTHER';
    if (!categorized[tag]) categorized[tag] = [];
    categorized[tag].push(line);
  }

  return { total: lines.length, categorized, lines };
}

// ── 3. Cron Stats ────────────────────────────────────────────

function collectCronStats() {
  const cutoff = Date.now() - 24 * 3600000;
  const jobs = {};

  let files;
  try { files = fs.readdirSync(RUNS_DIR).filter(f => f.endsWith('.jsonl')); }
  catch { return jobs; }

  // Load job labels from jobs.json
  const jobsConfig = loadJSON(path.join(OPENCLAW_ROOT, 'cron/jobs.json'));
  const labelMap = {};
  if (Array.isArray(jobsConfig)) {
    for (const j of jobsConfig) if (j.id && j.label) labelMap[j.id] = j.label;
  }

  for (const fname of files) {
    const jobId = fname.replace('.jsonl', '');
    let content;
    try { content = fs.readFileSync(path.join(RUNS_DIR, fname), 'utf8'); }
    catch { continue; }

    const recs = content.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

    let ok = 0, fail = 0, skip = 0, lastRun = null;
    for (const rec of recs) {
      if (rec.ts < cutoff) continue;
      if (rec.status === 'ok') ok++;
      else if (rec.status === 'error') fail++;
      else if (rec.status === 'skipped') skip++;
      if (!lastRun || rec.ts > lastRun.ts) lastRun = rec;
    }

    if (ok + fail + skip > 0) {
      jobs[jobId] = {
        label: labelMap[jobId] || null,
        ok, fail, skip,
        lastStatus: lastRun?.status,
        lastSummary: (lastRun?.summary || lastRun?.error || '').slice(0, 150),
        lastTs: lastRun?.ts
      };
    }
  }
  return jobs;
}

// ── 4. Skill Health ──────────────────────────────────────────

function collectSkillHealth() {
  const skillsDir = path.join(WORKSPACE, 'skills');
  let dirs;
  try { dirs = fs.readdirSync(skillsDir); } catch { return { total: 0, healthy: 0, missing: [] }; }

  const missing = [];
  let healthy = 0;

  for (const d of dirs) {
    const skillPath = path.join(skillsDir, d);
    try {
      if (!fs.statSync(skillPath).isDirectory()) continue;
    } catch { continue; }

    const hasSkillMd = fs.existsSync(path.join(skillPath, 'SKILL.md'));
    if (hasSkillMd) healthy++;
    else missing.push(d);
  }

  return { total: dirs.length, healthy, missing };
}

// ── 5. Risk Detection ────────────────────────────────────────

function detectRisks(health, cronJobs, skills) {
  const risks = [];

  if (health.memPct > 80) risks.push({ level: '🔴', msg: `内存使用率 ${health.memPct}%，超过80%阈值` });
  else if (health.memPct > 60) risks.push({ level: '🟡', msg: `内存使用率 ${health.memPct}%，持续关注` });

  if (health.diskPct > 85) risks.push({ level: '🔴', msg: `磁盘使用率 ${health.diskPct}%，空间不足` });
  else if (health.diskPct > 70) risks.push({ level: '🟡', msg: `磁盘使用率 ${health.diskPct}%，持续关注` });

  if (health.load1m > 4.0) risks.push({ level: '🟡', msg: `系统负载 ${health.load1m}，高于正常水平` });

  for (const [id, s] of Object.entries(cronJobs)) {
    const name = s.label || id.slice(0, 12);
    if (s.fail > 0) risks.push({ level: '🔴', msg: `Cron任务 ${name} 失败 ${s.fail} 次` });
    if (s.skip > 0 && s.ok === 0) risks.push({ level: '🟡', msg: `Cron任务 ${name} 持续被跳过` });
  }

  if (skills.missing.length > 0) risks.push({ level: '🟡', msg: `${skills.missing.length} 个技能缺少 SKILL.md` });

  return risks;
}

// ── 6. Delta ─────────────────────────────────────────────────

function computeDelta(current, last) {
  if (!last) return null;
  return {
    memPctChange: current.health.memPct - (last.health?.memPct || 0),
    diskPctChange: current.health.diskPct - (last.health?.diskPct || 0),
  };
}

// ── 7. Render ────────────────────────────────────────────────

function renderReport(data) {
  const { health, cronJobs, gitChanges, skills, risks, delta } = data;
  const now = new Date();
  const dateStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const dateTag = now.toISOString().slice(0, 10);

  let md = `# 系统运营日报 ${dateTag}\n\n`;
  md += `> 生成时间：${dateStr} | 数据窗口：过去24小时\n\n`;

  // System Health
  md += `## 🖥️ 系统健康\n\n`;
  md += `| 指标 | 当前值 | 状态 |\n|------|--------|------|\n`;
  md += `| 运行时长 | ${health.uptimeHrs.toFixed(1)}h | ${health.uptimeHrs > 1 ? '✅' : '🔄'} |\n`;
  md += `| 内存使用 | ${health.memUsed}MB / ${health.memTotal}MB (${health.memPct}%) | ${health.memPct > 80 ? '🔴' : health.memPct > 60 ? '🟡' : '✅'} |\n`;
  md += `| 磁盘使用 | ${health.diskPct}% | ${health.diskPct > 85 ? '🔴' : health.diskPct > 70 ? '🟡' : '✅'} |\n`;
  md += `| 系统负载(1m) | ${health.load1m} | ${health.load1m > 4 ? '🟡' : '✅'} |\n\n`;

  if (delta) {
    if (delta.memPctChange !== 0) md += `> 内存变化：${delta.memPctChange > 0 ? '+' : ''}${delta.memPctChange}% vs 上次报告\n\n`;
  }

  // Git
  md += `## 📝 Git活动（过去24小时）\n\n`;
  if (gitChanges.total === 0) {
    md += `无代码提交。\n\n`;
  } else {
    md += `共 **${gitChanges.total}** 次提交\n\n`;
    for (const [tag, commits] of Object.entries(gitChanges.categorized)) {
      md += `- **${tag}** (${commits.length}): ${commits.slice(0, 3).map(c => c.replace(/^[a-f0-9]+ /, '')).join(' | ')}`;
      if (commits.length > 3) md += ` ...等`;
      md += `\n`;
    }
    md += `\n`;
  }

  // Cron
  md += `## ⏱️ Cron执行统计（过去24小时）\n\n`;
  const cronEntries = Object.entries(cronJobs);
  const totalOk = cronEntries.reduce((a, [, v]) => a + v.ok, 0);
  const totalFail = cronEntries.reduce((a, [, v]) => a + v.fail, 0);
  const totalSkip = cronEntries.reduce((a, [, v]) => a + v.skip, 0);
  md += `**总计**：${totalOk + totalFail + totalSkip} 次 | ✅ ${totalOk} 成功 | ❌ ${totalFail} 失败 | ⏭️ ${totalSkip} 跳过\n\n`;

  const problems = cronEntries.filter(([, v]) => v.fail > 0 || (v.skip > 0 && v.ok === 0));
  if (problems.length) {
    md += `**需关注：**\n`;
    for (const [id, s] of problems) {
      const name = s.label || id.slice(0, 12);
      md += `- \`${name}\`: fail=${s.fail} skip=${s.skip} — ${s.lastSummary.slice(0, 100)}\n`;
    }
    md += `\n`;
  }

  // Skill Health
  md += `## 🔧 技能健康度\n\n`;
  md += `共 **${skills.total}** 个技能目录 | ✅ ${skills.healthy} 有 SKILL.md | ⚠️ ${skills.missing.length} 缺失\n\n`;
  if (skills.missing.length > 0) {
    md += `缺少 SKILL.md 的技能：${skills.missing.join(', ')}\n\n`;
  }

  // Risks
  md += `## ⚠️ 异常与风险\n\n`;
  if (risks.length === 0) {
    md += `无异常，系统运行正常。\n\n`;
  } else {
    for (const r of risks) md += `- ${r.level} ${r.msg}\n`;
    md += `\n`;
  }

  md += `---\n_自动生成 by daily-ops-report.js_\n`;
  return md;
}

// ── Main ─────────────────────────────────────────────────────

function main() {
  const lastState = loadLastState();

  const health = collectSystemHealth();
  const gitChanges = collectGitChanges();
  const cronJobs = collectCronStats();
  const skills = collectSkillHealth();
  const risks = detectRisks(health, cronJobs, skills);
  const delta = computeDelta({ health }, lastState);

  const report = renderReport({ health, gitChanges, cronJobs, skills, risks, delta });

  // Write report
  const dateTag = new Date().toISOString().slice(0, 10);
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const outPath = path.join(REPORTS_DIR, `daily-ops-${dateTag}.md`);
  fs.writeFileSync(outPath, report);

  // Save state for next delta
  fs.writeFileSync(STATE_FILE, JSON.stringify({ health, cronJobs, ts: Date.now() }, null, 2));

  console.log(`✅ 报告已写入: ${outPath}`);
  console.log(report.slice(0, 600));
}

main();
