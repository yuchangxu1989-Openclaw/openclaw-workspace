#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');
const { ReportTrigger } = require('../report-trigger');

class MockEngine extends EventEmitter {
  constructor() {
    super();
    this._state = { spawning: {}, running: {}, queued: {}, finished: [], eventLog: [] };
  }
  _load() { return this._state; }
}

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

test('report only counts true running tasks with model as active', () => {
  const engine = new MockEngine();
  engine._state.spawning['spawn-1'] = { taskId: 'spawn-1', title: 'Spawning only', status: 'spawning', model: 'gpt-4o', agentId: 'coder' };
  engine._state.running['run-1'] = { taskId: 'run-1', title: 'Real running', status: 'running', model: 'gpt-4o', agentId: 'coder', runningAt: new Date().toISOString() };
  engine._state.running['run-2'] = { taskId: 'run-2', title: 'No model running', status: 'running', model: null, agentId: 'coder', runningAt: new Date().toISOString() };

  const trigger = new ReportTrigger(engine, {});
  const report = trigger.buildReport('manual');

  assert.strictEqual(report.title, 'Agent并行总数：1');
  assert.ok(report.text.includes('Real running'));
  assert.ok(!report.text.includes('Spawning only'));
  assert.ok(!report.text.includes('No model running'));
  trigger.detach();
});

if (!process.exitCode) {
  console.log('ALL PASSED');
}
