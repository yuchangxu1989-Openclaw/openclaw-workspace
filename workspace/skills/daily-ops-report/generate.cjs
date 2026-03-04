// ============================================================
// daily-ops-report/generate.cjs
// 系统运营日报生成器 — Node.js CommonJS
// 从真实运行时数据源采集，生成 Markdown 格式日报
// ============================================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OPENCLAW_ROOT = '/root/.openclaw';
const RUNS_DIR = path.join(OPENCLAW_ROOT, 'cron/runs');
const JOBS_FILE = path.join(OPENCLAW_ROOT, 'cron/jobs.json');
const SUBAGENTS_FILE = path.join(OPENCLAW_ROOT, 'subagents/runs.json');
const STATE_FILE = path.join(OPENCLAW_ROOT, 'workspace/reports/.daily-report-state.json');

// ── 工具函数 ─────────────────────────────────────────────────

function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 10000 }).trim();
  } catch (e) {
    return '';
  }
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

// ── 1. 加载/保存状态 ────────────────────────────────────────

function loadLastState() {
  return safeReadJson(STATE_FILE);
}

function saveState(state) {
  var dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── 2. 加载 Cron 任务名称映射 ───────────────────────────────

function loadJobNames() {
  var data = safeReadJson(JOBS_FILE);
  if (!data) return {};
  var jobs = data.jobs || data;
  var map = {};
  if (Array.isArray(jobs)) {
    for (var i = 0; i < jobs.length; i++) {
      var j = jobs[i];
      map[j.id] = j.name || j.label || j.id;
    }
  }
  return map;
}

// ── 3. 系统健康指标 ─────────────────────────────────────────

function collectSystemHealth() {
  var result = {
    uptimeRaw: '', uptimeHrs: 0,
    memTotal: 0, memUsed: 0, memPct: 0,
    diskTotal: '', diskUsed: '', diskAvail: '', diskPct: 0,
    load1m: 0, load5m: 0, load15m: 0,
    gwProcesses: [], gwProcessCount: 0,
  };

  // uptime
  var uptimeRaw = safeExec('uptime');
  result.uptimeRaw = uptimeRaw;
  if (uptimeRaw) {
    var upMatch = uptimeRaw.match(/up\s+(?:(\d+)\s+days?,?\s*)?(?:(\d+):(\d+))?(?:(\d+)\s+min)?/i);
    if (upMatch) {
      var days = parseInt(upMatch[1] || '0');
      var hrs = parseInt(upMatch[2] || '0');
      var mins = parseInt(upMatch[3] || upMatch[4] || '0');
      result.uptimeHrs = days * 24 + hrs + mins / 60;
    }
    var loadMatch = uptimeRaw.match(/load average:\s*([\d.]+),?\s*([\d.]+),?\s*([\d.]+)/);
    if (loadMatch) {
      result.load1m = parseFloat(loadMatch[1]);
      result.load5m = parseFloat(loadMatch[2]);
      result.load15m = parseFloat(loadMatch[3]);
    }
  }

  // memory
  var memRaw = safeExec('free -m');
  if (memRaw) {
    var memMatch = memRaw.match(/Mem:\s+(\d+)\s+(\d+)\s+(\d+)/);
    if (memMatch) {
      result.memTotal = parseInt(memMatch[1]);
      result.memUsed = parseInt(memMatch[2]);
      result.memPct = result.memTotal > 0 ? Math.round(result.memUsed / result.memTotal * 100) : 0;
    }
  }

  // disk
  var diskRaw = safeExec('df -h /');
  if (diskRaw) {
    var diskLines = diskRaw.split('\n');
    for (var i = 0; i < diskLines.length; i++) {
      var m = diskLines[i].match(/\S+\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)%/);
      if (m) {
        result.diskTotal = m[1];
        result.diskUsed = m[2];
        result.diskAvail = m[3];
        result.diskPct = parseInt(m[4]);
        break;
      }
    }
  }

  // gateway process
  var psRaw = safeExec("ps aux | grep -i 'openclaw' | grep -v grep");
  if (psRaw) {
    var psLines = psRaw.split('\n').filter(Boolean);
    result.gwProcessCount = psLines.length;
    for (var i = 0; i < psLines.length; i++) {
      var parts = psLines[i].split(/\s+/);
      if (parts.length >= 11) {
        result.gwProcesses.push({
          pid: parts[1],
          cpuPct: parseFloat(parts[2]) || 0,
          memPct: parseFloat(parts[3]) || 0,
          rss: parts[5],
          command: parts.slice(10).join(' ').slice(0, 80),
        });
      }
    }
  }

  return result;
}

// ── 4. Cron 任务统计（过去 N 小时）─────────────────────────

function collectCronStats(windowHours) {
  windowHours = windowHours || 24;
  var cutoff = Date.now() - windowHours * 3600000;
  var jobs = {};

  var files;
  try {
    files = fs.readdirSync(RUNS_DIR).filter(function(f) { return f.endsWith('.jsonl'); });
  } catch (e) {
    return jobs;
  }

  for (var fi = 0; fi < files.length; fi++) {
    var fname = files[fi];
    var jobId = fname.replace('.jsonl', '');
    var filePath = path.join(RUNS_DIR, fname);

    var rawLines;
    try {
      rawLines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    } catch (e) {
      continue;
    }

    var ok = 0, fail = 0, skip = 0;
    var totalDuration = 0;
    var lastRun = null;
    var errors = [];

    for (var li = 0; li < rawLines.length; li++) {
      var rec;
      try { rec = JSON.parse(rawLines[li]); } catch (e) { continue; }
      if (rec.action && rec.action !== 'finished') continue;
      if (rec.ts < cutoff) continue;

      if (rec.status === 'ok') ok++;
      else if (rec.status === 'error') {
        fail++;
        if (rec.summary || rec.error) {
          errors.push((rec.summary || rec.error).slice(0, 150));
        }
      } else if (rec.status === 'skipped') skip++;

      if (rec.durationMs) totalDuration += rec.durationMs;
      if (!lastRun || rec.ts > lastRun.ts) lastRun = rec;
    }

    // Consecutive failures from tail
    var tailConsecutiveFailures = 0;
    for (var ti = rawLines.length - 1; ti >= 0; ti--) {
      var trec;
      try { trec = JSON.parse(rawLines[ti]); } catch (e) { continue; }
      if (trec.action && trec.action !== 'finished') continue;
      if (trec.status === 'error') tailConsecutiveFailures++;
      else break;
    }

    if (ok + fail + skip > 0) {
      jobs[jobId] = {
        ok: ok, fail: fail, skip: skip,
        totalRuns: ok + fail + skip,
        avgDurationMs: (ok + fail) > 0 ? Math.round(totalDuration / (ok + fail)) : 0,
        lastStatus: lastRun ? lastRun.status : null,
        lastSummary: lastRun ? (lastRun.summary || '').slice(0, 150) : '',
        lastError: lastRun && lastRun.status === 'error' ? (lastRun.error || lastRun.summary || '').slice(0, 150) : '',
        lastTs: lastRun ? lastRun.ts : null,
        errors: errors.slice(-3),
        consecutiveFailures: tailConsecutiveFailures,
      };
    }
  }

  return jobs;
}

// ── 5. 子 Agent 执行统计 ───────────────────────────────────

function collectSubagentStats(windowHours) {
  windowHours = windowHours || 24;
  var cutoff = Date.now() - windowHours * 3600000;
  var result = { total: 0, ok: 0, fail: 0, pending: 0, tasks: [] };

  var data = safeReadJson(SUBAGENTS_FILE);
  if (!data) return result;

  var runs = data.runs || {};
  var keys = Object.keys(runs);
  for (var i = 0; i < keys.length; i++) {
    var id = keys[i];
    var run = runs[id];
    var createdAt = run.createdAt || run.startedAt || 0;
    if (createdAt < cutoff) continue;

    result.total++;
    var status = run.outcome ? run.outcome.status : (run.endedAt ? 'unknown' : 'pending');

    if (status === 'ok') result.ok++;
    else if (status === 'error' || status === 'failed') result.fail++;
    else result.pending++;

    var agentName = 'unknown';
    if (run.childSessionKey) {
      var parts = run.childSessionKey.split(':');
      agentName = parts[1] || 'unknown';
    }

    var durationSec = (run.endedAt && run.startedAt)
      ? Math.round((run.endedAt - run.startedAt) / 1000)
      : null;

    result.tasks.push({
      runId: id, label: run.label || null,
      task: (run.task || '').slice(0, 100),
      status: status, agent: agentName, model: run.model || null, durationSec: durationSec,
    });
  }

  result.tasks.sort(function(a, b) { return (b.durationSec || 0) - (a.durationSec || 0); });
  return result;
}

// ── 6. Git 变更摘要 ────────────────────────────────────────

function collectGitChanges(sinceHours) {
  sinceHours = sinceHours || 24;
  var result = { total: 0, categorized: {}, lines: [] };

  var log = safeExec(
    'cd ' + OPENCLAW_ROOT + ' && git log --oneline --since="' + sinceHours + ' hours ago" 2>/dev/null'
  );
  if (!log) return result;

  var lines = log.split('\n').filter(Boolean);
  result.total = lines.length;
  result.lines = lines;

  var categorized = {};
  for (var i = 0; i < lines.length; i++) {
    var tagMatch = lines[i].match(/\[(\w+)\]/);
    var tag = tagMatch ? tagMatch[1] : 'OTHER';
    if (!categorized[tag]) categorized[tag] = [];
    categorized[tag].push(lines[i]);
  }
  result.categorized = categorized;
  return result;
}

// ── 7. 异常/风险检测 ───────────────────────────────────────

function detectRisks(health, cronJobs, subagents, jobNames) {
  var risks = [];

  // Gateway
  if (health.gwProcessCount === 0) {
    risks.push({ level: '🔴 CRITICAL', msg: 'Gateway 进程不存在！服务可能已停止', category: 'gateway' });
  }

  // Memory
  if (health.memPct > 80) {
    risks.push({ level: '🔴 HIGH', msg: '内存使用率 ' + health.memPct + '%（' + health.memUsed + 'MB/' + health.memTotal + 'MB），超过 80% 阈值', category: 'memory' });
  } else if (health.memPct > 60) {
    risks.push({ level: '🟡 WARN', msg: '内存使用率 ' + health.memPct + '%（' + health.memUsed + 'MB/' + health.memTotal + 'MB），持续关注', category: 'memory' });
  }

  // Disk
  if (health.diskPct > 85) {
    risks.push({ level: '🔴 HIGH', msg: '磁盘使用率 ' + health.diskPct + '%，剩余 ' + health.diskAvail + '，空间严重不足', category: 'disk' });
  } else if (health.diskPct > 70) {
    risks.push({ level: '🟡 WARN', msg: '磁盘使用率 ' + health.diskPct + '%，剩余 ' + health.diskAvail, category: 'disk' });
  }

  // Load
  if (health.load1m > 4.0) {
    risks.push({ level: '🟡 WARN', msg: '系统负载 ' + health.load1m + '（1分钟均值），高于正常水平', category: 'load' });
  }

  // Cron failures
  var cronKeys = Object.keys(cronJobs);
  for (var i = 0; i < cronKeys.length; i++) {
    var jobId = cronKeys[i];
    var stats = cronJobs[jobId];
    var name = jobNames[jobId] || jobId;

    if (stats.consecutiveFailures >= 3) {
      risks.push({
        level: '🔴 HIGH',
        msg: 'Cron 任务「' + name + '」连续失败 ' + stats.consecutiveFailures + ' 次',
        category: 'cron',
        detail: stats.errors.length > 0 ? stats.errors[stats.errors.length - 1] : '',
      });
    } else if (stats.fail > 0) {
      risks.push({
        level: '🟡 WARN',
        msg: 'Cron 任务「' + name + '」今日失败 ' + stats.fail + ' 次（共 ' + stats.totalRuns + ' 次）',
        category: 'cron',
      });
    }

    if (stats.skip > 0 && stats.ok === 0 && stats.fail === 0) {
      risks.push({
        level: '🟡 WARN',
        msg: 'Cron 任务「' + name + '」持续被跳过（' + stats.skip + ' 次）',
        category: 'cron',
      });
    }
  }

  // Subagent
  if (subagents.fail > 0) {
    var failedNames = subagents.tasks
      .filter(function(t) { return t.status === 'error' || t.status === 'failed'; })
      .map(function(t) { return t.label || t.task; })
      .slice(0, 3);
    risks.push({
      level: '🟡 WARN',
      msg: '子 Agent 今日 ' + subagents.fail + ' 次执行失败' + (failedNames.length ? '：' + failedNames.join('、') : ''),
      category: 'subagent',
    });
  }

  return risks;
}

// ── 8. 计算 Delta ──────────────────────────────────────────

function computeDelta(currentState, lastState) {
  if (!lastState) return { isFirst: true };

  var delta = {};
  delta.memPctChange = currentState.health.memPct - (lastState.health ? lastState.health.memPct : 0);
  delta.diskPctChange = currentState.health.diskPct - (lastState.health ? lastState.health.diskPct : 0);

  var currJobCount = Object.keys(currentState.cronJobs).length;
  var lastJobCount = Object.keys(lastState.cronJobs || {}).length;
  delta.cronJobCountChange = currJobCount - lastJobCount;

  delta.newFailures = [];
  var cronKeys = Object.keys(currentState.cronJobs);
  for (var i = 0; i < cronKeys.length; i++) {
    var id = cronKeys[i];
    var v = currentState.cronJobs[id];
    if (v.fail > 0 && !(lastState.cronJobs && lastState.cronJobs[id] && lastState.cronJobs[id].fail > 0)) {
      delta.newFailures.push(id);
    }
  }

  var lastRiskMsgs = {};
  if (lastState.risks) {
    for (var i = 0; i < lastState.risks.length; i++) {
      lastRiskMsgs[lastState.risks[i].msg] = true;
    }
  }
  delta.newRisks = currentState.risks.filter(function(r) { return !lastRiskMsgs[r.msg]; });

  var currRiskMsgs = {};
  for (var i = 0; i < currentState.risks.length; i++) {
    currRiskMsgs[currentState.risks[i].msg] = true;
  }
  delta.resolvedRisks = (lastState.risks || []).filter(function(r) { return !currRiskMsgs[r.msg]; });

  if (lastState.ts) {
    delta.hoursSinceLast = Math.round((Date.now() - lastState.ts) / 3600000 * 10) / 10;
  }

  return delta;
}

// ── 9. 生成主动建议 ────────────────────────────────────────

function generateRecommendations(health, cronJobs, subagents, risks, delta, jobNames) {
  var recs = [];

  // Gateway down
  var gwDown = false;
  for (var i = 0; i < risks.length; i++) {
    if (risks[i].category === 'gateway') { gwDown = true; break; }
  }
  if (gwDown) {
    recs.push({ priority: 'P0', action: '立即检查 Gateway 进程状态并重启：`openclaw gateway restart`' });
  }

  // Consecutive cron failures
  var cronKeys = Object.keys(cronJobs);
  for (var i = 0; i < cronKeys.length; i++) {
    var jobId = cronKeys[i];
    var stats = cronJobs[jobId];
    var name = jobNames[jobId] || jobId;
    if (stats.consecutiveFailures >= 3) {
      var lastErr = stats.errors.length > 0 ? stats.errors[stats.errors.length - 1] : '(无详情)';
      recs.push({ priority: 'P1', action: '修复 Cron 任务「' + name + '」连续失败问题。最近错误：' + lastErr.slice(0, 100) });
    }
  }

  // Always-skipped
  var skippedNames = [];
  for (var i = 0; i < cronKeys.length; i++) {
    var jid = cronKeys[i];
    var st = cronJobs[jid];
    if (st.skip > 0 && st.ok === 0 && st.fail === 0) {
      skippedNames.push(jobNames[jid] || jid);
    }
  }
  if (skippedNames.length > 0) {
    recs.push({ priority: 'P2', action: '检查持续被跳过的 Cron 任务：' + skippedNames.join('、') + '。确认是否应禁用或修复前置条件' });
  }

  // Disk
  if (health.diskPct > 70) {
    recs.push({ priority: 'P2', action: '磁盘使用率 ' + health.diskPct + '%，建议清理旧备份和日志文件' });
  }

  // Memory
  if (health.memPct > 80) {
    recs.push({ priority: 'P1', action: '内存使用率 ' + health.memPct + '%，检查是否有内存泄漏，执行 `ps aux --sort=-%mem | head -10` 查看' });
  }

  // Subagent failures
  if (subagents.fail > 0) {
    recs.push({ priority: 'P2', action: subagents.fail + ' 个子 Agent 执行失败，检查任务配置和模型可用性' });
  }

  // Stability
  if (recs.length === 0) {
    if (delta && !delta.isFirst && (!delta.newRisks || delta.newRisks.length === 0)) {
      recs.push({ priority: 'INFO', action: '系统运行稳定，与上次报告相比无显著异常' });
    } else if (delta && delta.isFirst) {
      recs.push({ priority: 'INFO', action: '首次生成日报，后续将自动对比变化趋势' });
    }
  }

  return recs;
}

// ── 10. 渲染报告 Markdown ──────────────────────────────────

function renderReport(data) {
  var ts = data.ts;
  var health = data.health;
  var cronJobs = data.cronJobs;
  var subagents = data.subagents;
  var gitChanges = data.gitChanges;
  var risks = data.risks;
  var delta = data.delta;
  var recommendations = data.recommendations;
  var jobNames = data.jobNames;

  var dateStr = new Date(ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  var out = [];

  out.push('# 📊 系统运营日报');
  out.push('> ' + dateStr);
  out.push('');

  // ── 系统健康 ──
  out.push('## 🖥️ 系统健康');
  out.push('');
  out.push('| 指标 | 当前值 | 状态 |');
  out.push('|------|--------|------|');

  var uptimeDisplay = health.uptimeHrs >= 24
    ? Math.floor(health.uptimeHrs / 24) + '天' + Math.round(health.uptimeHrs % 24) + '小时'
    : health.uptimeHrs.toFixed(1) + '小时';
  out.push('| 运行时长 | ' + uptimeDisplay + ' | ' + (health.uptimeHrs > 1 ? '✅' : '🔄 刚启动') + ' |');
  out.push('| 内存使用 | ' + health.memUsed + 'MB / ' + health.memTotal + 'MB (' + health.memPct + '%) | ' + (health.memPct > 80 ? '🔴' : health.memPct > 60 ? '🟡' : '✅') + ' |');
  out.push('| 磁盘使用 | ' + health.diskUsed + ' / ' + health.diskTotal + ' (' + health.diskPct + '%) | ' + (health.diskPct > 85 ? '🔴' : health.diskPct > 70 ? '🟡' : '✅') + ' |');
  out.push('| 系统负载 | ' + health.load1m + ' / ' + health.load5m + ' / ' + health.load15m + ' | ' + (health.load1m > 4 ? '🟡' : '✅') + ' |');
  out.push('| Gateway 进程 | ' + health.gwProcessCount + ' 个 | ' + (health.gwProcessCount > 0 ? '✅' : '🔴 不存在') + ' |');
  out.push('');

  // Gateway details
  for (var i = 0; i < health.gwProcesses.length; i++) {
    var p = health.gwProcesses[i];
    out.push('> Gateway PID ' + p.pid + ' — CPU ' + p.cpuPct + '%, MEM ' + p.memPct + '%, RSS ' + p.rss + 'KB');
  }
  if (health.gwProcesses.length > 0) out.push('');

  // Delta health
  if (delta && !delta.isFirst) {
    var changes = [];
    if (delta.memPctChange !== 0) changes.push('内存 ' + (delta.memPctChange > 0 ? '+' : '') + delta.memPctChange + '%');
    if (delta.diskPctChange !== 0) changes.push('磁盘 ' + (delta.diskPctChange > 0 ? '+' : '') + delta.diskPctChange + '%');
    if (delta.hoursSinceLast) changes.push('距上次报告 ' + delta.hoursSinceLast + 'h');
    if (changes.length > 0) {
      out.push('> 📈 变化：' + changes.join(' | '));
      out.push('');
    }
  }

  // ── Cron 任务摘要 ──
  out.push('## ⏱️ Cron 任务执行（过去24小时）');
  out.push('');

  var cronEntries = Object.entries(cronJobs);
  var totalRuns = 0, totalOk = 0, totalFail = 0, totalSkip = 0;
  for (var i = 0; i < cronEntries.length; i++) {
    totalRuns += cronEntries[i][1].totalRuns;
    totalOk += cronEntries[i][1].ok;
    totalFail += cronEntries[i][1].fail;
    totalSkip += cronEntries[i][1].skip;
  }

  out.push('**总计** ' + totalRuns + ' 次执行（' + cronEntries.length + ' 个任务） | ✅ ' + totalOk + ' 成功 | ❌ ' + totalFail + ' 失败 | ⏭️ ' + totalSkip + ' 跳过');
  out.push('');

  // Problem jobs
  var problemJobs = cronEntries.filter(function(e) { return e[1].fail > 0 || (e[1].skip > 0 && e[1].ok === 0); });
  if (problemJobs.length > 0) {
    out.push('**需关注的任务：**');
    out.push('');
    for (var i = 0; i < problemJobs.length; i++) {
      var jid = problemJobs[i][0];
      var s = problemJobs[i][1];
      var jname = jobNames[jid] || jid;
      var statusInfo = [];
      if (s.fail > 0) statusInfo.push('❌ 失败 ' + s.fail + ' 次');
      if (s.skip > 0) statusInfo.push('⏭️ 跳过 ' + s.skip + ' 次');
      if (s.ok > 0) statusInfo.push('✅ 成功 ' + s.ok + ' 次');
      if (s.consecutiveFailures >= 2) statusInfo.push('🔥 连续失败 ' + s.consecutiveFailures + ' 次');
      out.push('- `' + jname + '`：' + statusInfo.join(' | '));
      if (s.lastError) {
        out.push('  > 最近错误：' + s.lastError.slice(0, 120));
      } else if (s.lastSummary) {
        out.push('  > 摘要：' + s.lastSummary.slice(0, 120));
      }
    }
    out.push('');
  } else {
    out.push('所有任务运行正常，无失败记录。 ✅');
    out.push('');
  }

  // Top active jobs
  var topJobs = cronEntries
    .filter(function(e) { return e[1].ok > 0; })
    .sort(function(a, b) { return b[1].totalRuns - a[1].totalRuns; })
    .slice(0, 5);
  if (topJobs.length > 0) {
    out.push('<details><summary>活跃任务 Top ' + topJobs.length + '</summary>');
    out.push('');
    for (var i = 0; i < topJobs.length; i++) {
      var tjid = topJobs[i][0];
      var ts2 = topJobs[i][1];
      var tname = jobNames[tjid] || tjid;
      var avgSec = ts2.avgDurationMs > 0 ? (ts2.avgDurationMs / 1000).toFixed(1) + 's' : '-';
      out.push('- `' + tname + '`：' + ts2.totalRuns + ' 次执行，平均 ' + avgSec);
    }
    out.push('');
    out.push('</details>');
    out.push('');
  }

  // ── 子 Agent 摘要 ──
  out.push('## 🤖 子 Agent 执行（过去24小时）');
  out.push('');

  if (subagents.total === 0) {
    out.push('无子 Agent 执行记录。');
    out.push('');
  } else {
    out.push