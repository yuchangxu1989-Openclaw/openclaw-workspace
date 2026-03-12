#!/usr/bin/env node
/**
 * ops-maintenance — 运维维护技能统一引擎
 *
 * 集成系统备份、会话清理、启动自检、内存治理等运维功能。
 * 所有scripts/下的脚本通过统一CLI入口调度。
 *
 * CLI:
 *   node index.js                     # 显示状态总览
 *   node index.js run <command>       # 运行指定维护任务
 *   node index.js run all             # 运行全部维护任务
 *   node index.js health              # 系统健康检查
 *   node index.js report              # 生成运维日报
 *   node index.js list                # 列出可用维护任务
 *
 * Module:
 *   const ops = require('./index.js');
 *   const status = await ops.healthCheck();
 *   await ops.runTask('backup');
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// ─── Constants ──────────────────────────────────────────────────────

const SCRIPTS_DIR = path.join(__dirname, 'scripts');
const OPENCLAW_ROOT = '/root/.openclaw';
const WORKSPACE = path.join(OPENCLAW_ROOT, 'workspace');
const LOG_DIR = path.join(WORKSPACE, 'logs');

// Registered maintenance tasks with metadata
const TASKS = {
  'backup': {
    script: 'backup.sh',
    label: '工作区备份',
    description: '完整工作区备份（git bundle + tar归档）',
    category: 'backup',
    priority: 1,
  },
  'backup-rotate': {
    script: 'backup-rotate.sh',
    label: '轮转备份',
    description: '多版本轮转备份，保留最近N天快照',
    category: 'backup',
    priority: 2,
    args: ['7'], // default: keep 7 days
  },
  'selfcheck': {
    script: 'startup-self-check.sh',
    label: '启动自检',
    description: '检查关键文件存在性、系统环境完整性',
    category: 'health',
    priority: 1,
  },
  'critical-files': {
    script: 'critical-files-check.sh',
    label: '关键文件检查',
    description: '检查SOUL.md、EvoMap等关键文件是否存在',
    category: 'health',
    priority: 2,
  },
  'session-cleanup': {
    script: 'session-cleanup.sh',
    label: '会话清理',
    description: '归档旧会话文件，保留最近50个',
    category: 'cleanup',
    priority: 1,
  },
  'session-governor': {
    script: 'session-cleanup-governor.sh',
    label: '会话治理',
    description: '多Agent会话治理（含cron-worker、归档、过期清理）',
    category: 'cleanup',
    priority: 2,
  },
  'thinking-cleanup': {
    script: 'thinking-content-cleanup.sh',
    label: '推理内容清理',
    description: '清理超大推理文件，保留最近内容',
    category: 'cleanup',
    priority: 3,
  },
  'maintenance': {
    script: 'system-maintenance.sh',
    label: '系统维护',
    description: '综合维护（会话清理 + Gateway内存检查）',
    category: 'system',
    priority: 1,
  },
  'report': {
    script: 'daily-ops-report.js',
    label: '运维日报',
    description: '生成系统运营日报（健康、Git、Cron、技能、风险）',
    category: 'report',
    priority: 1,
    runner: 'node',
  },
};

// ─── Helpers ────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      timeout: opts.timeout || 30000,
      stdio: opts.stdio || 'pipe',
    }).trim();
  } catch (err) {
    return { error: true, message: err.stderr?.trim() || err.message, code: err.status };
  }
}

function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function logEntry(taskId, status, message) {
  ensureDir(LOG_DIR);
  const logFile = path.join(LOG_DIR, 'ops-maintenance.log');
  const line = `[${timestamp()}] [${taskId}] [${status}] ${message}\n`;
  fs.appendFileSync(logFile, line);
}

// ─── Task Execution ─────────────────────────────────────────────────

/**
 * Run a single maintenance task.
 * @param {string} taskId — task key from TASKS
 * @param {object} [options]
 * @param {boolean} [options.verbose=false]
 * @param {string[]} [options.args] — extra arguments
 * @returns {Promise<{taskId, label, status, output, durationMs, error?}>}
 */
async function runTask(taskId, options = {}) {
  const task = TASKS[taskId];
  if (!task) {
    return { taskId, label: taskId, status: 'error', output: '', error: `Unknown task: ${taskId}` };
  }

  const scriptPath = path.join(SCRIPTS_DIR, task.script);
  if (!fs.existsSync(scriptPath)) {
    return { taskId, label: task.label, status: 'error', output: '', error: `Script not found: ${task.script}` };
  }

  const runner = task.runner === 'node' ? 'node' : 'bash';
  const args = [...(task.args || []), ...(options.args || [])];
  const cmd = `${runner} "${scriptPath}" ${args.join(' ')}`;

  const startTime = Date.now();

  if (options.verbose) {
    console.error(`  ▸ [${taskId}] ${task.label}...`);
  }

  logEntry(taskId, 'START', cmd);

  return new Promise((resolve) => {
    const child = spawn(runner, [scriptPath, ...args], {
      cwd: WORKSPACE,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });

    child.on('close', (code) => {
      const durationMs = Date.now() - startTime;
      const status = code === 0 ? 'ok' : 'error';
      const output = stdout.trim();
      const error = code !== 0 ? (stderr.trim() || `Exit code ${code}`) : undefined;

      logEntry(taskId, status.toUpperCase(), `${durationMs}ms | ${(output + (error || '')).slice(0, 200)}`);

      if (options.verbose) {
        const icon = status === 'ok' ? '✅' : '❌';
        console.error(`  ${icon} [${taskId}] ${task.label} — ${(durationMs / 1000).toFixed(1)}s`);
        if (error) console.error(`     ⚠️  ${error.slice(0, 150)}`);
      }

      resolve({ taskId, label: task.label, status, output, durationMs, error });
    });

    child.on('error', (err) => {
      const durationMs = Date.now() - startTime;
      logEntry(taskId, 'ERROR', err.message);
      resolve({ taskId, label: task.label, status: 'error', output: '', durationMs, error: err.message });
    });
  });
}

/**
 * Run multiple tasks sequentially (by priority within category).
 * @param {string[]} taskIds — list of task IDs, or ['all'] for everything
 * @param {object} [options]
 * @returns {Promise<object[]>}
 */
async function runTasks(taskIds, options = {}) {
  let ids = taskIds;

  if (ids.includes('all')) {
    ids = Object.entries(TASKS)
      .sort((a, b) => a[1].priority - b[1].priority)
      .map(([id]) => id);
  }

  const results = [];
  for (const id of ids) {
    const result = await runTask(id, options);
    results.push(result);
  }
  return results;
}

// ─── Health Check ───────────────────────────────────────────────────

/**
 * Quick system health check (no scripts, just metrics).
 * @returns {object}
 */
function healthCheck() {
  const checks = {};

  // Memory
  const memRaw = run('free -m');
  if (typeof memRaw === 'string') {
    const m = memRaw.match(/Mem:\s+(\d+)\s+(\d+)/);
    if (m) {
      const total = parseInt(m[1]);
      const used = parseInt(m[2]);
      const pct = Math.round(used / total * 100);
      checks.memory = { totalMB: total, usedMB: used, pct, status: pct > 80 ? '🔴' : pct > 60 ? '🟡' : '✅' };
    }
  }

  // Disk
  const diskRaw = run('df -h /');
  if (typeof diskRaw === 'string') {
    const m = diskRaw.match(/(\d+)%/);
    if (m) {
      const pct = parseInt(m[1]);
      checks.disk = { pct, status: pct > 85 ? '🔴' : pct > 70 ? '🟡' : '✅' };
    }
  }

  // Uptime
  const uptimeRaw = run('uptime -p');
  checks.uptime = typeof uptimeRaw === 'string' ? uptimeRaw : 'unknown';

  // Gateway process
  const gwPid = run('pgrep -f "openclaw-gateway" | head -1');
  checks.gateway = {
    running: typeof gwPid === 'string' && gwPid.length > 0,
    pid: typeof gwPid === 'string' ? gwPid : null,
  };
  if (checks.gateway.running && checks.gateway.pid) {
    const rss = run(`ps -p ${checks.gateway.pid} -o rss= 2>/dev/null`);
    if (typeof rss === 'string' && rss) {
      checks.gateway.memMB = Math.round(parseInt(rss) / 1024);
    }
  }

  // Session counts per agent
  const agentDirs = run(`ls -d ${OPENCLAW_ROOT}/agents/*/sessions 2>/dev/null`);
  if (typeof agentDirs === 'string' && agentDirs) {
    const sessionCounts = {};
    for (const dir of agentDirs.split('\n').filter(Boolean)) {
      const agent = path.basename(path.dirname(dir));
      const count = run(`ls -1 "${dir}"/*.jsonl 2>/dev/null | wc -l`);
      sessionCounts[agent] = typeof count === 'string' ? parseInt(count) || 0 : 0;
    }
    checks.sessions = sessionCounts;
    checks.totalSessions = Object.values(sessionCounts).reduce((a, b) => a + b, 0);
  }

  // Backup age
  const lastBackup = run(`ls -t /root/backups/openclaw/*.bundle /root/.openclaw/backups/*.bundle 2>/dev/null | head -1`);
  if (typeof lastBackup === 'string' && lastBackup) {
    try {
      const stat = fs.statSync(lastBackup);
      const ageHrs = (Date.now() - stat.mtimeMs) / 3600000;
      checks.lastBackup = {
        file: path.basename(lastBackup),
        ageHours: Math.round(ageHrs * 10) / 10,
        status: ageHrs > 48 ? '🔴' : ageHrs > 24 ? '🟡' : '✅',
      };
    } catch {
      checks.lastBackup = { status: '❓', ageHours: null };
    }
  } else {
    checks.lastBackup = { status: '🔴', ageHours: null, note: '无备份文件' };
  }

  // Critical files
  const criticalFiles = [
    { path: path.join(WORKSPACE, 'SOUL.md'), label: 'SOUL.md' },
    { path: path.join(WORKSPACE, 'USER.md'), label: 'USER.md' },
    { path: path.join(WORKSPACE, 'MEMORY.md'), label: 'MEMORY.md' },
    { path: path.join(WORKSPACE, 'AGENTS.md'), label: 'AGENTS.md' },
    { path: path.join(OPENCLAW_ROOT, 'openclaw.json'), label: 'openclaw.json' },
  ];

  checks.criticalFiles = {};
  for (const f of criticalFiles) {
    checks.criticalFiles[f.label] = fs.existsSync(f.path) ? '✅' : '❌';
  }

  return checks;
}

// ─── Formatted Output ───────────────────────────────────────────────

function formatHealth(checks) {
  const lines = [];
  lines.push(`\n${'═'.repeat(50)}`);
  lines.push(`🖥️ 系统健康检查 — ${timestamp()}`);
  lines.push(`${'═'.repeat(50)}\n`);

  if (checks.memory) {
    lines.push(`${checks.memory.status} 内存: ${checks.memory.usedMB}MB / ${checks.memory.totalMB}MB (${checks.memory.pct}%)`);
  }
  if (checks.disk) {
    lines.push(`${checks.disk.status} 磁盘: ${checks.disk.pct}%`);
  }
  lines.push(`⏰ 运行时长: ${checks.uptime}`);

  if (checks.gateway) {
    const gw = checks.gateway;
    lines.push(`${gw.running ? '✅' : '🔴'} Gateway: ${gw.running ? `PID ${gw.pid}` : '未运行'}${gw.memMB ? ` (${gw.memMB}MB)` : ''}`);
  }

  if (checks.lastBackup) {
    const bk = checks.lastBackup;
    lines.push(`${bk.status} 最近备份: ${bk.ageHours != null ? `${bk.ageHours}h前` : bk.note || '未知'}`);
  }

  if (checks.totalSessions != null) {
    lines.push(`📋 会话文件总数: ${checks.totalSessions}`);
  }

  lines.push(`\n关键文件:`);
  for (const [file, status] of Object.entries(checks.criticalFiles || {})) {
    lines.push(`  ${status} ${file}`);
  }

  lines.push('');
  return lines.join('\n');
}

function formatTaskResults(results) {
  const lines = [];
  lines.push(`\n${'═'.repeat(50)}`);
  lines.push(`🔧 运维任务执行结果`);
  lines.push(`${'═'.repeat(50)}\n`);

  let okCount = 0, errCount = 0;
  for (const r of results) {
    const icon = r.status === 'ok' ? '✅' : '❌';
    if (r.status === 'ok') okCount++; else errCount++;
    lines.push(`${icon} ${r.label} (${r.taskId}) — ${(r.durationMs / 1000).toFixed(1)}s`);
    if (r.error) lines.push(`   ⚠️  ${r.error.slice(0, 200)}`);
  }

  lines.push(`\n📊 总计: ${results.length} 任务 | ✅ ${okCount} 成功 | ❌ ${errCount} 失败\n`);
  return lines.join('\n');
}

function listTasks() {
  const lines = [];
  lines.push(`\n可用维护任务:\n`);

  const byCategory = {};
  for (const [id, task] of Object.entries(TASKS)) {
    const cat = task.category;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push({ id, ...task });
  }

  const categoryLabels = {
    backup: '📦 备份',
    health: '🏥 健康检查',
    cleanup: '🧹 清理',
    system: '🔧 系统维护',
    report: '📊 报告',
  };

  for (const [cat, tasks] of Object.entries(byCategory)) {
    lines.push(`${categoryLabels[cat] || cat}:`);
    for (const t of tasks.sort((a, b) => a.priority - b.priority)) {
      const scriptExists = fs.existsSync(path.join(SCRIPTS_DIR, t.script));
      lines.push(`  ${scriptExists ? '●' : '○'} ${t.id.padEnd(20)} ${t.label} — ${t.description}`);
    }
    lines.push('');
  }

  lines.push(`使用: node index.js run <taskId>   或   node index.js run all`);
  return lines.join('\n');
}

// ─── CLI ────────────────────────────────────────────────────────────

function printUsage() {
  console.log(`
ops-maintenance — 运维维护技能统一引擎

Usage:
  node index.js [command] [options]

Commands:
  (default)        系统状态总览
  health           系统健康检查
  list             列出所有可用维护任务
  run <task|all>   运行指定任务（或全部）
  report           生成运维日报

Options:
  --verbose, -v    显示详细输出
  --json           JSON格式输出
  --help, -h       显示帮助

Tasks:
  backup           工作区备份
  backup-rotate    轮转备份
  selfcheck        启动自检
  critical-files   关键文件检查
  session-cleanup  会话清理
  session-governor 会话治理
  thinking-cleanup 推理内容清理
  maintenance      系统维护
  report           运维日报

Examples:
  node index.js health
  node index.js run backup
  node index.js run all --verbose
  node index.js run session-cleanup session-governor
`.trim());
}

async function main() {
  const argv = process.argv.slice(2);
  const flags = { verbose: false, json: false };

  // Extract flags
  const positional = [];
  for (const a of argv) {
    if (a === '--verbose' || a === '-v') { flags.verbose = true; continue; }
    if (a === '--json') { flags.json = true; continue; }
    if (a === '--help' || a === '-h') { printUsage(); process.exit(0); }
    positional.push(a);
  }

  const command = positional[0] || 'health';
  const args = positional.slice(1);

  switch (command) {
    case 'health': {
      const checks = healthCheck();
      if (flags.json) {
        console.log(JSON.stringify(checks, null, 2));
      } else {
        console.log(formatHealth(checks));
      }
      break;
    }

    case 'list': {
      console.log(listTasks());
      break;
    }

    case 'run': {
      if (args.length === 0) {
        console.error('Error: specify task(s) to run. Use "all" for everything, or "list" to see available tasks.');
        process.exit(1);
      }

      const taskIds = args[0] === 'all' ? ['all'] : args;

      if (flags.verbose) {
        console.error(`\n🔧 开始执行运维任务 (${taskIds.join(', ')})\n`);
      }

      const results = await runTasks(taskIds, { verbose: flags.verbose });

      if (flags.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log(formatTaskResults(results));
      }

      const hasError = results.some(r => r.status === 'error');
      process.exit(hasError ? 1 : 0);
    }

    case 'report': {
      const result = await runTask('report', { verbose: flags.verbose });
      if (flags.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.output || result.error || 'No output');
      }
      break;
    }

    default: {
      // Treat as task name if it exists
      if (TASKS[command]) {
        const result = await runTask(command, { verbose: flags.verbose });
        if (flags.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.output || result.error || 'Done');
        }
      } else {
        console.error(`Unknown command: ${command}. Use --help for usage.`);
        process.exit(1);
      }
    }
  }
}

if (require.main === module) {
  main();
}

// ─── Exports ────────────────────────────────────────────────────────

module.exports = {
  TASKS,
  runTask,
  runTasks,
  healthCheck,
  formatHealth,
  formatTaskResults,
  listTasks,
};
