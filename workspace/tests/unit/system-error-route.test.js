'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const dispatcher = require('../../infrastructure/dispatcher/dispatcher');

const WORKSPACE = '/root/.openclaw/workspace';
const ALERTS_FILE = path.join(WORKSPACE, 'infrastructure', 'logs', 'alerts.jsonl');
const HANDLER_FILE = path.join(WORKSPACE, 'infrastructure', 'dispatcher', 'handlers', 'notify-alert.js');

async function run() {
  assert.ok(fs.existsSync(HANDLER_FILE), 'dispatcher notify-alert alias should exist');

  const before = fs.existsSync(ALERTS_FILE)
    ? fs.readFileSync(ALERTS_FILE, 'utf8').trim().split('\n').filter(Boolean).length
    : 0;

  const result = await dispatcher.dispatch(
    { action: 'system.error', id: 'route-system-error-test' },
    {
      id: 'evt_system_error_route_test',
      type: 'system.error',
      payload: {
        message: 'dispatcher route hit probe',
        severity: 'high',
        source: 'unit-test'
      }
    }
  );

  assert.strictEqual(result.success, true, 'dispatcher should report system.error dispatch success');
  assert.strictEqual(result.handler, 'notify-alert');

  const after = fs.existsSync(ALERTS_FILE)
    ? fs.readFileSync(ALERTS_FILE, 'utf8').trim().split('\n').filter(Boolean).length
    : 0;

  assert.ok(after > before, 'system.error should append alert log entry via notify-alert');

  const lines = fs.readFileSync(ALERTS_FILE, 'utf8').trim().split('\n').filter(Boolean);
  const last = JSON.parse(lines[lines.length - 1]);
  assert.strictEqual(last.handler, 'notify-alert');
  assert.strictEqual(last.eventType, 'system.error');

  console.log('system.error notify-alert alias test: ok');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
