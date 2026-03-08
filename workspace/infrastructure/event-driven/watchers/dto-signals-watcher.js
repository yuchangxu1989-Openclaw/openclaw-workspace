#!/usr/bin/env node
/**
 * 本地任务编排 Signals Directory Watcher
 * 
 * 用 fs.watch 监听 .dto-signals/ 目录。
 * 检测到新信号文件后立即 emit dto.signal.created → 触发 本地任务编排-AEO 流水线。
 * 
 * 启动方式：node dto-signals-watcher.js
 * 停止方式：kill PID 或 Ctrl+C
 */
'use strict';

const fs = require('fs');
const path = require('path');

const bus = require('../../event-bus/bus');
const { markEventTriggered } = require('../cron-check-skip');

const SIGNALS_DIR = path.join(__dirname, '../../../.dto-signals');
const DTO_BRIDGE_PATH = path.join(__dirname, '../../../skills/dto-core/event-bridge');
const PID_FILE = path.join(__dirname, '../state/dto-signals-watcher.pid');
const PROCESSED_DIR = path.join(SIGNALS_DIR, '.processed');
const DEBOUNCE_MS = 1500;

let _debounceTimer = null;
let _processing = false;

/**
 * 获取未处理的信号文件
 */
function getPendingSignals() {
  if (!fs.existsSync(SIGNALS_DIR)) return [];
  return fs.readdirSync(SIGNALS_DIR)
    .filter(f => !f.startsWith('.') && !f.startsWith('_'))
    .filter(f => {
      const stat = fs.statSync(path.join(SIGNALS_DIR, f));
      return stat.isFile();
    });
}

/**
 * 标记信号文件为已处理
 */
function markSignalProcessed(filename) {
  if (!fs.existsSync(PROCESSED_DIR)) {
    fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  }
  const src = path.join(SIGNALS_DIR, filename);
  const dest = path.join(PROCESSED_DIR, `${Date.now()}_${filename}`);
  try {
    fs.renameSync(src, dest);
  } catch (_) {
    // fallback: copy then delete
    try {
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
    } catch (__) {}
  }
}

/**
 * 处理信号目录变更
 */
async function handleSignalChange(eventType, filename) {
  if (!filename || filename.startsWith('.')) return;
  
  if (_debounceTimer) clearTimeout(_debounceTimer);
  
  _debounceTimer = setTimeout(async () => {
    if (_processing) return;
    _processing = true;
    
    try {
      const signals = getPendingSignals();
      if (signals.length === 0) {
        _processing = false;
        return;
      }
      
      const timestamp = new Date().toISOString();
      console.log(`[本地任务编排-Watcher] ${timestamp} 检测到 ${signals.length} 个信号文件`);
      
      // 1. 读取每个信号文件并 emit 事件
      for (const signal of signals) {
        const signalPath = path.join(SIGNALS_DIR, signal);
        let signalContent = {};
        
        try {
          const raw = fs.readFileSync(signalPath, 'utf8').trim();
          if (raw) {
            signalContent = JSON.parse(raw);
          }
        } catch (_) {
          signalContent = { raw_filename: signal };
        }
        
        // emit dto.signal.created 事件
        bus.emit('dto.signal.created', {
          trigger: 'fs-watch',
          filename: signal,
          content: signalContent,
          detected_at: Date.now()
        }, 'dto-signals-watcher');
        
        console.log(`[本地任务编排-Watcher] 发布事件: dto.signal.created (${signal})`);
        
        // 标记为已处理
        markSignalProcessed(signal);
      }
      
      // 2. 触发 本地任务编排 event-bridge 处理事件队列
      try {
        const bridge = require(DTO_BRIDGE_PATH);
        const result = await bridge.processEvents();
        console.log(`[本地任务编排-Watcher] Bridge结果: ${JSON.stringify(result)}`);
      } catch (bridgeErr) {
        console.error(`[本地任务编排-Watcher] Bridge执行失败: ${bridgeErr.message}`);
      }
      
      // 3. 标记事件触发
      markEventTriggered('dto-aeo', { signals_count: signals.length, filenames: signals });
      
      console.log(`[本地任务编排-Watcher] ✅ ${signals.length} 个信号处理完成`);
    } catch (err) {
      console.error(`[本地任务编排-Watcher] ❌ 处理失败: ${err.message}`);
    } finally {
      _processing = false;
    }
  }, DEBOUNCE_MS);
}

/**
 * 启动监听
 */
function start() {
  // 确保 signals 目录存在
  if (!fs.existsSync(SIGNALS_DIR)) {
    fs.mkdirSync(SIGNALS_DIR, { recursive: true });
  }
  
  // 写 PID 文件
  const stateDir = path.dirname(PID_FILE);
  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid));
  
  console.log(`[本地任务编排-Watcher] 启动 (PID: ${process.pid})`);
  console.log(`[本地任务编排-Watcher] 监听目录: ${SIGNALS_DIR}`);
  
  // 先处理现有的未处理信号
  const pending = getPendingSignals();
  if (pending.length > 0) {
    console.log(`[本地任务编排-Watcher] 发现 ${pending.length} 个待处理信号，立即处理`);
    handleSignalChange('rename', pending[0]);
  }
  
  const watcher = fs.watch(SIGNALS_DIR, { persistent: true }, handleSignalChange);
  
  watcher.on('error', (err) => {
    console.error(`[本地任务编排-Watcher] fs.watch错误: ${err.message}`);
  });
  
  function cleanup() {
    console.log('[本地任务编排-Watcher] 停止监听');
    watcher.close();
    try { fs.unlinkSync(PID_FILE); } catch (_) {}
    process.exit(0);
  }
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  
  return watcher;
}

function isRunning() {
  if (!fs.existsSync(PID_FILE)) return false;
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    process.kill(pid, 0);
    return true;
  } catch (_) {
    try { fs.unlinkSync(PID_FILE); } catch (__) {}
    return false;
  }
}

if (require.main === module) {
  if (process.argv.includes('--check')) {
    console.log(isRunning() ? 'running' : 'stopped');
    process.exit(isRunning() ? 0 : 1);
  }
  start();
}

module.exports = { start, isRunning, handleSignalChange, getPendingSignals, PID_FILE };
