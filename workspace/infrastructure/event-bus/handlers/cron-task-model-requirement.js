'use strict';

const fs = require('fs');
const path = require('path');

function appendJsonl(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

function findTaskFile(tasksDir, payload = {}) {
  const ids = [payload.task_id, payload.id].filter(Boolean);
  for (const id of ids) {
    const direct = path.join(tasksDir, `${id}.json`);
    if (fs.existsSync(direct)) return direct;
  }

  if (ids.length === 0 && payload.name) {
    const files = fs.readdirSync(tasksDir)
      .filter(name => name.endsWith('.json'))
      .map(name => path.join(tasksDir, name))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    for (const file of files.slice(0, 50)) {
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (data.id === payload.task_id || data.name === payload.name) return file;
      } catch {}
    }
  }

  return null;
}

module.exports = async function cronTaskModelRequirement(event, rule, context = {}) {
  const workspace = context.workspace || '/root/.openclaw/workspace';
  const tasksDir = path.join(workspace, 'skills', 'lto-core', 'tasks');
  const reportFile = path.join(workspace, 'infrastructure', 'logs', 'cron-task-model-enforcement.jsonl');
  const payload = event.payload || {};

  if (!fs.existsSync(tasksDir)) {
    return { ok: false, autonomous: false, reason: 'tasks_dir_missing' };
  }

  const taskFile = findTaskFile(tasksDir, payload);
  if (!taskFile) {
    return { ok: false, autonomous: false, reason: 'task_file_not_found', task_id: payload.task_id || null };
  }

  const task = JSON.parse(fs.readFileSync(taskFile, 'utf8'));
  const beforeModel = task.model || task.payload?.model || null;
  let action = 'verified_existing_model';
  let afterModel = beforeModel;

  if (!beforeModel) {
    afterModel = 'zhipu/glm-5';
    task.model = afterModel;
    task.payload = task.payload || {};
    task.payload.model = afterModel;
    task.updated_at = new Date().toISOString();
    fs.writeFileSync(taskFile, JSON.stringify(task, null, 2) + '\n', 'utf8');
    action = 'applied_default_model';
  }

  const verified = JSON.parse(fs.readFileSync(taskFile, 'utf8'));
  const verificationPassed = (verified.model || verified.payload?.model) === afterModel;

  const record = {
    timestamp: new Date().toISOString(),
    handler: 'cron-task-model-requirement',
    ruleId: rule.id,
    eventType: event.type,
    taskFile,
    taskId: verified.id,
    action,
    beforeModel,
    afterModel,
    verificationPassed,
  };
  appendJsonl(reportFile, record);

  if (verificationPassed && context.bus?.emit) {
    await context.bus.emit('dto.task.model.enforced', {
      task_id: verified.id,
      model: afterModel,
      action,
      task_file: taskFile,
    }, 'cron-task-model-requirement');
  }

  return {
    ok: verificationPassed,
    autonomous: true,
    action,
    taskId: verified.id,
    model: afterModel,
    taskFile,
  };
};
