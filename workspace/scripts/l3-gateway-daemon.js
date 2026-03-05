#!/usr/bin/env node
/**
 * L3 Gateway Daemon
 * 
 * 长驻进程：安装 L3 Gateway 拦截器并保持运行。
 * Gateway 是对 bus-adapter.emit() 的猴子补丁——它必须在与
 * 实际事件发射者相同的进程中运行。
 * 
 * 作为 systemd service (openclaw-pipeline.service) 运行时，
 * 此进程安装 Gateway 后保持监听，定期记录统计信息。
 * 
 * 退出码：
 *   0 = 正常退出 (SIGTERM/SIGINT)
 *   1 = 初始化失败
 */

'use strict';

const path = require('path');
const WORKSPACE = path.join(__dirname, '..');

// ── 工作目录切换 ──
process.chdir(WORKSPACE);

const STATS_INTERVAL_MS = 60 * 1000; // 每60秒记录一次统计
const VERSION = '1.0.0';

function log(msg, data = {}) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    msg,
    ...data,
  }));
}

log('L3 Gateway Daemon starting', { version: VERSION, pid: process.pid, cwd: process.cwd() });

// ── 安装 L3 Gateway ──
let gateway;
try {
  const l3gw = require(path.join(WORKSPACE, 'infrastructure/pipeline/l3-gateway'));
  gateway = l3gw.install();
  log('L3 Gateway installed successfully', { stats: gateway.stats() });
} catch (err) {
  log('FATAL: Failed to install L3 Gateway', { error: err.message, stack: err.stack });
  process.exit(1);
}

// ── 定期统计日志 ──
const statsTimer = setInterval(() => {
  try {
    const s = gateway.stats();
    log('L3 Gateway stats', s);
  } catch (err) {
    log('Stats error', { error: err.message });
  }
}, STATS_INTERVAL_MS);

// 不阻止 SIGTERM 时正常退出
statsTimer.unref();

// ── 保持进程活跃的哨兵定时器 ──
// setInterval 保持事件循环，等待外部事件
const keepAlive = setInterval(() => {
  // no-op heartbeat — just prevents Node from exiting
}, 30 * 1000);

log('L3 Gateway Daemon ready', { pid: process.pid });

// ── 优雅退出 ──
function shutdown(signal) {
  log('Shutdown received', { signal });
  clearInterval(statsTimer);
  clearInterval(keepAlive);
  try {
    const l3gw = require(path.join(WORKSPACE, 'infrastructure/pipeline/l3-gateway'));
    l3gw.uninstall();
    log('L3 Gateway uninstalled', { finalStats: l3gw.stats() });
  } catch (_) {}
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  log('uncaughtException', { error: err.message, stack: err.stack });
  // 不退出 — Gateway 是关键路径，保持运行
});
process.on('unhandledRejection', (reason) => {
  log('unhandledRejection', { reason: String(reason) });
});
