#!/usr/bin/env node
'use strict';

/**
 * tracker-sync-handler — PROJECT-TRACKER 自动同步处理器
 * 
 * 监听任务生命周期事件，自动将状态变更同步到PROJECT-TRACKER.md。
 * 确保TRACKER作为唯一真相源始终与task JSON保持一致。
 * 
 * 事件输入: task.status.changed / task.created / task.expanded
 * 事件输出: tracker.sync.completed / tracker.desync.detected
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..', '..', '..');
const TASKS_DIR = path.join(WORKSPACE, 'memory', 'tasks');
const TRACKER_PATH = path.join(WORKSPACE, 'PROJECT-TRACKER.md');
const REPORTS_DIR = path.join(WORKSPACE, 'reports', 'tracker-sync');

const STATUS_MAP = {
  'open': '📋',
  'doing': '⏳',
  'done': '✅',
  'completed': '✅',
  'blocked': '🔴',
  'rejected': '❌',
  'error': '🔴'
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * 从task JSON文件读取所有任务的当前状态
 */
function readTaskStates() {
  if (!fs.existsSync(TASKS_DIR)) return [];
  return fs.readdirSync(TASKS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, f), 'utf8'));
        return { file: f, ...data };
      } catch (_) { return null; }
    })
    .filter(Boolean);
}

/**
 * 从TRACKER中解析已有条目的状态
 */
function parseTrackerStates() {
  if (!fs.existsSync(TRACKER_PATH)) return {};
  const content = fs.readFileSync(TRACKER_PATH, 'utf8');
  const states = {};
  
  // 匹配 "- ✅/🔴/⏳/📋/❌ [P0/P1] 标题" 格式
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^-\s*(✅|🔴|⏳|📋|❌)\s+(?:→\s+)?(?:\*\*)?(?:P\d\s+)?(.+?)(?:\*\*)?(?:\s*\[.*\])?(?:\s*—.*)?$/);
    if (match) {
      const [, icon, title] = match;
      states[title.trim()] = icon;
    }
  }
  return states;
}

/**
 * 检测desync：task JSON状态与TRACKER不一致的条目
 */
function detectDesync() {
  const tasks = readTaskStates();
  const trackerStates = parseTrackerStates();
  
  const desyncs = [];
  for (const task of tasks) {
    const expectedIcon = STATUS_MAP[task.status] || '📋';
    const trackerIcon = trackerStates[task.title];
    
    if (!trackerIcon) {
      desyncs.push({
        task_id: task.id,
        title: task.title,
        type: 'missing_in_tracker',
        task_status: task.status,
        expected_icon: expectedIcon
      });
    } else if (trackerIcon !== expectedIcon) {
      desyncs.push({
        task_id: task.id,
        title: task.title,
        type: 'status_mismatch',
        task_status: task.status,
        expected_icon: expectedIcon,
        tracker_icon: trackerIcon
      });
    }
  }
  
  return { tasks_count: tasks.length, tracker_entries: Object.keys(trackerStates).length, desyncs };
}

/**
 * 生成TRACKER的自主扩列区域内容
 */
function renderExpandedSection(tasks) {
  const subtasks = tasks.filter(t => t.parent_task);
  if (subtasks.length === 0) return '';
  
  const lines = ['### 自主扩列任务（自动生成）', ''];
  for (const task of subtasks) {
    const icon = STATUS_MAP[task.status] || '⏳';
    lines.push(`- ${icon} ${task.priority || 'P1'} ${task.title} [parent=${task.parent_task}]`);
  }
  return lines.join('\n');
}

/**
 * 同步：将task JSON状态写入TRACKER
 */
function syncToTracker() {
  if (!fs.existsSync(TRACKER_PATH)) {
    return { ok: false, error: 'TRACKER not found' };
  }
  
  const tasks = readTaskStates();
  let tracker = fs.readFileSync(TRACKER_PATH, 'utf8');
  let synced = 0;
  
  // 更新自主扩列区域
  const expandedSection = renderExpandedSection(tasks);
  const sectionTitle = '### 自主扩列任务（自动生成）';
  
  if (tracker.includes(sectionTitle)) {
    // 替换整个自主扩列区域
    const sectionStart = tracker.indexOf(sectionTitle);
    const nextSection = tracker.indexOf('\n###', sectionStart + sectionTitle.length);
    const sectionEnd = nextSection === -1 ? tracker.length : nextSection;
    
    tracker = tracker.slice(0, sectionStart) + expandedSection + tracker.slice(sectionEnd);
    synced++;
  } else if (expandedSection) {
    tracker += '\n\n' + expandedSection + '\n';
    synced++;
  }
  
  // 更新根任务状态图标
  for (const task of tasks.filter(t => !t.parent_task)) {
    const icon = STATUS_MAP[task.status] || '📋';
    // 尝试匹配各种格式
    const escapedTitle = task.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`(🔴|✅|⏳|📋|❌)(\\s+(?:P\\d\\s+)?${escapedTitle})`),
    ];
    for (const pattern of patterns) {
      if (pattern.test(tracker)) {
        tracker = tracker.replace(pattern, `${icon}$2`);
        synced++;
        break;
      }
    }
  }
  
  fs.writeFileSync(TRACKER_PATH, tracker, 'utf8');
  
  return { ok: true, synced, tasks_count: tasks.length };
}

/**
 * 完整的同步检查+修复流程
 */
function fullSync() {
  ensureDir(REPORTS_DIR);
  
  // Step 1: Detect desync
  const desync = detectDesync();
  
  // Step 2: Sync
  const syncResult = syncToTracker();
  
  // Step 3: Re-check
  const postSync = detectDesync();
  
  const report = {
    timestamp: new Date().toISOString(),
    pre_sync_desyncs: desync.desyncs.length,
    post_sync_desyncs: postSync.desyncs.length,
    fixed: desync.desyncs.length - postSync.desyncs.length,
    remaining: postSync.desyncs,
    sync_result: syncResult
  };
  
  const reportFile = path.join(REPORTS_DIR, `sync-${Date.now()}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
  
  return report;
}

// ─── 模块导出 ───
async function run(input, context) {
  const mode = input?.mode || 'full-sync';
  
  switch (mode) {
    case 'detect':
      return detectDesync();
    case 'sync':
      return syncToTracker();
    case 'full-sync':
      return fullSync();
    default:
      return fullSync();
  }
}

module.exports = run;
module.exports.run = run;
module.exports.detectDesync = detectDesync;
module.exports.syncToTracker = syncToTracker;
module.exports.fullSync = fullSync;

if (require.main === module) {
  const result = fullSync();
  console.log(JSON.stringify(result, null, 2));
}
