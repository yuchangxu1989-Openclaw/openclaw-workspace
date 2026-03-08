#!/usr/bin/env node
/**
 * Event-Driven Watcher Daemon
 * 
 * 统一管理所有 fs.watch 实例。单进程启动，监控所有事件源。
 * 
 * 用法：
 *   node event-watcher-daemon.js          # 启动所有 watcher
 *   node event-watcher-daemon.js --status  # 检查状态
 *   node event-watcher-daemon.js --stop    # 停止守护进程
 * 
 * 注册的 Watcher：
 *   1. ISC Rules Watcher  — 监听 rules/ 目录
 *   2. 本地任务编排 Signals Watcher — 监听 .dto-signals/ 目录
 *   3. EventBus File Watcher — 监听 events.jsonl 变更
 *   4. Git Change Watcher — 监听工作区变更
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PID_FILE = path.join(__dirname, 'state/daemon.pid');
const LOG_FILE = path.join(__dirname, 'state/daemon.log');

// ─── Watcher 模块注册表 ───
const WATCHERS = [
  {
    id: 'isc-rules',
    name: 'ISC Rules Watcher',
    module: './watchers/isc-rules-watcher',
    critical: true
  },
  {
    id: 'dto-signals',
    name: '本地任务编排 Signals Watcher',
    module: './watchers/dto-signals-watcher',
    critical: true
  },
  {
    id: 'eventbus-file',
    name: 'EventBus File Watcher',
    module: './watchers/eventbus-file-watcher',
    critical: true
  },
  {
    id: 'git-change',
    name: 'Git Change Watcher',
    module: './watchers/git-change-watcher',
    critical: false // 非核心，失败不阻止启动
  }
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (_) {}
}

function startAll() {
  const stateDir = path.dirname(PID_FILE);
  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
  
  // 检查是否已在运行
  if (fs.existsSync(PID_FILE)) {
    try {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      process.kill(pid, 0);
      log(`守护进程已在运行 (PID: ${pid})，退出`);
      process.exit(0);
    } catch (_) {
      // 进程不存在，清理 stale PID
      fs.unlinkSync(PID_FILE);
    }
  }
  
  fs.writeFileSync(PID_FILE, String(process.pid));
  
  log('╔════════════════════════════════════════════════════════════╗');
  log('║         Event-Driven Watcher Daemon                      ║');
  log('╚════════════════════════════════════════════════════════════╝');
  log(`PID: ${process.pid}`);
  
  const started = [];
  const failed = [];
  
  for (const watcher of WATCHERS) {
    try {
      const mod = require(watcher.module);
      mod.start();
      started.push(watcher.id);
      log(`✅ ${watcher.name} 启动成功`);
    } catch (err) {
      failed.push({ id: watcher.id, error: err.message });
      log(`❌ ${watcher.name} 启动失败: ${err.message}`);
      
      if (watcher.critical) {
        log(`⚠️  核心 Watcher 失败，但继续启动其他 Watcher`);
      }
    }
  }
  
  log(`\n启动汇总: ${started.length}/${WATCHERS.length} 成功`);
  if (failed.length > 0) {
    log(`失败: ${failed.map(f => f.id).join(', ')}`);
  }
  
  // 健康检查定时器（每5分钟检查一次 watcher 是否存活）
  setInterval(() => {
    for (const watcher of WATCHERS) {
      try {
        const mod = require(watcher.module);
        if (typeof mod.isRunning === 'function' && !mod.isRunning()) {
          log(`⚠️  ${watcher.name} 已停止，尝试重启...`);
          try {
            mod.start();
            log(`✅ ${watcher.name} 重启成功`);
          } catch (restartErr) {
            log(`❌ ${watcher.name} 重启失败: ${restartErr.message}`);
          }
        }
      } catch (_) {}
    }
  }, 5 * 60 * 1000);
  
  // 优雅退出
  function cleanup() {
    log('守护进程停止');
    try { fs.unlinkSync(PID_FILE); } catch (_) {}
    process.exit(0);
  }
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

function getStatus() {
  const status = {
    daemon: { running: false, pid: null },
    watchers: {}
  };
  
  // 检查 daemon
  if (fs.existsSync(PID_FILE)) {
    try {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      process.kill(pid, 0);
      status.daemon = { running: true, pid };
    } catch (_) {}
  }
  
  // 检查各 watcher
  for (const watcher of WATCHERS) {
    try {
      const mod = require(watcher.module);
      status.watchers[watcher.id] = {
        name: watcher.name,
        running: typeof mod.isRunning === 'function' ? mod.isRunning() : 'unknown'
      };
    } catch (err) {
      status.watchers[watcher.id] = {
        name: watcher.name,
        running: false,
        error: err.message
      };
    }
  }
  
  return status;
}

function stopDaemon() {
  if (!fs.existsSync(PID_FILE)) {
    console.log('守护进程未运行');
    return;
  }
  
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    process.kill(pid, 'SIGTERM');
    console.log(`已向 PID ${pid} 发送停止信号`);
    fs.unlinkSync(PID_FILE);
  } catch (err) {
    console.error(`停止失败: ${err.message}`);
    try { fs.unlinkSync(PID_FILE); } catch (_) {}
  }
}

// CLI
if (require.main === module) {
  if (process.argv.includes('--status')) {
    const status = getStatus();
    console.log(JSON.stringify(status, null, 2));
    process.exit(status.daemon.running ? 0 : 1);
  }
  
  if (process.argv.includes('--stop')) {
    stopDaemon();
    process.exit(0);
  }
  
  startAll();
}

module.exports = { startAll, getStatus, stopDaemon, WATCHERS };
