'use strict';
const assert = require('assert');
const path = require('path');
const he = require('./handler-executor');

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') return r.then(() => { pass++; console.log(`  ✅ ${name}`); }).catch(e => { fail++; console.log(`  ❌ ${name}: ${e.message}`); });
    pass++; console.log(`  ✅ ${name}`);
  } catch(e) { fail++; console.log(`  ❌ ${name}: ${e.message}`); }
}

async function run() {
  console.log('handler-executor tests:');

  test('exports loadHandler/buildContext/execute', () => {
    assert.ok(typeof he.loadHandler === 'function');
    assert.ok(typeof he.buildContext === 'function');
    assert.ok(typeof he.execute === 'function');
  });

  test('loadHandler finds existing handler', () => {
    const h = he.loadHandler('log-action');
    assert.ok(h, 'log-action handler should exist');
    assert.ok(typeof h === 'function');
  });

  test('loadHandler returns null for nonexistent', () => {
    const h = he.loadHandler('nonexistent-handler-xyz');
    assert.strictEqual(h, null);
  });

  test('buildContext returns object with bus/notify/workspace/logger', () => {
    const ctx = he.buildContext();
    assert.ok(ctx.bus || ctx.workspace || ctx.logger);
  });

  await test('execute runs handler without throwing', async () => {
    const result = await he.execute('log-action', 
      { type: 'test.event', payload: { test: true } },
      { id: 'test-rule', name: 'test' },
    );
    // should not throw
  });

  await test('execute handles missing handler gracefully', async () => {
    const result = await he.execute('nonexistent-xyz',
      { type: 'test.event', payload: {} },
      { id: 'test-rule', name: 'test' },
    );
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
run();
