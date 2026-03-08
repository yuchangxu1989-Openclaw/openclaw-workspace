#!/usr/bin/env node
/**
 * Git Change Watcher — 全局自主决策流水线事件驱动器
 * 
 * 取代每30分钟全量扫描。改为：
 *   1. 监听工作区关键目录（skills/, infrastructure/, scripts/）的文件变更
 *   2. 按变更类型分类（代码/配置/日志/数据）
 *   3. emit file.changed 事件 → L3 Pipeline 按类型路由
 *   4. 按需执行版本bump/同步/清理等动作
 * 
 * 启动方式：node git-change-watcher.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const bus = require('../../event-bus/bus');
const { markEventTriggered } = require('../cron-check-skip');

const WORKSPACE = path.join(__dirname, '../../..');
const PID_FILE = path.join(__dirname, '../state/git-change-watcher.pid');
const CHANGE_LOG_FILE = path.join(__dirname, '../state/change-log.jsonl');
const DEBOUNCE_MS = 5000; // 5秒去抖动
const SCAN_INTERVAL_MS = 60000; // 1分钟定期扫描（补充fs.watch盲区）

let _debounceTimer = null;
let _processing = false;
let _lastGitState = null;

// ─── 变更分类规则 ───
const CHANGE_CLASSIFIERS = [
  {
    category: 'code',
    label: '代码变更',
    patterns: [/\.js$/, /\.ts$/, /\.py$/, /\.sh$/],
    dirs: ['skills/', 'infrastructure/', 'scripts/'],
    actions: ['version-bump', 'lint-check']
  },
  {
    category: 'config',
    label: '配置变更',
    patterns: [/\.json$/, /\.yaml$/, /\.yml$/, /\.env$/, /\.md$/],
    dirs: ['skills/isc-core/rules/', 'infrastructure/config/', 'infrastructure/dispatcher/'],
    actions: ['config-sync', 'validation']
  },
  {
    category: 'log',
    label: '日志变更',
    patterns: [/\.log$/, /\.jsonl$/],
    dirs: ['infrastructure/logs/', 'infrastructure/event-bus/data/'],
    actions: ['log-rotate', 'alert-check']
  },
  {
    category: 'data',
    label: '数据变更',
    patterns: [/\.jsonl$/, /\.csv$/],
    dirs: ['memory/', 'reports/', '.lto-signals/'],
    actions: ['data-archive']
  },
  {
    category: 'doc',
    label: '文档变更',
    patterns: [/\.md$/, /SKILL\.md$/, /README\.md$/],
    dirs: ['skills/', 'designs/'],
    actions: ['doc-index']
  }
];

/**
 * 分类单个文件变更
 * @param {string} filePath - 相对于workspace的路径
 * @returns {{ category: string, label: string, actions: string[] }}
 */
function classifyChange(filePath) {
  for (const classifier of CHANGE_CLASSIFIERS) {
    // 目录匹配优先
    const dirMatch = classifier.dirs.some(d => filePath.startsWith(d));
    const patternMatch = classifier.patterns.some(p => p.test(filePath));
    
    if (dirMatch && patternMatch) {
      return { category: classifier.category, label: classifier.label, actions: classifier.actions };
    }
  }
  
  // fallback: 按扩展名匹配
  for (const classifier of CHANGE_CLASSIFIERS) {
    if (classifier.patterns.some(p => p.test(filePath))) {
      return { category: classifier.category, label: classifier.label, actions: classifier.actions };
    }
  }
  
  return { category: 'other', label: '其他变更', actions: [] };
}

/**
 * 获取 git 变更状态
 * @returns {Array<{ status: string, file: string }>}
 */
function getGitChanges() {
  try {
    const output = execSync('git status --porcelain', {
      cwd: WORKSPACE,
      encoding: 'utf8',
      timeout: 10000
    }).trim();
    
    if (!output) return [];
    
    return output.split('\n').map(line => {
      const status = line.substring(0, 2).trim();
      const file = line.substring(3).trim();
      return { status, file };
    });
  } catch (_) {
    return [];
  }
}

/**
 * 获取 git 状态指纹（用于检测变化）
 */
function getGitStateFingerprint() {
  try {
    const changes = getGitChanges();
    return JSON.stringify(changes.map(c => c.file).sort());
  } catch (_) {
    return '';
  }
}

/**
 * 生成语义化变更报告
 * @param {Array} changes - git变更列表
 * @returns {object} 结构化报告
 */
function generateChangeReport(changes) {
  const report = {
    timestamp: new Date().toISOString(),
    total_changes: changes.length,
    categories: {},
    by_category: {},
    actions_needed: [],
    summary: ''
  };
  
  for (const change of changes) {
    const classification = classifyChange(change.file);
    const cat = classification.category;
    
    if (!report.categories[cat]) {
      report.categories[cat] = {
        label: classification.label,
        count: 0,
        files: [],
        actions: new Set()
      };
    }
    
    report.categories[cat].count++;
    report.categories[cat].files.push({
      path: change.file,
      git_status: change.status
    });
    classification.actions.forEach(a => report.categories[cat].actions.add(a));
  }
  
  // Set → Array
  for (const cat of Object.keys(report.categories)) {
    report.categories[cat].actions = Array.from(report.categories[cat].actions);
    report.actions_needed.push(...report.categories[cat].actions);
  }
  report.actions_needed = [...new Set(report.actions_needed)];
  
  // 生成可读摘要
  const parts = Object.entries(report.categories)
    .map(([cat, data]) => `${data.label}${data.count}项`)
    .join('，');
  report.summary = `检测到${changes.length}项变更：${parts}`;
  
  // 扁平化 by_category 供快速访问
  for (const [cat, data] of Object.entries(report.categories)) {
    report.by_category[cat] = data.files.map(f => f.path);
  }
  
  return report;
}

/**
 * 处理检测到的变更
 */
async function processChanges() {
  if (_processing) return;
  _processing = true;
  
  try {
    const currentFingerprint = getGitStateFingerprint();
    
    // 如果状态没变化，跳过
    if (currentFingerprint === _lastGitState) {
      _processing = false;
      return;
    }
    _lastGitState = currentFingerprint;
    
    const changes = getGitChanges();
    if (changes.length === 0) {
      _processing = false;
      return;
    }
    
    const report = generateChangeReport(changes);
    console.log(`[Git-Watcher] ${report.summary}`);
    
    // 1. emit 总体变更事件
    bus.emit('file.changed', {
      trigger: 'git-watch',
      report: {
        total: report.total_changes,
        summary: report.summary,
        categories: Object.keys(report.categories),
        actions_needed: report.actions_needed
      },
      detected_at: Date.now()
    }, 'git-change-watcher');
    
    // 2. 按类别 emit 细粒度事件（供 L3 Pipeline 按类型路由）
    for (const [cat, data] of Object.entries(report.categories)) {
      bus.emit(`file.changed.${cat}`, {
        trigger: 'git-watch',
        category: cat,
        label: data.label,
        count: data.count,
        files: data.files,
        actions: data.actions,
        detected_at: Date.now()
      }, 'git-change-watcher');
    }
    
    // 3. 标记事件触发
    markEventTriggered('global-pipeline', {
      total_changes: report.total_changes,
      categories: Object.keys(report.categories)
    });
    
    // 4. 写变更日志
    try {
      fs.appendFileSync(CHANGE_LOG_FILE, JSON.stringify(report) + '\n');
    } catch (_) {}
    
    console.log(`[Git-Watcher] ✅ 变更处理完成，需要动作: ${report.actions_needed.join(', ') || '无'}`);
  } catch (err) {
    console.error(`[Git-Watcher] ❌ 处理失败: ${err.message}`);
  } finally {
    _processing = false;
  }
}

/**
 * 监听的目录列表
 */
const WATCH_DIRS = [
  'skills/isc-core/rules',
  'infrastructure/dispatcher',
  'infrastructure/config',
  'infrastructure/event-bus',
  'scripts',
  '.lto-signals'
].map(d => path.join(WORKSPACE, d));

function start() {
  const stateDir = path.dirname(PID_FILE);
  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid));
  
  console.log(`[Git-Watcher] 启动 (PID: ${process.pid})`);
  
  // 初始化 git 状态
  _lastGitState = getGitStateFingerprint();
  
  // 设置 fs.watch 监听多个目录
  const watchers = [];
  for (const dir of WATCH_DIRS) {
    if (!fs.existsSync(dir)) continue;
    
    try {
      const watcher = fs.watch(dir, { persistent: true }, (eventType, filename) => {
        if (_debounceTimer) clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(() => processChanges(), DEBOUNCE_MS);
      });
      
      watcher.on('error', () => {}); // 静默处理
      watchers.push(watcher);
      console.log(`[Git-Watcher] 监听: ${dir}`);
    } catch (_) {}
  }
  
  // 定期扫描补充（fs.watch 可能遗漏子目录变更）
  const scanInterval = setInterval(() => processChanges(), SCAN_INTERVAL_MS);
  
  function cleanup() {
    console.log('[Git-Watcher] 停止监听');
    watchers.forEach(w => w.close());
    clearInterval(scanInterval);
    try { fs.unlinkSync(PID_FILE); } catch (_) {}
    process.exit(0);
  }
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
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
  if (process.argv.includes('--once')) {
    processChanges().then(() => process.exit(0));
  } else {
    start();
  }
}

module.exports = {
  start, isRunning, processChanges, getGitChanges,
  classifyChange, generateChangeReport, PID_FILE
};
