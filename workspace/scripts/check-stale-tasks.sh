#!/usr/bin/env node
// check-stale-tasks.sh - 检测看板中的僵尸running任务
// 读取task board，对比session实际状态，修正不一致
//
// 用法: node check-stale-tasks.sh [--fix] [--timeout N] [--quiet]
//   --fix      自动修正僵尸任务状态（默认只报告）
//   --timeout N 超时阈值（分钟），默认10
//   --quiet    静默模式，仅输出修正摘要

'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BOARD_FILE = '/root/.openclaw/workspace/logs/subagent-task-board.json';
const AGENTS_DIR = '/root/.openclaw/agents';
const LOG_FILE = '/root/.openclaw/workspace/logs/check-stale-tasks.log';

// ── 参数解析 ──
const args = process.argv.slice(2);
const autoFix = args.includes('--fix');
const quiet = args.includes('--quiet');
const timeoutIdx = args.indexOf('--timeout');
const STALE_MINUTES = timeoutIdx >= 0 ? parseInt(args[timeoutIdx + 1], 10) || 10 : 10;

// ── 工具函数 ──

/** 高效读取文件最后一行（只读末尾10KB） */
function readLastLine(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size === 0) return null;
    const fd = fs.openSync(filePath, 'r');
    const bufSize = Math.min(stat.size, 10240);
    const buf = Buffer.alloc(bufSize);
    fs.readSync(fd, buf, 0, bufSize, stat.size - bufSize);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').trim().split('\n');
    return lines[lines.length - 1];
  } catch {
    return null;
  }
}

/** 在sessions.json中按label查找sessionId（取最新的） */
function findSessionByLabel(agentId, label) {
  const sessFile = path.join(AGENTS_DIR, agentId, 'sessions', 'sessions.json');
  if (!fs.existsSync(sessFile)) return null;
  try {
    const sessions = JSON.parse(fs.readFileSync(sessFile, 'utf8'));
    let best = null;
    for (const [, val] of Object.entries(sessions)) {
      if (val.label === label) {
        if (!best || (val.updatedAt || 0) > (best.updatedAt || 0)) {
          best = val;
        }
      }
    }
    return best ? best.sessionId : null;
  } catch {
    return null;
  }
}

/** 查找agent最新的session文件（排除.deleted） */
function findLatestSession(agentId) {
  const sessDir = path.join(AGENTS_DIR, agentId, 'sessions');
  if (!fs.existsSync(sessDir)) return null;
  try {
    const files = fs.readdirSync(sessDir)
      .filter(f => f.endsWith('.jsonl') && !f.includes('.deleted'))
      .map(f => {
        const fp = path.join(sessDir, f);
        return { path: fp, mtime: fs.statSync(fp).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    return files.length > 0 ? files[0].path : null;
  } catch {
    return null;
  }
}

/** 追加日志 */
function appendLog(msg) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* ignore */ }
}

// ── 主逻辑 ──

if (!fs.existsSync(BOARD_FILE)) {
  if (!quiet) console.log('⚠️ 看板文件不存在:', BOARD_FILE);
  process.exit(0);
}

let board = [];
try { board = JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8')); } catch { board = []; }
if (!Array.isArray(board)) board = [];
const running = board.filter(t => t.status === 'running');

if (running.length === 0) {
  if (!quiet) console.log('✅ 无running任务，无需检测');
  process.exit(0);
}

const now = Date.now();
const results = { zombies: [], stale: [], healthy: [] };

for (const task of running) {
  const { agentId, label, spawnTime, taskId } = task;

  // 1. 精确匹配：通过label在sessions.json中找sessionId
  let sessionFile = null;
  const sessionId = findSessionByLabel(agentId, label);
  if (sessionId) {
    const candidate = path.join(AGENTS_DIR, agentId, 'sessions', `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) sessionFile = candidate;
  }

  // 2. 兜底：找agent最新的session文件（必须晚于spawnTime，避免匹配到上一个任务的session）
  if (!sessionFile) {
    const candidate = findLatestSession(agentId);
    if (candidate) {
      const candidateMtime = fs.statSync(candidate).mtimeMs;
      const spawnMs = spawnTime ? new Date(spawnTime).getTime() : 0;
      if (candidateMtime > spawnMs) {
        sessionFile = candidate;
      }
      // 如果session文件比spawnTime还早，说明是上一个任务的session，不匹配
    }
  }

  // 3. 判定状态
  let status = 'unknown';
  let reason = '';

  if (sessionFile) {
    const lastLine = readLastLine(sessionFile);
    const fileMtime = fs.statSync(sessionFile).mtimeMs;
    const ageMinutes = (now - fileMtime) / 60000;

    if (lastLine) {
      try {
        const lastMsg = JSON.parse(lastLine);
        const stopReason = lastMsg?.message?.stopReason;

        const terminalReasons = ['stop', 'end_turn', 'aborted', 'length'];
        if (terminalReasons.includes(stopReason)) {
          // session已终止（正常完成/中止/超长），但看板还是running → 僵尸
          status = 'zombie';
          reason = `session已终止(stopReason=${stopReason})，看板仍为running，距完成${Math.round(ageMinutes)}分钟`;
        } else if (ageMinutes > STALE_MINUTES && stopReason !== 'toolUse') {
          // 长时间无更新且不在等工具调用 → 疑似卡住
          status = 'stale';
          reason = `session ${Math.round(ageMinutes)}分钟未更新(stopReason=${stopReason || 'N/A'})`;
        } else if (ageMinutes > STALE_MINUTES * 3) {
          // 即使在toolUse，超过3倍阈值也标记为stale
          status = 'stale';
          reason = `session ${Math.round(ageMinutes)}分钟未更新，严重超时(stopReason=${stopReason || 'N/A'})`;
        } else {
          status = 'healthy';
          reason = `正常(stopReason=${stopReason || 'N/A'}，${Math.round(ageMinutes)}分钟前更新)`;
        }
      } catch {
        if (ageMinutes > STALE_MINUTES) {
          status = 'stale';
          reason = `无法解析session末行，且${Math.round(ageMinutes)}分钟未更新`;
        } else {
          status = 'healthy';
          reason = '无法解析session末行，但文件仍在更新';
        }
      }
    } else {
      status = ageMinutes > STALE_MINUTES ? 'stale' : 'healthy';
      reason = ageMinutes > STALE_MINUTES
        ? `session文件为空或不可读，${Math.round(ageMinutes)}分钟未更新`
        : 'session文件为空，可能刚启动';
    }
  } else {
    // 找不到session文件
    const spawnAge = spawnTime ? (now - new Date(spawnTime).getTime()) / 60000 : Infinity;
    if (spawnAge > STALE_MINUTES) {
      status = 'stale';
      reason = `找不到session文件，已过${Math.round(spawnAge)}分钟`;
    } else {
      status = 'healthy';
      reason = '刚启动，session文件可能还未创建';
    }
  }

  const entry = { taskId, label, agentId, spawnTime, sessionId, status, reason };
  if (status === 'zombie') results.zombies.push(entry);
  else if (status === 'stale') results.stale.push(entry);
  else results.healthy.push(entry);
}

// ── 报告 ──
if (!quiet) {
  console.log('');
  console.log('=== 僵尸任务检测报告 ===');
  console.log(`检测时间: ${new Date().toISOString()}`);
  console.log(`超时阈值: ${STALE_MINUTES}分钟`);
  console.log(`running任务: ${running.length}`);
  console.log(`  🧟 僵尸(已完成未更新): ${results.zombies.length}`);
  console.log(`  ⏰ 超时(疑似卡住):     ${results.stale.length}`);
  console.log(`  ✅ 正常:               ${results.healthy.length}`);

  for (const z of results.zombies) {
    console.log(`\n🧟 僵尸: ${z.label} (${z.agentId})`);
    console.log(`   原因: ${z.reason}`);
    console.log(`   taskId: ${z.taskId}`);
  }
  for (const s of results.stale) {
    console.log(`\n⏰ 超时: ${s.label} (${s.agentId})`);
    console.log(`   原因: ${s.reason}`);
    console.log(`   taskId: ${s.taskId}`);
  }
  for (const h of results.healthy) {
    console.log(`\n✅ 正常: ${h.label} (${h.agentId})`);
    console.log(`   状态: ${h.reason}`);
  }
}

// ── 自动修正 ──
const fixTargets = [...results.zombies, ...results.stale];
let fixCount = 0;

if (autoFix && fixTargets.length > 0) {
  for (const item of fixTargets) {
    const task = board.find(t => t.taskId === item.taskId);
    if (!task) continue;

    if (item.status === 'zombie') {
      task.status = 'done';
      task.result_summary = task.result_summary || '(僵尸任务自动回收 — session已完成但completion event丢失)';
    } else {
      task.status = 'timeout';
      task.result_summary = task.result_summary || '(超时任务自动回收 — session疑似卡住)';
    }
    task.auto_fixed = true;
    task.fixed_at = new Date().toISOString();
    task.fixed_reason = item.reason;
    fixCount++;
  }

  if (fixCount > 0) {
    // BUG-4: 用 flock 文件锁保护写操作，防止并发写入冲突
    const boardData = JSON.stringify(board, null, 2) + '\n';
    try {
      execSync(`flock -x /tmp/task-board.lock -c 'cat > "${BOARD_FILE}"'`, { input: boardData });
    } catch (e) {
      // flock 失败时降级为直接写入
      fs.writeFileSync(BOARD_FILE, boardData);
    }
    const msg = `自动修正 ${fixCount} 个任务: ${fixTargets.map(t => `${t.label}(${t.status}→${t.status === 'zombie' ? 'done' : 'timeout'})`).join(', ')}`;
    if (!quiet) console.log(`\n✅ ${msg}`);
    appendLog(`FIX: ${msg}`);
  }
} else if (!autoFix && fixTargets.length > 0) {
  if (!quiet) {
    console.log(`\n⚠️ 发现 ${fixTargets.length} 个异常任务，使用 --fix 自动修正`);
  }
}

// ── 日志 ──
if (fixTargets.length > 0) {
  appendLog(`SCAN: running=${running.length} zombie=${results.zombies.length} stale=${results.stale.length} healthy=${results.healthy.length} fixed=${fixCount}`);
} else if (!quiet) {
  appendLog(`SCAN: running=${running.length} all_healthy`);
}

// exit 1 = 有异常（未修复时），0 = 全部正常或已修复
const hasUnfixed = !autoFix && fixTargets.length > 0;
process.exit(hasUnfixed ? 1 : 0);
