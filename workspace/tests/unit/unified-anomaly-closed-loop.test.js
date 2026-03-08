'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const WORKSPACE = '/root/.openclaw/workspace';
const HANDLER = require('../../infrastructure/event-bus/handlers/global-event-escalation');

const TASKS_FILE = path.join(WORKSPACE, 'infrastructure', 'dispatcher', 'state', 'auto-repair-tasks.json');
const REVIEWS_FILE = path.join(WORKSPACE, 'infrastructure', 'dispatcher', 'state', 'auto-repair-reviews.json');
const EXECUTIONS_FILE = path.join(WORKSPACE, 'infrastructure', 'logs', 'auto-repair-executions.jsonl');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}

function readJsonlCount(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).length;
  } catch (_) {
    return 0;
  }
}

async function run() {
  const beforeTasks = readJson(TASKS_FILE, { items: [] });
  const beforeReviews = readJson(REVIEWS_FILE, { items: [] });
  const beforeExecCount = readJsonlCount(EXECUTIONS_FILE);

  const modules = [
    { type: 'isc.system.error', component: 'ISC' },
    { type: 'cras.pipeline.warning', component: 'CRAS' },
    { type: 'aeo.eval.failed', component: 'AEO' },
    { type: 'lep.executor.risk', component: 'LEP' },
    { type: 'dispatcher.route.failed', component: 'dispatcher' },
    { type: 'event-bus.health.failed', component: 'event-bus' },
    { type: 'observability.alert.error', component: 'observability' },
    { type: 'health.check.failed', component: 'health' },
    { type: 'manual-queue.backlog.warning', component: 'manual-queue' },
    { type: 'route-failure.detected', component: 'route-failure' },
  ];

  const taskIds = [];
  const reviewIds = [];

  for (const mod of modules) {
    const res = await HANDLER({
      id: `evt_${mod.component.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}`,
      type: mod.type,
      payload: {
        component: mod.component,
        entityType: 'subsystem',
        entityId: `${mod.component}-${Date.now()}`,
        severity: 'error',
        reason: `${mod.component} anomaly for closed-loop validation`,
        sandbox: true,
      },
    }, { id: 'test-closed-loop-unified' }, {});

    assert.strictEqual(res.success, true, `${mod.component} should close loop successfully`);
    assert.strictEqual(res.sandbox, true, `${mod.component} should default sandbox=true`);
    assert.strictEqual(res.status, 'verified', `${mod.component} should end verified`);
    taskIds.push(res.taskId);
    reviewIds.push(res.reviewId);
  }

  const afterTasks = readJson(TASKS_FILE, { items: [] });
  const afterReviews = readJson(REVIEWS_FILE, { items: [] });
  const afterExecCount = readJsonlCount(EXECUTIONS_FILE);

  const createdTasks = afterTasks.items.filter(item => taskIds.includes(item.id));
  const createdReviews = afterReviews.items.filter(item => reviewIds.includes(item.id));
  const execDelta = afterExecCount - beforeExecCount;

  assert.strictEqual(createdTasks.length, modules.length, `expected ${modules.length} created tasks, got ${createdTasks.length}`);
  assert.strictEqual(createdReviews.length, modules.length, `expected ${modules.length} created reviews, got ${createdReviews.length}`);
  assert.ok(execDelta >= modules.length, `expected >= ${modules.length} executions added, got ${execDelta}`);

  const recentTasks = createdTasks;
  for (const task of recentTasks) {
    assert.strictEqual(task.sandbox, true, 'task should default sandbox verification');
    assert.ok(task.runbook.dispatch.includes('global event escalated as P1 source'));
    assert.ok(task.runbook.dispatch.includes('create auto repair work item'));
    assert.ok(task.runbook.dispatch.includes('assign remediation owner'));
    assert.ok(task.runbook.repair.includes('execute sandbox auto remediation'));
    assert.ok(task.runbook.verify.includes('validate alert/risk cleared in sandbox'));
    assert.ok(task.runbook.verify.includes('confirm subsystem health restored'));
    assert.ok(task.runbook.review.includes('record automatic review artifact'));
    assert.ok(task.runbook.review.includes('append observability evidence'));
    assert.ok(task.lifecycle.dispatchedAt, 'dispatchedAt should exist');
    assert.ok(task.lifecycle.repairedAt, 'repairedAt should exist');
    assert.ok(task.lifecycle.verifiedAt, 'verifiedAt should exist');
    assert.ok(task.lifecycle.reviewedAt, 'reviewedAt should exist');
  }

  console.log('unified anomaly closed-loop test passed');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
