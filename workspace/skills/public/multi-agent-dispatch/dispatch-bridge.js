#!/usr/bin/env node
'use strict';

/**
 * dispatch-bridge.js
 * ──────────────────
 * Bridge between DispatchEngine and the agent's sessions_spawn.
 * 
 * This file clarifies the "onDispatch is null" P0:
 * DispatchEngine is a **coordination layer** (state machine + slot accounting).
 * Actual spawning is done by the main agent via sessions_spawn tool calls.
 * 
 * The bridge provides:
 *   1. A concrete onDispatch that logs dispatch-ready tasks to a pickup file
 *   2. A `pending-dispatches.json` file the agent reads during prompt
 *   3. CLI commands for the agent to consume pending dispatches
 * 
 * Usage in agent prompt:
 *   - Engine calls onDispatch(task) → writes to pending-dispatches.json
 *   - Agent reads pending-dispatches.json at each turn
 *   - Agent calls sessions_spawn for each pending task
 *   - Agent calls `node cli.js running <taskId>` after spawn success
 *   - On subagent completion, agent calls `node cli.js done <taskId>`
 * 
 * Alternative: Agent can also just call enqueue() + manually sessions_spawn
 * without this bridge. The bridge is for automated pickup.
 */

const fs = require('fs');
const path = require('path');

const PENDING_FILE = path.join(__dirname, 'state', 'pending-dispatches.json');

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function readPending() {
  try {
    return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
  } catch {
    return { tasks: [], updatedAt: null };
  }
}

function writePending(data) {
  ensureDir(path.dirname(PENDING_FILE));
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(PENDING_FILE, JSON.stringify(data, null, 2));
}

/**
 * onDispatch callback for DispatchEngine.
 * Records the task as pending for agent pickup.
 */
function onDispatchBridge(task) {
  const pending = readPending();
  // Avoid duplicates
  if (!pending.tasks.find(t => t.taskId === task.taskId)) {
    pending.tasks.push({
      taskId: task.taskId,
      title: task.title,
      model: task.model,
      agentId: task.agentId,
      priority: task.priority,
      payload: task.payload,
      dispatchedAt: new Date().toISOString(),
    });
  }
  writePending(pending);
}

/**
 * Get all pending tasks that haven't been picked up by the agent yet.
 */
function getPendingTasks() {
  return readPending().tasks;
}

/**
 * Mark a task as picked up (agent has called sessions_spawn for it).
 */
function ackTask(taskId) {
  const pending = readPending();
  pending.tasks = pending.tasks.filter(t => t.taskId !== taskId);
  writePending(pending);
}

/**
 * Clear all pending dispatches.
 */
function clearPending() {
  writePending({ tasks: [] });
}

// CLI mode
if (require.main === module) {
  const [cmd, arg1] = process.argv.slice(2);
  switch (cmd) {
    case 'list':
      console.log(JSON.stringify(getPendingTasks(), null, 2));
      break;
    case 'ack':
      if (!arg1) { console.error('Usage: dispatch-bridge.js ack <taskId>'); process.exit(1); }
      ackTask(arg1);
      console.log(`Acked: ${arg1}`);
      break;
    case 'clear':
      clearPending();
      console.log('Pending dispatches cleared');
      break;
    default:
      console.log('Usage: dispatch-bridge.js [list|ack <taskId>|clear]');
  }
}

module.exports = { onDispatchBridge, getPendingTasks, ackTask, clearPending, PENDING_FILE };
