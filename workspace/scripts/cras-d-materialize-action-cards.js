#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(WORKSPACE, 'reports', 'cras-d-research-strategy-summary.json');
const TASKS_DIR = path.join(WORKSPACE, 'memory', 'tasks');
const DTO_TASKS_DIR = path.join(WORKSPACE, 'skills', 'dto-core', 'tasks');
const REPORTS_DIR = path.join(WORKSPACE, 'reports');
const TRACKER_PATH = path.join(WORKSPACE, 'PROJECT-TRACKER.md');
const CLOSE_LOOP_DIR = path.join(WORKSPACE, 'infrastructure', 'close-loop-tasks');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

function writeText(file, content) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content, 'utf8');
}

function nowIso() {
  return new Date().toISOString();
}

function slugify(input) {
  return String(input || 'task')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'task';
}

function derivePriority(actionId) {
  if (actionId === 'A2' || actionId === 'A4') return 'P0';
  return 'P1';
}

function deriveStatus(actionId) {
  return actionId === 'A2' ? 'doing' : 'open';
}

function ownerFor(actionId) {
  if (actionId === 'A1') return 'cras/research';
  if (actionId === 'A2') return 'ops/governance';
  if (actionId === 'A3') return 'cras/reporting';
  if (actionId === 'A4') return 'project-mgmt/dto';
  return 'main/unknown';
}

function taskKey(action) {
  return `cras_d_${String(action.id).toLowerCase()}_${slugify(action.title).slice(0, 48)}`;
}

function memoryTaskFor(action, summary) {
  const key = taskKey(action);
  return {
    id: `task-${key}`,
    key,
    title: `CRAS-D研究策略落地 / ${action.title}`,
    priority: derivePriority(action.id),
    source: 'cras-d-research-strategy-summary',
    evidence: action.basis,
    status: deriveStatus(action.id),
    created_at: summary.generatedAt || nowIso(),
    owner: ownerFor(action.id),
    parent_task: 'task-cras_d_strategy_execution',
    labels: ['cras-d', 'research-to-execution', 'autonomy', 'governance'],
    local_gap: action.localGap,
    execution: action.execution,
    verification: action.verification,
    acceptance: [
      '必须有代码/规则/测试/文档至少两类硬产物',
      '必须绑定至少一个本地缺口指标或治理对象',
      '必须提供可执行验证命令或可脚本验证结果',
      '禁止只停留在研究结论或摘要描述'
    ],
    derived_from: {
      report: 'reports/cras-d-research-strategy-summary.json',
      action_id: action.id,
      generated_at: summary.generatedAt || nowIso()
    },
    validation_commands: validationCommands(action.id),
    governance: {
      tracker_sync_required: true,
      report_sync_required: true,
      close_loop_stub: true
    },
    updated_at: nowIso()
  };
}

function validationCommands(actionId) {
  const common = ['node scripts/cras-d-research-report.js'];
  if (actionId === 'A1') return [...common, 'node scripts/cras-d-refresh-research.js'];
  if (actionId === 'A2') return [...common, 'node scripts/cras-d-materialize-action-cards.js'];
  if (actionId === 'A3') return [...common, 'test -f reports/cras-d-action-cards.md'];
  if (actionId === 'A4') return [...common, 'node scripts/cras-d-materialize-action-cards.js --check'];
  return common;
}

function dtoTaskFor(action, memoryTask) {
  return {
    id: `dto-${memoryTask.key}`,
    intent: memoryTask.title,
    version: '1.0.0',
    status: memoryTask.status,
    source: 'cras-d-action-card-materializer',
    priority: memoryTask.priority,
    parent_task: memoryTask.parent_task,
    triggers: [
      { type: 'report_generated', report: 'cras-d-research-strategy-summary' },
      { type: 'manual', reason: 'high-confidence action card' }
    ],
    constraints: [
      { standard: 'knowledge.must_be_executable', operator: 'required', severity: 'error' },
      { standard: 'tracker.sync.required', operator: 'required', severity: 'error' }
    ],
    actions: [
      {
        type: 'materialize',
        module: 'cras-d',
        action: 'deliver-action-card',
        params: {
          action_id: action.id,
          report: 'reports/cras-d-research-strategy-summary.json',
          memory_task: `memory/tasks/${memoryTask.key}.json`
        }
      },
      {
        type: 'verify',
        module: 'project-mgmt',
        action: 'validate-governance-artifacts',
        params: {
          tracker: 'PROJECT-TRACKER.md',
          report: 'reports/cras-d-action-cards.json'
        }
      }
    ],
    metadata: {
      author: 'system/subagent',
      category: 'strategy_execution',
      owner: memoryTask.owner,
      action_card_id: action.id
    }
  };
}

function closeLoopFor(action, memoryTask) {
  return {
    id: `close-loop-${memoryTask.key}`,
    type: 'close_loop',
    status: 'open',
    priority: memoryTask.priority === 'P0' ? 'high' : 'medium',
    sourceEvent: {
      id: `cras-d-action-card-${action.id}`,
      type: 'cras.action.card.materialized',
      timestamp: Date.now()
    },
    assignedTo: memoryTask.owner,
    createdAt: nowIso(),
    deadline: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    description: `${memoryTask.title} 已物化为任务与DTO，需确认执行接入与验证结果`,
    autoCreated: true,
    links: {
      report: 'reports/cras-d-action-cards.json',
      memoryTask: `memory/tasks/${memoryTask.key}.json`,
      dtoTask: `skills/dto-core/tasks/${memoryTask.key}.json`
    }
  };
}

function appendTracker(actionCards) {
  const marker = '### 自主扩列任务（自动生成）';
  let tracker = readText(TRACKER_PATH);
  if (!tracker.includes(marker)) return false;
  const sectionTitle = '### CRAS-D 研究策略执行卡（自动生成）';
  const lines = [sectionTitle, ''];
  for (const card of actionCards) {
    lines.push(`- 📋 ${card.memoryTask.priority} ${card.memoryTask.title} [parent=${card.memoryTask.parent_task}]`);
  }
  const block = lines.join('\n');
  if (tracker.includes(sectionTitle)) {
    tracker = tracker.replace(new RegExp(`${sectionTitle}[\\s\\S]*?(?=\n### |$)`), block + '\n');
  } else {
    tracker = tracker.replace(marker, `${marker}\n\n${block}`);
  }
  writeText(TRACKER_PATH, tracker);
  return true;
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const summary = readJson(REPORT_PATH, null);
  if (!summary || !Array.isArray(summary.actions)) {
    throw new Error('Missing or invalid cras-d research strategy summary JSON');
  }

  const highConfidence = summary.actions.filter(action => ['A1', 'A2', 'A3', 'A4'].includes(action.id));
  const actionCards = highConfidence.map(action => {
    const memoryTask = memoryTaskFor(action, summary);
    const dtoTask = dtoTaskFor(action, memoryTask);
    const closeLoop = closeLoopFor(action, memoryTask);
    return { action, memoryTask, dtoTask, closeLoop };
  });

  const backlog = {
    generatedAt: nowIso(),
    sourceReport: 'reports/cras-d-research-strategy-summary.json',
    rootTask: {
      id: 'task-cras_d_strategy_execution',
      title: 'CRAS-D研究策略执行化闭环',
      priority: 'P0',
      governance: ['memory/tasks', 'skills/dto-core/tasks', 'PROJECT-TRACKER.md', 'infrastructure/close-loop-tasks']
    },
    cards: actionCards.map(({ action, memoryTask, dtoTask, closeLoop }) => ({
      id: action.id,
      title: action.title,
      priority: memoryTask.priority,
      owner: memoryTask.owner,
      memory_task: `memory/tasks/${memoryTask.key}.json`,
      dto_task: `skills/dto-core/tasks/${memoryTask.key}.json`,
      close_loop: `infrastructure/close-loop-tasks/${closeLoop.id}.json`,
      validation_commands: memoryTask.validation_commands,
      local_gap: action.localGap,
      verification: action.verification
    }))
  };

  if (!checkOnly) {
    for (const card of actionCards) {
      writeJson(path.join(TASKS_DIR, `${card.memoryTask.key}.json`), card.memoryTask);
      writeJson(path.join(DTO_TASKS_DIR, `${card.memoryTask.key}.json`), card.dtoTask);
      writeJson(path.join(CLOSE_LOOP_DIR, `${card.closeLoop.id}.json`), card.closeLoop);
    }
    writeJson(path.join(REPORTS_DIR, 'cras-d-action-cards.json'), backlog);

    const md = [
      '# CRAS-D 高置信行动卡',
      '',
      `- 来源: reports/cras-d-research-strategy-summary.json`,
      `- 生成时间: ${backlog.generatedAt}`,
      `- 根任务: ${backlog.rootTask.title}`,
      '',
      '## 行动卡列表',
      ''
    ];
    for (const card of backlog.cards) {
      md.push(`### ${card.id}. ${card.title}`);
      md.push(`- 优先级: ${card.priority}`);
      md.push(`- Owner: ${card.owner}`);
      md.push(`- 本地缺口: ${card.local_gap}`);
      md.push(`- 验证: ${card.verification}`);
      md.push(`- memory/tasks: \`${card.memory_task}\``);
      md.push(`- dto task: \`${card.dto_task}\``);
      md.push(`- close-loop: \`${card.close_loop}\``);
      md.push(`- 验证命令:`);
      for (const cmd of card.validation_commands) md.push(`  - \`${cmd}\``);
      md.push('');
    }
    writeText(path.join(REPORTS_DIR, 'cras-d-action-cards.md'), md.join('\n'));
    appendTracker(actionCards);
  }

  console.log(JSON.stringify({
    ok: true,
    checkOnly,
    count: actionCards.length,
    outputs: {
      backlogJson: 'reports/cras-d-action-cards.json',
      backlogMd: 'reports/cras-d-action-cards.md'
    },
    cards: backlog.cards
  }, null, 2));
}

main();
