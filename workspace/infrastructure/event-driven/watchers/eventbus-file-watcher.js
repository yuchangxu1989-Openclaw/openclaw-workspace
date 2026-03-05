#!/usr/bin/env node
/**
 * EventBus File Watcher — Event Dispatcher 即时触发器
 * 
 * 监听 events.jsonl 文件变更。当新事件写入时，
 * 立即触发 L3 Pipeline / Dispatcher，不等 5 分钟 cron。
 * 
 * 启动方式：node eventbus-file-watcher.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const { markEventTriggered } = require('../cron-check-skip');

const EVENTS_FILE = path.join(__dirname, '../../event-bus/events.jsonl');
const CURSOR_FILE = path.join(__dirname, '../../event-bus/cursor.json');
const PID_FILE = path.join(__dirname, '../state/eventbus-watcher.pid');
const DEBOUNCE_MS = 3000; // 3秒去抖动（batch多个事件）
const MIN_INTERVAL_MS = 10000; // 最少间隔10秒（防止频繁触发）

let _debounceTimer = null;
let _lastDispatch = 0;
let _lastFileSize = 0;

/**
 * 检查是否有新的未消费事件
 */
function hasUnconsumedEvents() {
  try {
    if (!fs.existsSync(EVENTS_FILE)) return false;
    
    const stat = fs.statSync(EVENTS_FILE);
    if (stat.size === 0) return false;
    
    // 快速检查：文件大小是否增长
    if (stat.size <= _lastFileSize) return false;
    _lastFileSize = stat.size;
    
    // 精确检查：cursor offset vs 总行数
    const content = fs.readFileSync(EVENTS_FILE, 'utf8').trim();
    if (!content) return false;
    
    const totalLines = content.split('\n').length;
    let cursors = {};
    if (fs.existsSync(CURSOR_FILE)) {
      try { cursors = JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8')); } catch (_) {}
    }
    
    const dispatcherCursor = cursors['dispatcher'] || { offset: 0 };
    return dispatcherCursor.offset < totalLines;
  } catch (_) {
    return false;
  }
}

/**
 * 触发 dispatcher 处理
 */
async function triggerDispatcher() {
  const now = Date.now();
  if (now - _lastDispatch < MIN_INTERVAL_MS) return;
  
  if (!hasUnconsumedEvents()) return;
  
  _lastDispatch = now;
  const timestamp = new Date().toISOString();
  console.log(`[EB-Watcher] ${timestamp} 检测到新事件，触发dispatcher`);
  
  try {
    // 直接调用 L3 Pipeline runOnce
    const { runOnce } = require('../../pipeline/l3-pipeline');
    const result = await runOnce({ source: 'event-watch', trigger: 'events-file-changed' });
    
    markEventTriggered('event-dispatcher', {
      consumed: result.consumed_events,
      dispatched: result.dispatched_actions
    });
    
    console.log(`[EB-Watcher] ✅ Dispatcher完成: 消费${result.consumed_events}事件, 分发${result.dispatched_actions}动作`);
  } catch (err) {
    console.error(`[EB-Watcher] ❌ Dispatcher失败: ${err.message}`);
    
    // fallback: 直接用旧bus consume
    try {
      const bus = require('../../event-bus/bus');
      const events = bus.consume('dispatcher', { limit: 50 });
      if (events.length > 0) {
        markEventTriggered('event-dispatcher', { consumed: events.length, fallback: true });
        console.log(`[EB-Watcher] Fallback: 消费${events.length}事件`);
      }
    } catch (busErr) {
      console.error(`[EB-Watcher] Fallback也失败: ${busErr.message}`);
    }
  }
}

/**
 * 处理 events.jsonl 文件变更
 */
function handleEventsChange(eventType, filename) {
  if (filename && !filename.includes('events.jsonl')) return;
  
  if (_debounceTimer) clearTimeout(_debounceTimer);
  
  _debounceTimer = setTimeout(() => {
    triggerDispatcher().catch(err => {
      console.error(`[EB-Watcher] triggerDispatcher异常: ${err.message}`);
    });
  }, DEBOUNCE_MS);
}

function start() {
  const eventsDir = path.dirname(EVENTS_FILE);
  if (!fs.existsSync(eventsDir)) {
    fs.mkdirSync(eventsDir, { recursive: true });
  }
  
  // 记录初始文件大小
  try {
    _lastFileSize = fs.statSync(EVENTS_FILE).size;
  } catch (_) {}
  
  const stateDir = path.dirname(PID_FILE);
  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid));
  
  console.log(`[EB-Watcher] 启动 (PID: ${process.pid})`);
  console.log(`[EB-Watcher] 监听文件: ${EVENTS_FILE}`);
  
  const watcher = fs.watch(eventsDir, { persistent: true }, handleEventsChange);
  
  watcher.on('error', (err) => {
    console.error(`[EB-Watcher] fs.watch错误: ${err.message}`);
  });
  
  function cleanup() {
    console.log('[EB-Watcher] 停止监听');
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

module.exports = { start, isRunning, triggerDispatcher, hasUnconsumedEvents, PID_FILE };
