#!/usr/bin/env node
/**
 * ISC Rules Directory Watcher
 * 
 * 用 fs.watch 监听 isc-core/rules/ 目录变更。
 * 检测到变更后立即 emit isc.rule.changed 事件到 EventBus，
 * 并调用 ISC event-bridge 的 publishChangesWithSummary() 进行完整变更发布。
 * 
 * 启动方式：node isc-rules-watcher.js
 * 停止方式：kill PID 或 Ctrl+C
 */
'use strict';

const fs = require('fs');
const path = require('path');

const bus = require('../../event-bus/bus');
const { markEventTriggered } = require('../cron-check-skip');

const RULES_DIR = path.join(__dirname, '../../../skills/isc-core/rules');
const ISC_BRIDGE_PATH = path.join(__dirname, '../../../skills/isc-core/event-bridge');
const PID_FILE = path.join(__dirname, '../state/isc-rules-watcher.pid');
const DEBOUNCE_MS = 2000; // 2秒去抖动（文件保存可能多次触发）

let _debounceTimer = null;
let _processing = false;

/**
 * 处理规则目录变更
 */
async function handleRulesChange(eventType, filename) {
  if (!filename || !filename.endsWith('.json')) return;
  
  // 去抖动：多个快速变更合并为一次处理
  if (_debounceTimer) clearTimeout(_debounceTimer);
  
  _debounceTimer = setTimeout(async () => {
    if (_processing) return;
    _processing = true;
    
    try {
      const timestamp = new Date().toISOString();
      console.log(`[ISC-Watcher] ${timestamp} 检测到规则变更: ${eventType} ${filename}`);
      
      // 1. 立即 emit 快速通知事件
      bus.emit('isc.rule.changed', {
        trigger: 'fs-watch',
        filename,
        event_type: eventType,
        detected_at: Date.now()
      }, 'isc-rules-watcher');
      
      // 2. 调用完整的 ISC event-bridge 进行 hash 比对和细粒度事件发布
      try {
        const bridge = require(ISC_BRIDGE_PATH);
        const result = bridge.publishChangesWithSummary();
        console.log(`[ISC-Watcher] Bridge结果: ${JSON.stringify(result)}`);
      } catch (bridgeErr) {
        console.error(`[ISC-Watcher] Bridge执行失败: ${bridgeErr.message}`);
      }
      
      // 3. 标记事件触发，供 cron check-and-skip 使用
      markEventTriggered('isc-detect', { filename, eventType });
      
      console.log(`[ISC-Watcher] ✅ 变更处理完成: ${filename}`);
    } catch (err) {
      console.error(`[ISC-Watcher] ❌ 处理失败: ${err.message}`);
    } finally {
      _processing = false;
    }
  }, DEBOUNCE_MS);
}

/**
 * 启动监听
 */
function start() {
  if (!fs.existsSync(RULES_DIR)) {
    console.error(`[ISC-Watcher] 规则目录不存在: ${RULES_DIR}`);
    process.exit(1);
  }
  
  // 写 PID 文件
  const stateDir = path.dirname(PID_FILE);
  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid));
  
  console.log(`[ISC-Watcher] 启动 (PID: ${process.pid})`);
  console.log(`[ISC-Watcher] 监听目录: ${RULES_DIR}`);
  
  const watcher = fs.watch(RULES_DIR, { persistent: true }, handleRulesChange);
  
  watcher.on('error', (err) => {
    console.error(`[ISC-Watcher] fs.watch错误: ${err.message}`);
  });
  
  // 优雅退出
  function cleanup() {
    console.log('[ISC-Watcher] 停止监听');
    watcher.close();
    try { fs.unlinkSync(PID_FILE); } catch (_) {}
    process.exit(0);
  }
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  
  return watcher;
}

/**
 * 检查 watcher 是否在运行
 */
function isRunning() {
  if (!fs.existsSync(PID_FILE)) return false;
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    process.kill(pid, 0); // 检查进程是否存在
    return true;
  } catch (_) {
    // 进程不存在，清理 PID 文件
    try { fs.unlinkSync(PID_FILE); } catch (__) {}
    return false;
  }
}

// CLI
if (require.main === module) {
  if (process.argv.includes('--check')) {
    console.log(isRunning() ? 'running' : 'stopped');
    process.exit(isRunning() ? 0 : 1);
  }
  start();
}

module.exports = { start, isRunning, handleRulesChange, PID_FILE };
