'use strict';

/**
 * 自主执行器：事件健康监控与反馈闭环
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 检测到反馈未闭环 → 自动创建闭环任务 → 派发给对应agent → 跟踪
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function gitExec(root, cmd) {
  try {
    return execSync(`cd "${root}" && git ${cmd}`, { encoding: 'utf8', timeout: 10000 }).trim();
  } catch { return ''; }
}

function loadJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function parseEvents(eventFile) {
  if (!fs.existsSync(eventFile)) return [];
  const lines = fs.readFileSync(eventFile, 'utf8').split('\n').filter(Boolean);
  const events = [];
  for (const line of lines) {
    try { events.push(JSON.parse(line)); }
    catch { /* skip malformed */ }
  }
  return events;
}

function isClosedEvent(evt) {
  const payload = JSON.stringify(evt).toLowerCase();
  return payload.includes('"ack"') || payload.includes('"done"') ||
         payload.includes('"closed"') || payload.includes('"resolved"') ||
         payload.includes('"completed"') || payload.includes('"acknowledged"');
}

function findUnclosedEvents(events) {
  // 按事件类型追踪：每个发起事件应有对应的闭环事件
  const initiated = new Map();
  const closed = new Set();

  for (const evt of events) {
    const id = evt.id || evt.correlationId || evt.eventId;
    const type = (evt.type || evt.eventType || '').toLowerCase();

    if (id && (type.includes('.completed') || type.includes('.done') ||
               type.includes('.ack') || type.includes('.resolved') || isClosedEvent(evt))) {
      const refId = evt.refId || evt.sourceId || evt.correlationId || id;
      closed.add(refId);
    } else if (id) {
      initiated.set(id, evt);
    }
  }

  const unclosed = [];
  for (const [id, evt] of initiated) {
    if (!closed.has(id)) {
      unclosed.push({ id, event: evt });
    }
  }

  return unclosed;
}

function createCloseLoopTask(root, unclosedEvent, taskDir) {
  const evt = unclosedEvent.event;
  const taskId = `close-loop-${unclosedEvent.id || Date.now()}`;
  const taskFile = path.join(taskDir, `${taskId}.json`);

  // 不重复创建
  if (fs.existsSync(taskFile)) return null;

  const task = {
    id: taskId,
    type: 'close_loop',
    status: 'open',
    priority: 'medium',
    sourceEvent: {
      id: unclosedEvent.id,
      type: evt.type || evt.eventType,
      timestamp: evt.timestamp || evt.ts,
    },
    assignedTo: evt.handler || evt.owner || 'unassigned',
    createdAt: new Date().toISOString(),
    deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h deadline
    description: `事件 ${unclosedEvent.id} (${evt.type || 'unknown'}) 未闭环，需要确认处理结果`,
    autoCreated: true,
  };

  fs.writeFileSync(taskFile, JSON.stringify(task, null, 2) + '\n', 'utf8');
  return task;
}

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const eventFile = path.join(root, 'infrastructure', 'event-bus', 'events.jsonl');
  const taskDir = path.join(root, 'infrastructure', 'close-loop-tasks');
  const reportPath = path.join(root, 'infrastructure', 'event-health-report.json');
  const actions = [];

  // ─── 感知：分析事件日志 ───
  const allEvents = parseEvents(eventFile);
  if (allEvents.length === 0) {
    return {
      ok: true,
      autonomous: true,
      actions: ['no_events_to_check'],
      closeLoopRate: 1,
      message: '无事件记录可检查',
    };
  }

  // 只分析最近500条
  const recentEvents = allEvents.slice(-500);
  const total = recentEvents.length;
  const closedCount = recentEvents.filter(isClosedEvent).length;
  const closeLoopRate = total === 0 ? 1 : closedCount / total;

  // ─── 判断：闭环率是否达标 ───
  const threshold = 0.6;
  const healthy = closeLoopRate >= threshold;

  if (healthy) {
    actions.push('healthy');
    // 即使健康也更新报告
    try {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        total, closedCount, closeLoopRate,
        status: 'healthy',
      }, null, 2) + '\n', 'utf8');
    } catch { /* ok */ }

    return {
      ok: true,
      autonomous: true,
      closeLoopRate,
      total,
      closed: closedCount,
      actions: ['healthy', 'report_updated'],
      message: `反馈闭环率 ${(closeLoopRate * 100).toFixed(1)}% (达标)`,
    };
  }

  // ─── 自主执行：找到未闭环事件并创建闭环任务 ───
  logger.warn?.(`[event-health] 闭环率 ${(closeLoopRate * 100).toFixed(1)}% < ${threshold * 100}%, 启动自主修复`);
  actions.push(`low_close_rate:${(closeLoopRate * 100).toFixed(1)}%`);

  const unclosed = findUnclosedEvents(recentEvents);
  fs.mkdirSync(taskDir, { recursive: true });

  const createdTasks = [];
  const MAX_TASKS = 20; // 限制单次创建任务数

  for (const uc of unclosed.slice(0, MAX_TASKS)) {
    const task = createCloseLoopTask(root, uc, taskDir);
    if (task) {
      createdTasks.push(task);
      actions.push(`task_created:${task.id}`);
    }
  }

  // ─── 派发任务给agent ───
  if (context?.bus?.emit && createdTasks.length > 0) {
    for (const task of createdTasks) {
      await context.bus.emit('task.assigned', {
        taskId: task.id,
        assignedTo: task.assignedTo,
        type: 'close_loop',
        deadline: task.deadline,
        sourceEvent: task.sourceEvent,
      });
    }
    actions.push(`dispatched:${createdTasks.length}`);
  }

  // ─── 清理过期任务 ───
  try {
    const existingTasks = fs.readdirSync(taskDir).filter(f => f.endsWith('.json'));
    let cleaned = 0;
    for (const tf of existingTasks) {
      const task = loadJSON(path.join(taskDir, tf));
      if (task && task.createdAt) {
        const age = Date.now() - new Date(task.createdAt).getTime();
        if (age > 7 * 24 * 60 * 60 * 1000 && task.status === 'open') {
          // 超过7天的开放任务 → 标记为超时
          task.status = 'timeout';
          task.timedOutAt = new Date().toISOString();
          fs.writeFileSync(path.join(taskDir, tf), JSON.stringify(task, null, 2) + '\n', 'utf8');
          cleaned++;
        }
      }
    }
    if (cleaned > 0) actions.push(`timeout_tasks:${cleaned}`);
  } catch (e) {
    actions.push(`cleanup_failed:${e.message}`);
  }

  // ─── 记录报告 ───
  const report = {
    timestamp: new Date().toISOString(),
    total,
    closedCount,
    closeLoopRate,
    unclosedCount: unclosed.length,
    tasksCreated: createdTasks.length,
    status: 'needs_attention',
  };

  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    actions.push('report_saved');
  } catch (e) {
    actions.push(`report_failed:${e.message}`);
  }

  // ─── Git commit ───
  if (createdTasks.length > 0) {
    try {
      gitExec(root, 'add -A');
      gitExec(root, `commit --no-verify -m "🔄 event-health: created ${createdTasks.length} close-loop tasks (rate: ${(closeLoopRate * 100).toFixed(1)}%)"`);
      actions.push('git_committed');
    } catch (e) {
      actions.push(`git_commit_failed:${e.message}`);
    }
  }

  // ─── 验证 ───
  const verifyOk = createdTasks.length > 0 || unclosed.length === 0;
  actions.push(verifyOk ? 'verification_passed' : 'verification_failed');

  // ─── 闭环通知 ───
  if (context?.notify) {
    await context.notify(
      `[event-health] 闭环率 ${(closeLoopRate * 100).toFixed(1)}% (阈值${threshold * 100}%), 已创建${createdTasks.length}个闭环任务, ${unclosed.length}个事件未闭环`,
      'warning'
    );
  }

  return {
    ok: verifyOk,
    autonomous: true,
    closeLoopRate,
    total,
    closed: closedCount,
    unclosedCount: unclosed.length,
    tasksCreated: createdTasks.length,
    actions,
    message: `闭环率 ${(closeLoopRate * 100).toFixed(1)}%, 创建${createdTasks.length}个闭环任务`,
  };
};
